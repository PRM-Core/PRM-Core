import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  Mail,
  Phone,
  IdCard,
  Calendar,
  MoreHorizontal,
  CalendarPlus,
  MessageSquare,
  MessageSquareText,
  Reply,
  Send,
  MousePointerClick,
  MailOpen,
  Stethoscope,
  NotebookPen,
  Plus,
  BarChart3,
  Inbox,
  LayoutGrid,
  TrendingUp,
  Activity,
  Globe,
  FileText,
  Sparkles,
  Bot,
  Workflow,
  Smartphone,
  Bell,
  Download,
  Upload,
  CheckCircle2,
  Clock,
  Zap,
  Settings2,
  Loader2,
  Save,
  Pencil,
  GitBranch,
  SkipForward,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  Copy,
  Trash2,
  ExternalLink,
} from "lucide-react";
import type { ComponentType } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PatientPlansCard } from "@/components/care/PatientPlansCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/content-builder/TagInput";
import { SegmentPicker } from "@/components/segments/SegmentPicker";
import { toast } from "sonner";
import { activities, type ActivityType } from "@/lib/mock-data";
import { newestFirst } from "@/lib/activity-date";
import { getSmsActivityForContact, type SmsActivityItem } from "@/lib/api/phone-contacts.functions";
import { getContactRuns, type ContactRunView } from "@/lib/api/engine.functions";
import {
  getContactDocuments,
  uploadContactDocument,
  removeContactDocument,
  type DocumentView,
} from "@/lib/api/documents.functions";
import { generateContactSummary, askContactAgent } from "@/lib/api/contact-agent.functions";
import type { Contact, ContactStatus } from "@/lib/contacts";
import { getContactById, updateContact, deleteContacts } from "@/lib/api/contacts.functions";
import type { Funnel } from "@/lib/funnels";
import {
  getAllFunnels,
  getContactFunnelProgress,
  setContactFunnelProgress,
} from "@/lib/api/funnels.functions";
import { getEmailActivityForContact, type EmailActivityItem } from "@/lib/api/email.functions";
import { getPageVisitsForContact, type PageVisitActivityItem } from "@/lib/api/tracking.functions";
import {
  getNotesForContact,
  createNote,
  type ContactNote,
  type NoteSource,
} from "@/lib/api/notes.functions";
import {
  getInboxMessagesForContact,
  startInboxThread,
  type ContactMessage,
} from "@/lib/api/inbox.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InboxChannel } from "@/lib/db/schema";
import {
  getEngineActivityForContact,
  type EngineActivityItem,
  type EngineActivityKind,
} from "@/lib/api/engine.functions";
import { getContactFields, type ContactFieldDef } from "@/lib/api/contact-fields.functions";
import { getVisitsForContact, type VisitActivityItem } from "@/lib/api/visits.functions";
import { getContactStats, type ContactStats } from "@/lib/api/contact-stats.functions";
import {
  getActiveConsentDefs,
  getContactExtraConsents,
  type ConsentDef,
} from "@/lib/api/consent.functions";
import { intlLocale, t as tr, localized } from "@/lib/i18n";

/** Buckets the activity timeline is sorted into. Order here is the order shown. */
const ACTIVITY_CATEGORIES = [
  "Rejestracja",
  "Aktywność on-line",
  "Komunikacja",
  "Automatyzacje",
  "Inne",
] as const;
type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

type TimelineType = ActivityType | EngineActivityKind | "message_in" | "message_out";

/** How many timeline entries load at once — roughly two screens of the scroll pane. */
const TIMELINE_PAGE_SIZE = 20;

/**
 * Which bucket each kind of entry belongs to.
 *
 * The line that needed a decision is opens and clicks: they are reactions to a
 * message, but what they record is the patient *doing* something, so they sit
 * with page visits under on-line activity. "Komunikacja" is what was actually
 * said — in either direction.
 */
const ACTIVITY_CATEGORY: Record<TimelineType, ActivityCategory> = {
  signup: "Rejestracja",
  visit: "Rejestracja",

  page_visit: "Aktywność on-line",
  open: "Aktywność on-line",
  click: "Aktywność on-line",

  email: "Komunikacja",
  sms: "Komunikacja",
  message_in: "Komunikacja",
  message_out: "Komunikacja",

  engine_run: "Automatyzacje",
  engine_action: "Automatyzacje",
  engine_condition: "Automatyzacje",
  engine_delay: "Automatyzacje",
  engine_ai: "Automatyzacje",
  engine_skipped: "Automatyzacje",
  engine_error: "Automatyzacje",

  note: "Inne",
};

/**
 * Adres do odnośnika — albo nic.
 *
 * Wpuszczamy wyłącznie http i https. Adres pochodzi z danych śledzenia, więc
 * teoretycznie mógłby nieść `javascript:`; przepuszczenie takiego do `href`
 * oznaczałoby wykonanie cudzego kodu w zalogowanej sesji recepcji.
 */
function safeUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Skąd wzięła się notatka — pokazywane, gdy sama treść jest jednolinijkowa. */
/** Kolory i nazwy statusów przebiegu — te same słowa co w panelu silnika. */
const RUN_TONE: Record<string, string> = {
  running: "bg-primary-soft text-primary",
  waiting: "bg-warning/15 text-warning-foreground",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  stopped: "bg-muted text-muted-foreground",
};
const RUN_LABELS: Record<string, string> = localized(() => ({
  running: tr("W trakcie"),
  waiting: tr("Czeka"),
  completed: tr("Zakończona"),
  failed: tr("Błąd"),
  stopped: tr("Zatrzymana"),
}));

const NOTE_SOURCE: Record<NoteSource, string> = localized(() => ({
  manual: tr("Notatka wpisana ręcznie"),
  survey: tr("Odpowiedzi z ankiety"),
  form: tr("Wypełniony formularz"),
  import: tr("Z importu CSV"),
}));

/** Krótka etykieta przy notatce — mówi, skąd pochodzi, więc musi znać każdy rodzaj. */
const NOTE_BADGE: Record<NoteSource, string> = localized(() => ({
  manual: "",
  survey: tr("Ankieta"),
  form: tr("Formularz"),
  import: tr("Import"),
}));

/** The editable half of a contact. `prmId` and `createdAt` are identity, so they stay out. */
interface ContactDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  pesel: string;
  status: ContactStatus;
  source: string;
  medium: string;
  campaign: string;
  tags: string[];
  segments: string[];
  consentEmail: boolean;
  consentSms: boolean;
  consentProfiling: boolean;
  /** Answers to consents the clinic added in Engage → Consent & RODO. */
  extraConsents: Record<string, boolean>;
  /** Values of fields the clinic added in Ustawienia → Tabele / Dane. */
  customFields: Record<string, string>;
}

function draftFrom(c: Contact, extraConsents: Record<string, boolean> = {}): ContactDraft {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    pesel: c.pesel,
    status: c.status,
    source: c.source,
    medium: c.medium,
    campaign: c.campaign,
    tags: [...(c.tags ?? [])],
    segments: [...(c.segments ?? [])],
    consentEmail: c.consentEmail === 1,
    consentSms: c.consentSms === 1,
    consentProfiling: c.consentProfiling === 1,
    extraConsents: { ...extraConsents },
    customFields: { ...(c.customFields ?? {}) },
  };
}

/** Stable string for the dirty check — key order must not decide whether a form looks edited. */
function stableEntries(record: Record<string, string | boolean>): string {
  return Object.keys(record)
    .sort()
    .map((k) => `${k}=${record[k]}`)
    .join("|");
}

/** Whether the form still matches what was loaded — drives the "unsaved changes" bar. */
function sameDraft(a: ContactDraft, b: ContactDraft): boolean {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.email === b.email &&
    a.phone === b.phone &&
    a.pesel === b.pesel &&
    a.status === b.status &&
    a.source === b.source &&
    a.medium === b.medium &&
    a.campaign === b.campaign &&
    a.tags.join(" ") === b.tags.join(" ") &&
    a.segments.join(" ") === b.segments.join(" ") &&
    // Consents belong in the dirty check like any other field — without them
    // a flipped switch looks saved while the form still thinks it is clean.
    a.consentEmail === b.consentEmail &&
    a.consentSms === b.consentSms &&
    a.consentProfiling === b.consentProfiling &&
    stableEntries(a.extraConsents) === stableEntries(b.extraConsents) &&
    stableEntries(a.customFields) === stableEntries(b.customFields)
  );
}

const STATUS_LABELS: Record<ContactStatus, string> = {
  active: "Aktywny",
  lead: "Lead",
  patient: "Pacjent",
  inactive: "Nieaktywny",
};

const CHANNEL_LABELS: Record<InboxChannel, string> = {
  email: "E-mail",
  sms: "SMS",
  form: "Formularz",
  survey: "Ankieta",
};

export const Route = createFileRoute("/contacts/$id")({
  head: () => ({
    meta: [{ title: tr("Kontakt — PRM Core") }],
  }),
  component: ContactDetail,
  notFoundComponent: ContactNotFound,
});

function ContactNotFound() {
  return (
    <div className="p-10 text-center">
      <p className="text-sm text-muted-foreground">{tr("Kontakt nie został znaleziony.")}</p>
      <Link to="/contacts" className="text-primary text-sm hover:underline">
        {tr("Wróć do listy")}
      </Link>
    </div>
  );
}

const activityMeta: Record<
  ActivityType | EngineActivityKind | "message_in" | "message_out",
  { icon: ComponentType<{ className?: string }>; tone: string }
> = {
  // Inbox conversation, both ways — an incoming message is the one entry on
  // this timeline that may still be waiting for a human.
  message_in: { icon: MessageSquareText, tone: "bg-primary/15 text-primary" },
  message_out: { icon: Reply, tone: "bg-muted text-muted-foreground" },
  signup: { icon: Stethoscope, tone: "bg-primary-soft text-primary" },
  sms: { icon: MessageSquare, tone: "bg-accent text-accent-foreground" },
  email: { icon: Send, tone: "bg-primary-soft text-primary" },
  open: { icon: MailOpen, tone: "bg-success/15 text-success" },
  click: { icon: MousePointerClick, tone: "bg-warning/20 text-warning-foreground" },
  visit: { icon: CalendarPlus, tone: "bg-primary-soft text-primary" },
  note: { icon: NotebookPen, tone: "bg-muted text-muted-foreground" },
  page_visit: { icon: Globe, tone: "bg-cyan-100 text-cyan-700" },
  // PRM Engine steps — one look per kind, so a failed step never reads like a
  // successful one at a glance.
  engine_run: { icon: Zap, tone: "bg-primary-soft text-primary" },
  engine_action: { icon: Workflow, tone: "bg-primary-soft text-primary" },
  engine_condition: { icon: GitBranch, tone: "bg-muted text-muted-foreground" },
  engine_delay: { icon: Clock, tone: "bg-muted text-muted-foreground" },
  engine_ai: { icon: Bot, tone: "bg-accent text-accent-foreground" },
  engine_skipped: { icon: SkipForward, tone: "bg-muted text-muted-foreground" },
  engine_error: { icon: AlertTriangle, tone: "bg-destructive/15 text-destructive" },
};

function ContactDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getContactById({ data: { id } }).then((c) => {
      if (!cancelled) setContact(c);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Obie historie są kluczowane adresem e-mail, więc pacjent bez adresu nie ma
  // ich z czego zbudować — i nie ma o co pytać. Zapytanie z pustym adresem
  // odbiłoby się o walidator (`z.string().email()`) i wywróciło zakładkę
  // aktywności zamiast pokazać ją pustą.
  const [emailActivity, setEmailActivity] = useState<EmailActivityItem[]>([]);
  useEffect(() => {
    if (!contact?.email) {
      setEmailActivity([]);
      return;
    }
    getEmailActivityForContact({ data: { email: contact.email } }).then(setEmailActivity);
  }, [contact?.email]);

  const [pageVisits, setPageVisits] = useState<PageVisitActivityItem[]>([]);
  useEffect(() => {
    if (!contact?.email) {
      setPageVisits([]);
      return;
    }
    getPageVisitsForContact({ data: { email: contact.email } }).then(setPageVisits);
  }, [contact?.email]);

  // What PRM Engine did to this contact — keyed on contactId, unlike the email
  // and visit sources above, which can only be joined by address.
  const [engineActivity, setEngineActivity] = useState<EngineActivityItem[]>([]);
  useEffect(() => {
    if (!contact) return;
    getEngineActivityForContact({ data: { contactId: contact.id } }).then(setEngineActivity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  // Real per-contact figures for the Statistics tab.
  const [agentTurns, setAgentTurns] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [agentQuestion, setAgentQuestion] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentCost, setAgentCost] = useState<number | null>(null);

  async function handleSummary() {
    if (!contact) return;
    setAgentBusy(true);
    const result = await generateContactSummary({ data: { contactId: contact.id } });
    setAgentBusy(false);
    if (!result.ok || !result.text) {
      toast.error(tr("PRM_Agent nie odpowiedział"), { description: result.error });
      return;
    }
    // Podsumowanie zaczyna rozmowę od nowa — inaczej „podsumuj ponownie"
    // doklejałoby kolejne wersje pod poprzednimi pytaniami i nikt by nie wiedział,
    // która jest aktualna.
    setAgentTurns([{ role: "assistant", text: result.text }]);
    setAgentCost(result.costUsd ?? null);
  }

  async function handleAsk() {
    if (!contact || !agentQuestion.trim()) return;
    const next = [...agentTurns, { role: "user" as const, text: agentQuestion.trim() }];
    setAgentTurns(next);
    setAgentQuestion("");
    setAgentBusy(true);
    const result = await askContactAgent({ data: { contactId: contact.id, history: next } });
    setAgentBusy(false);
    if (!result.ok || !result.text) {
      toast.error(tr("PRM_Agent nie odpowiedział"), { description: result.error });
      return;
    }
    setAgentTurns([...next, { role: "assistant", text: result.text }]);
    setAgentCost(result.costUsd ?? null);
  }

  const [documents, setDocuments] = useState<DocumentView[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  const refreshDocuments = () => {
    if (!contact) return;
    getContactDocuments({ data: { contactId: contact.id } }).then(setDocuments);
  };
  useEffect(() => {
    refreshDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  async function handleUpload(file: File) {
    if (!contact) return;
    setUploading(true);
    try {
      // base64 przez FileReader: plik idzie warstwą RPC, która przenosi JSON,
      // a nie multipart. Przy limicie 20 MB narzut kodowania jest do przyjęcia.
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error(tr("Nie udało się odczytać pliku.")));
        reader.readAsDataURL(file);
      });
      const result = await uploadContactDocument({
        data: {
          contactId: contact.id,
          fileName: file.name,
          mimeType: file.type,
          contentBase64,
          note: "",
        },
      });
      if (!result.ok) {
        toast.error(tr("Nie udało się wgrać dokumentu"), { description: result.error });
        return;
      }
      toast.success(tr("Dokument wgrany."));
      refreshDocuments();
    } catch (err) {
      toast.error(tr("Nie udało się wgrać dokumentu"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDocument(id: string, fileName: string) {
    if (
      !window.confirm(tr('Usunąć „{fileName}"? Pliku nie da się odzyskać.', { fileName: fileName }))
    )
      return;
    const result = await removeContactDocument({ data: { id } });
    if (!result.ok) {
      toast.error(tr("Nie udało się usunąć"), { description: result.error });
      return;
    }
    toast.success(tr("Dokument usunięty."));
    refreshDocuments();
  }

  const [runs, setRuns] = useState<ContactRunView[] | null>(null);
  useEffect(() => {
    if (!contact) return;
    getContactRuns({ data: { contactId: contact.id } }).then(setRuns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  const [stats, setStats] = useState<ContactStats | null>(null);
  useEffect(() => {
    if (!contact) return;
    getContactStats({ data: { contactId: contact.id } }).then(setStats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  // Visits booked online. Keyed on contactId like the engine's own entries —
  // the booking collector already resolved who the patient is.
  const [visits, setVisits] = useState<VisitActivityItem[]>([]);
  useEffect(() => {
    if (!contact) return;
    getVisitsForContact({ data: { contactId: contact.id } }).then(setVisits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  // Wysłane SMS-y. Osobne od skrzynki, bo wysyłka kampanijna nie jest rozmową
  // — patrz komentarz przy `recordOutboundMessage`.
  const [smsActivity, setSmsActivity] = useState<SmsActivityItem[]>([]);
  useEffect(() => {
    if (!contact) return;
    getSmsActivityForContact({ data: { contactId: contact.id } }).then(setSmsActivity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  // The inbox conversation. One fetch serves both the timeline below and the
  // "Wiadomości" tab, which used to show three invented rows.
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  useEffect(() => {
    if (!contact) return;
    getInboxMessagesForContact({ data: { contactId: contact.id } }).then(setMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  // Notatki są jednocześnie osobną zakładką i pozycją na osi czasu, i to nie
  // jest dublowanie: zakładka służy do czytania i dopisywania, oś odpowiada na
  // pytanie „co się z tym pacjentem działo”. Wypełniony test słuchu, odpowiedzi
  // z ankiety i formularz z pop-upu trafiają właśnie do notatek — dopóki oś ich
  // nie pokazywała, największe zdarzenia w historii pacjenta były na niej
  // niewidoczne.
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const refreshNotes = () => {
    if (!contact) return;
    getNotesForContact({ data: { contactId: contact.id } }).then(setNotes);
  };
  useEffect(() => {
    refreshNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  const timeline = contact
    ? [
        ...activities.filter((a) => a.contactId === contact.id),
        ...emailActivity,
        ...pageVisits,
        ...visits,
        ...engineActivity,
        ...smsActivity,
        ...notes.map((n) => {
          // Pierwsza linia notatki jest jej tytułem — kolektory piszą tam nazwę
          // zdarzenia („Test kwalifikacyjny «Razem dla Słuchu» — data”), a
          // odpowiedzi idą niżej. Reszta zostaje w opisie, żeby oś dało się
          // przejrzeć wzrokiem, nie czytając każdej ankiety w całości.
          const [head, ...rest] = n.text.split("\n");
          const body = rest.join(" · ").trim();
          return {
            id: `note-${n.id}`,
            type: "note" as const,
            title: head.trim() || tr("Notatka"),
            description:
              body.length > 160 ? `${body.slice(0, 159)}…` : body || NOTE_SOURCE[n.source],
            date: n.date,
          };
        }),
        ...messages.map((m) => ({
          id: `msg-${m.id}`,
          type: (m.direction === "in" ? "message_in" : "message_out") as
            | "message_in"
            | "message_out",
          title: m.body.length > 200 ? `${m.body.slice(0, 199)}…` : m.body,
          description:
            m.direction === "in"
              ? tr("Wiadomość od pacjenta — {v0}", { v0: CHANNEL_LABELS[m.channel] })
              : tr("Wysłano — {v0}{v1}", {
                  v0: CHANNEL_LABELS[m.channel],
                  v1: m.source === "agent" ? tr(" (PRM_Agent)") : "",
                }),
          date: m.date,
        })),
      ].sort(newestFirst)
    : [];

  /**
   * Wszystkie wiadomości w jednym miejscu.
   *
   * Skrzynka odpowiada za rozmowy, ale wysyłki kampanijne celowo do niej nie
   * trafiają (patrz `recordOutboundMessage`) — a pacjentowi jest wszystko jedno,
   * którym mechanizmem coś do niego poszło. Zakładka scala trzy źródła i sortuje
   * je jak oś czasu, tym samym porównaniem napisów.
   */
  const allMessages = contact
    ? [
        ...messages.map((m) => ({
          id: `inbox-${m.id}`,
          direction: m.direction,
          channel: m.channel,
          title: m.body,
          meta: `${CHANNEL_LABELS[m.channel]}${m.source === "agent" ? " · PRM_Agent" : ""}`,
          date: m.date,
          threadLink: true,
        })),
        ...emailActivity
          .filter((e) => e.type === "email")
          .map((e) => ({
            id: e.id,
            direction: "out" as const,
            channel: "email" as const,
            title: e.title,
            meta: e.description,
            date: e.date,
            threadLink: false,
          })),
        ...smsActivity.map((sms) => ({
          id: sms.id,
          direction: "out" as const,
          channel: "sms" as const,
          title: sms.title,
          meta: sms.description,
          date: sms.date,
          threadLink: false,
        })),
      ].sort(newestFirst)
    : [];

  const [activityCategory, setActivityCategory] = useState<ActivityCategory | "all">("all");
  const categoryCounts = ACTIVITY_CATEGORIES.map((category) => ({
    category,
    count: timeline.filter((a) => ACTIVITY_CATEGORY[a.type as TimelineType] === category).length,
  }));
  // Filtering rather than splitting into five headed sections: chronology is
  // most of what a timeline is for, and a patient's story reads wrong when a
  // reply from Tuesday sits under a visit from March.
  const visibleTimeline =
    activityCategory === "all"
      ? timeline
      : timeline.filter((a) => ACTIVITY_CATEGORY[a.type as TimelineType] === activityCategory);

  // Rendered a page at a time. A contact with a long history is the normal case
  // after a few months of automations, and rendering all of it means a card
  // metres long — the scroll pane caps the height, this caps the DOM.
  const [timelinePage, setTimelinePage] = useState(1);
  useEffect(() => {
    setTimelinePage(1);
  }, [activityCategory, contact?.id]);
  const shownTimeline = visibleTimeline.slice(0, timelinePage * TIMELINE_PAGE_SIZE);
  const hasMoreTimeline = shownTimeline.length < visibleTimeline.length;

  /** Loads the next page as the pane nears its end, so scrolling usually suffices. */
  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMoreTimeline) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      setTimelinePage((p) => p + 1);
    }
  };

  // ── the editable draft ────────────────────────────────────────────────────
  // Edits live here until somebody presses "Zapisz". Nothing on this card
  // writes as you type: a half-entered phone number must not reach the database,
  // and — because saving emits contact.field_changed — must not reach the
  // automation engine either.
  const [draft, setDraft] = useState<ContactDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function runDelete() {
    if (!contact) return;
    setDeleting(true);
    try {
      const result = await deleteContacts({ data: { ids: [contact.id] } });
      if (!result.ok) {
        toast.error(result.errors[0] ?? tr("Nie udało się usunąć pacjenta."));
        setDeleting(false);
        return;
      }
      toast.success(tr("Usunięto pacjenta: {v0}", { v0: result.deleted[0] ?? "" }).trim());
      // Karty już nie ma, więc zostawanie na niej pokazałoby „nie znaleziono".
      void navigate({ to: "/contacts" });
    } catch {
      toast.error(tr("Nie udało się usunąć pacjenta — spróbuj ponownie."));
      setDeleting(false);
    }
  }

  // What the card shows and under what name — configured in Ustawienia →
  // Tabele / Dane, so nothing about this layout is hardcoded any more.
  const [fieldDefs, setFieldDefs] = useState<ContactFieldDef[]>([]);
  const [consentDefs, setConsentDefs] = useState<ConsentDef[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getContactFields(), getActiveConsentDefs()]).then(([fields, consents]) => {
      if (cancelled) return;
      setFieldDefs(fields.fields);
      setConsentDefs(consents);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Answers to the added consents live in their own table, so they arrive
  // separately from the contact row and are merged into the same draft.
  const [extraConsents, setExtraConsents] = useState<Record<string, boolean>>({});
  const [extraConsentsLoaded, setExtraConsentsLoaded] = useState(false);
  useEffect(() => {
    if (!contact) return;
    let cancelled = false;
    getContactExtraConsents({ data: { contactId: contact.id } }).then((values) => {
      if (cancelled) return;
      setExtraConsents(values);
      setExtraConsentsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  useEffect(() => {
    setDraft(contact ? draftFrom(contact, extraConsents) : null);
  }, [contact, extraConsents]);

  const dirty = !!contact && !!draft && !sameDraft(draft, draftFrom(contact, extraConsents));

  const setField = (
    key: keyof ContactDraft,
    value: string | string[] | boolean | Record<string, string> | Record<string, boolean>,
  ) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const setCustomField = (key: string, value: string) =>
    setDraft((d) => (d ? { ...d, customFields: { ...d.customFields, [key]: value } } : d));

  const setExtraConsent = (key: string, value: boolean) =>
    setDraft((d) => (d ? { ...d, extraConsents: { ...d.extraConsents, [key]: value } } : d));

  const handleSave = async () => {
    if (!contact || !draft) return;
    setSaving(true);
    const result = await updateContact({ data: { id: contact.id, ...draft } });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? tr("Nie udało się zapisać zmian."));
      return;
    }
    const [fresh, freshConsents] = await Promise.all([
      getContactById({ data: { id: contact.id } }),
      getContactExtraConsents({ data: { contactId: contact.id } }),
    ]);
    setExtraConsents(freshConsents);
    setContact(fresh);
    setEditing(false);
    toast.success(
      result.changed.length > 0
        ? tr("Zapisano zmiany ({length} {v1}).", {
            length: result.changed.length,
            v1: result.changed.length === 1 ? "pole" : "pola",
          })
        : tr("Brak zmian do zapisania."),
    );
  };

  const handleCancelEdit = () => {
    if (contact) setDraft(draftFrom(contact, extraConsents));
    setEditing(false);
  };

  // Closing the tab mid-edit is the one way to lose work that the save bar
  // cannot warn about on its own.
  useEffect(() => {
    if (!dirty || !editing) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, editing]);

  // "Email"/"SMS" in the header hand the conversation over to the inbox, which
  // is the one place a message to a patient is composed, gated and recorded.
  const [opening, setOpening] = useState<"email" | "sms" | null>(null);
  const openConversation = async (channel: "email" | "sms") => {
    if (!contact) return;
    setOpening(channel);
    const result = await startInboxThread({ data: { contactId: contact.id, channel } });
    setOpening(null);
    if (!result.ok || !result.threadId) {
      toast.error(result.error ?? tr("Nie udało się otworzyć rozmowy."));
      return;
    }
    navigate({ to: "/inbox", search: { thread: result.threadId } });
  };

  const [newNote, setNewNote] = useState("");
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [funnelId, setFunnelId] = useState("");
  const [stageIndex, setStageIndex] = useState(0);
  const [funnelReady, setFunnelReady] = useState(false);
  /** Undefined when the contact is on no funnel — NOT "the first one in the list". */
  const activeFunnel = funnels.find((f) => f.id === funnelId);

  useEffect(() => {
    if (!contact) return;
    let cancelled = false;
    (async () => {
      const [list, progress] = await Promise.all([
        getAllFunnels(),
        getContactFunnelProgress({ data: { contactId: contact.id } }),
      ]);
      if (cancelled) return;
      setFunnels(list);
      setFunnelId(progress.funnelId);
      setStageIndex(progress.stageIndex);
      setFunnelReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  /**
   * Funnel changes are saved when somebody makes one — never as a side effect
   * of the card loading. The previous version persisted on every render pass,
   * so opening a contact enrolled them in the default funnel and emitted a
   * stage-change event nobody asked for.
   */
  const persistFunnel = async (nextFunnelId: string, nextStageIndex: number) => {
    if (!contact || !funnelReady) return;
    setFunnelId(nextFunnelId);
    setStageIndex(nextStageIndex);
    await setContactFunnelProgress({
      data: { contactId: contact.id, funnelId: nextFunnelId, stageIndex: nextStageIndex },
    });
  };

  const addNote = async () => {
    if (!newNote.trim() || !contact) return;
    await createNote({ data: { contactId: contact.id, text: newNote.trim() } });
    setNewNote("");
    refreshNotes();
  };

  if (contact === undefined) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (contact === null) {
    return <ContactNotFound />;
  }

  return (
    <div className="space-y-6">
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {tr("Usunąć pacjenta ")} {contact.firstName} {contact.lastName}?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {tr("Usunięcie jest ")} <b>{tr("nieodwracalne")}</b>{" "}
                  {tr(
                    " i obejmuje całą kartotekę: notatki, wiadomości, wizyty, zgody, wgrane dokumenty i przebiegi automatyzacji tej osoby.",
                  )}
                </p>
                <p>
                  {tr(
                    "Historyczne statystyki mogą się o tę osobę zmniejszyć — jej dziennik też znika, bo dane pacjenta usuwamy naprawdę, a nie oznaczamy jako usunięte.",
                  )}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              {tr("Anuluj")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={runDelete}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}

              {tr("Usuń bezpowrotnie")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/contacts"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {tr(" Kontakty")}
        </Link>
        <div className="flex items-center gap-2">
          {/* Both open the omnichannel inbox on this patient's conversation,
              starting one if there is none. The message itself is sent from
              there, through the same consent gate and the same tracking as
              every other outgoing message. */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={opening !== null}
            onClick={() => void openConversation("email")}
          >
            {opening === "email" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}{" "}
            {tr("Email")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={opening !== null}
            onClick={() => void openConversation("sms")}
          >
            {opening === "sms" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}{" "}
            {tr("SMS")}
          </Button>
          {/* No visit module exists — the "Rejestracja wizyty" trigger still has
              no event source (it waits on the booking system), so this
              says so instead of opening something that does not work. */}
          <Button
            size="sm"
            className="gap-1.5"
            disabled
            title={tr(
              "Wizyty zapisuje system rezerwacji placówki — tu nie ma gdzie zapisać terminu.",
            )}
          >
            <CalendarPlus className="h-4 w-4" /> {tr(" Wizyta")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  void navigator.clipboard.writeText(contact.email);
                  toast.success(tr("Adres e-mail skopiowany."));
                }}
              >
                <Copy className="h-4 w-4 mr-2" /> {tr(" Kopiuj e-mail")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void navigator.clipboard.writeText(contact.prmId);
                  toast.success(tr("PRM ID skopiowane."));
                }}
              >
                <IdCard className="h-4 w-4 mr-2" /> {tr(" Kopiuj PRM ID")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/consent">
                  <ShieldCheck className="h-4 w-4 mr-2" /> {tr(" Treści zgód")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* Zwykły onClick, nie onSelect — patrz gotcha z AccountMenu:
                  otwieranie Dialogu z onSelect zamyka go natychmiast. */}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" /> {tr(" Usuń pacjenta")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Header — clean, no gradient */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-5">
            <div className="h-16 w-16 rounded-full bg-primary-soft flex items-center justify-center text-xl font-semibold text-primary">
              {contact.firstName[0]}
              {contact.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">
                {contact.firstName} {contact.lastName}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <IdCard className="h-3.5 w-3.5" />
                  {contact.prmId}
                </span>
                {/* Fixed width, scrolls inside itself — a long address must not
                    shove the phone number and the segments off the card. */}
                <span className="inline-flex min-w-0 max-w-[22rem] items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="overflow-x-auto whitespace-nowrap pb-0.5" title={contact.email}>
                    {contact.email}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {contact.phone}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contact.segments.map((s) => (
                <Badge key={s} variant="secondary" className="font-normal">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-auto p-0 bg-transparent border-b border-border w-full justify-start rounded-none gap-1">
          <TabsTrigger
            value="overview"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 gap-1.5"
          >
            <LayoutGrid className="h-4 w-4" /> {tr(" Overview")}
          </TabsTrigger>
          <TabsTrigger
            value="messages"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 gap-1.5"
          >
            <Inbox className="h-4 w-4" /> {tr(" Messages")}
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 gap-1.5"
          >
            <NotebookPen className="h-4 w-4" /> {tr(" Notes")}
          </TabsTrigger>
          <TabsTrigger
            value="statistics"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 gap-1.5"
          >
            <BarChart3 className="h-4 w-4" /> {tr(" Statistics")}
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 gap-1.5"
          >
            <FileText className="h-4 w-4" /> {tr(" Dokumenty")}
          </TabsTrigger>
          <TabsTrigger
            value="ai-resume"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 gap-1.5"
          >
            <Sparkles className="h-4 w-4" /> {tr(" PRM_Agent")}
          </TabsTrigger>
          <TabsTrigger
            value="automation"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 gap-1.5"
          >
            <Workflow className="h-4 w-4" /> {tr(" Automation")}
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <PatientFunnel
            funnels={funnels}
            funnelId={activeFunnel?.id ?? ""}
            ready={funnelReady}
            onFunnelIdChange={(v) => void persistFunnel(v, 0)}
            currentIndex={stageIndex}
            onPrev={() => void persistFunnel(funnelId, Math.max(0, stageIndex - 1))}
            onNext={() =>
              void persistFunnel(
                funnelId,
                Math.min((activeFunnel?.stages.length ?? 1) - 1, stageIndex + 1),
              )
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">{tr("Dane kontaktowe")}</CardTitle>
                {/* The card is read-only until somebody deliberately enters edit
                    mode — a page full of live inputs invites accidental typing
                    into a patient record. */}
                {editing ? (
                  <span className="text-xs text-[oklch(0.48_0.15_75)] whitespace-nowrap">
                    {dirty ? tr("Niezapisane zmiany") : tr("Tryb edycji")}
                  </span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />

                    {tr("Edytuj")}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {!draft || fieldDefs.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {/* Which fields appear here, in what order and under what
                        name, is configured in Ustawienia → Tabele / Dane. The
                        card renders the definitions; it no longer knows the
                        list by heart. */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      {fieldDefs
                        .filter((def) => def.visible)
                        // **Pola przypisane do statusu.** Puste przypisanie
                        // znaczy „wszystkie statusy" — inaczej pola sprzed tej
                        // zmiany zniknęłyby z każdej karty. Pole z wpisaną
                        // wartością pokazujemy MIMO niedopasowania statusu:
                        // ukrycie danych, które ktoś wpisał, jest cichą stratą,
                        // a przeniesienie kontaktu między statusami nie może
                        // sprawiać, że dane „znikają".
                        .filter((def) => {
                          if (def.statuses.length === 0) return true;
                          if (def.statuses.includes(draft?.status ?? "")) return true;
                          const filled = def.builtin
                            ? String((contact as unknown as Record<string, unknown>)[def.key] ?? "")
                            : (contact.customFields?.[def.key] ?? "");
                          return filled !== "";
                        })
                        .map((def) => (
                          <ContactFieldRow
                            key={def.key}
                            def={def}
                            contact={contact}
                            draft={draft}
                            editing={editing}
                            onScalar={(value) => setField(def.key as keyof ContactDraft, value)}
                            onCustom={(value) => setCustomField(def.key, value)}
                          />
                        ))}
                    </div>

                    <Separator />
                    <SubscriptionsBlock
                      defs={consentDefs}
                      draft={draft}
                      editing={editing}
                      loaded={extraConsentsLoaded}
                      source={contact.consentSource}
                      updatedAt={contact.consentUpdatedAt}
                      onBuiltin={(key, value) => setField(key, value)}
                      onExtra={setExtraConsent}
                    />

                    {editing && (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          disabled={saving || !dirty}
                          onClick={() => void handleSave()}
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                          ) : (
                            <Save className="h-4 w-4 mr-1.5" />
                          )}

                          {tr("Zapisz")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={handleCancelEdit}
                        >
                          {tr("Anuluj")}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm lg:col-span-2">
              <CardHeader className="gap-3">
                <CardTitle className="text-base">{tr("Aktywności")}</CardTitle>
                {timeline.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setActivityCategory("all")}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        activityCategory === "all"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {tr("Wszystkie ")} {timeline.length}
                    </button>
                    {/* An empty bucket stays visible but disabled — "no messages
                        yet" is information, and a chip that vanishes makes the
                        row jump around as history accumulates. */}
                    {categoryCounts.map(({ category, count }) => (
                      <button
                        key={category}
                        disabled={count === 0}
                        onClick={() => setActivityCategory(category)}
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          activityCategory === category
                            ? "border-primary bg-primary text-primary-foreground"
                            : count === 0
                              ? "border-border/40 text-muted-foreground/40 cursor-default"
                              : "border-border/60 text-muted-foreground hover:bg-muted/60"
                        }`}
                      >
                        {tr(category)} {count}
                      </button>
                    ))}
                  </div>
                )}
              </CardHeader>
              {/* The timeline is a scroll pane of its own, not a column that
                  grows without end: a patient with two years of history used to
                  push every card below it off the screen. Height is capped to
                  roughly one screen, entries load a page at a time, and the
                  filter chips above stay put while the list moves. */}
              <CardContent
                className="max-h-[560px] overflow-y-auto"
                onScroll={handleTimelineScroll}
              >
                {timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {tr(
                      "Brak zarejestrowanych aktywności — wysyłki, wizyty na stronie i kroki PRM Engine pojawią się tutaj automatycznie.",
                    )}
                  </p>
                ) : (
                  <ol className="relative ml-2 border-l border-border space-y-5">
                    {shownTimeline.map((a) => {
                      const meta = activityMeta[a.type];
                      const Icon = meta.icon;
                      // Adres ma tylko wejście na stronę — reszta pozycji osi
                      // pochodzi z typów, które go nie niosą.
                      const href = "url" in a ? safeUrl(a.url) : null;
                      return (
                        <li key={a.id} className="pl-5 relative">
                          <span
                            className={`absolute -left-[13px] top-0 h-6 w-6 rounded-full flex items-center justify-center ring-4 ring-card ${meta.tone}`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          {/* Engine entries carry whole sentences — an agent's
                            reasoning, a provider's error — and a five-line bold
                            paragraph shouts down the rest of the timeline. */}
                          <div
                            className={`text-sm ${a.title.length > 120 ? "font-normal leading-relaxed" : "font-medium"}`}
                          >
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                // `noreferrer` obok `noopener`: adres pochodzi
                                // z danych śledzenia, więc nie wysyłamy tam
                                // informacji, z jakiej karty pacjenta kliknięto.
                                rel="noopener noreferrer"
                                className="hover:text-primary hover:underline inline-flex items-center gap-1"
                              >
                                {a.title}
                                <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                              </a>
                            ) : (
                              a.title
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 break-all">
                            {a.description}
                          </p>
                          <div className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {a.date}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {hasMoreTimeline && (
                  <div className="pt-4 flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setTimelinePage((p) => p + 1)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                      {tr("Pokaż starsze (")}
                      {visibleTimeline.length - shownTimeline.length})
                    </Button>
                  </div>
                )}
              </CardContent>
              {timeline.length > 0 && (
                <div className="border-t border-border/60 px-6 py-2 text-[11px] text-muted-foreground">
                  {tr("Pokazano ")} {shownTimeline.length} {tr(" z ")} {visibleTimeline.length}
                  {activityCategory === "all"
                    ? ""
                    : tr(" w kategorii „{activityCategory}”", {
                        activityCategory: tr(activityCategory),
                      })}
                  .
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* MESSAGES */}
        <TabsContent value="messages" className="mt-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{tr("Wiadomości")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tr(
                  "Wszystko, co poszło do pacjenta i co przyszło od niego — rozmowy ze skrzynki, wysyłki e-mail i SMS-y, w jednej osi czasu.",
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {allMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {tr(
                    "Brak wiadomości. Pojawią się tu formularze i ankiety wypełnione przez pacjenta, jego odpowiedzi e-mailem i SMS-em oraz wszystko, co do niego wysłaliście.",
                  )}
                </p>
              ) : (
                allMessages.map((m) => {
                  const cls =
                    "flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors";
                  // Treść jest jedna; różni się tylko to, czy wiersz prowadzi do
                  // skrzynki. Wysyłka kampanijna nie ma wątku, więc nie udaje,
                  // że gdzieś prowadzi.
                  const body = (
                    <>
                      <div
                        className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                          m.direction === "in"
                            ? "bg-primary-soft text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {m.channel === "sms" ? (
                          <MessageSquare className="h-4 w-4" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{m.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.meta} · {m.date}
                        </div>
                      </div>
                      <Badge variant="secondary" className="font-normal shrink-0">
                        {m.direction === "in" ? tr("Odebrane") : tr("Wysłane")}
                      </Badge>
                    </>
                  );
                  return m.threadLink ? (
                    <Link key={m.id} to="/inbox" className={cls}>
                      {body}
                    </Link>
                  ) : (
                    <div key={m.id} className={cls}>
                      {body}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* NOTES */}
        <TabsContent value="notes" className="mt-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base inline-flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-primary" /> {tr(" Notatki")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={tr("Dodaj notatkę o pacjencie...")}
                  className="min-h-[80px] resize-none"
                />
                <Button size="sm" onClick={addNote} className="gap-1.5">
                  <Plus className="h-4 w-4" /> {tr(" Dodaj notatkę")}
                </Button>
              </div>
              <Separator />
              <ul className="space-y-3">
                {notes.length === 0 && (
                  <li className="text-sm text-muted-foreground py-6 text-center">
                    {tr(
                      "Brak notatek. Dodaj pierwszą powyżej — pojawią się tu również odpowiedzi z ankiet i dodatkowe pola z formularzy.",
                    )}
                  </li>
                )}
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{n.text}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {n.date}
                      </span>
                      {n.source !== "manual" && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                          {NOTE_BADGE[n.source] || tr("Formularz")}
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* STATISTICS */}
        <TabsContent value="statistics" className="mt-6 space-y-4">
          {/* Every tile here is a count of rows the system really wrote. The
              previous six ("Open rate 68%", "Średni czas sesji 5m 12s") were
              invented — nothing measured a session, ever. */}
          {!stats ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    label: tr("Wysłane e-maile"),
                    value: String(stats.emailsSent),
                    icon: Send,
                    note: tr("Kampanie, odpowiedzi ze skrzynki i testy — wszystko z trackingiem."),
                  },
                  {
                    label: tr("Otwarcia"),
                    value: stats.opensUnmeasurable ? "—" : String(stats.opens),
                    icon: MailOpen,
                    note: stats.opensUnmeasurable
                      ? tr(
                          "Nie da się zmierzyć: piksel wskazuje na localhost. Zadziała po wdrożeniu.",
                        )
                      : tr("Unikalne wiadomości, nie liczba pobrań piksela."),
                  },
                  {
                    label: tr("Kliknięcia w wiadomościach"),
                    value: String(stats.clicks),
                    icon: MousePointerClick,
                    note: tr("Unikalne wiadomości, w które pacjent kliknął."),
                  },
                  {
                    label: tr("Rezerwacje wizyt"),
                    value: String(stats.visitsBooked),
                    icon: CalendarPlus,
                    note: tr("Tylko rezerwacje online — te z telefonu tu nie trafiają."),
                  },
                  {
                    label: tr("Wejścia na stronę"),
                    value: String(stats.pageVisits),
                    icon: Globe,
                    note: tr(
                      "Rozpoznane po tokenie z linku w wiadomości; ruch anonimowy nie liczy się tutaj.",
                    ),
                  },
                  {
                    label: tr("Przebiegi automatyzacji"),
                    value: String(stats.automationRuns),
                    icon: Workflow,
                    note: tr("Ile razy ten pacjent wszedł do jakiegokolwiek scenariusza."),
                  },
                ].map((k) => (
                  <Card key={k.label} className="border-border/60 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">{k.label}</div>
                        <k.icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight">{k.value}</div>
                      <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        {k.note}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {tr(
                  "Liczby obejmują całą historię kontaktu. Szczegóły — co i kiedy — są na zakładce Overview w „Aktywnościach”.",
                )}
              </p>
            </>
          )}
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents" className="mt-6 space-y-4">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{tr("Dokumenty")}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tr(
                    "Skierowania, wyniki, podpisane zgody. Pliki leżą na serwerze obok bazy, więc obejmuje je ta sama kopia zapasowa.",
                  )}
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5 shrink-0"
                disabled={uploading}
                onClick={() => docInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}

                {tr("Wgraj dokument")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <input
                ref={docInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.target.value = "";
                }}
              />

              {documents === null ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {tr(
                    "Brak dokumentów. Przyjmowane są PDF-y, zdjęcia, pliki Office, CSV i tekst — do 20 MB.",
                  )}
                </p>
              ) : (
                documents.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" title={d.fileName}>
                        {d.fileName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {d.sizeLabel} · {d.uploadedAt}
                        {d.uploadedBy
                          ? tr(" · wgrał(a) {uploadedBy}", { uploadedBy: d.uploadedBy })
                          : ""}
                      </div>
                    </div>
                    <a
                      href={`/documents/${d.id}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
                      aria-label={tr("Pobierz {fileName}", { fileName: d.fileName })}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label={tr("Usuń {fileName}", { fileName: d.fileName })}
                      onClick={() => void handleDeleteDocument(d.id, d.fileName)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            {tr(
              "Dokumentacja medyczna: pobranie wymaga zalogowania, a każdy plik zapisuje, kto go wgrał i kiedy. Usunięcie jest nieodwracalne — plik znika z dysku.",
            )}
          </p>

          {/* Plany leczenia trafiły do tej samej zakładki co dokumenty, bo to
              ta sama rodzina: materiały pacjenta. Różnią się kierunkiem —
              dokument przychodzi od pacjenta, plan do niego wychodzi. */}
          <PatientPlansCard contactId={contact.id} />
        </TabsContent>

        {/* AI RESUME */}
        <TabsContent value="ai-resume" className="mt-6 space-y-4">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> {tr(" PRM_Agent")}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {tr(
                    "Podsumowanie i pytania o tego pacjenta. Agent widzi wyłącznie dane z jego karty — wizyty, notatki, wiadomości, wysyłki, zgody i automatyzacje.",
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                disabled={agentBusy}
                onClick={() => void handleSummary()}
              >
                {agentBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {agentTurns.length === 0 ? tr("Wygeneruj podsumowanie") : tr("Podsumuj ponownie")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {agentTurns.length === 0 && !agentBusy && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {tr('Kliknij „Wygeneruj podsumowanie" albo zadaj pytanie poniżej.')}
                </p>
              )}

              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {agentTurns.map((t, i) => (
                  <div key={i} className="flex gap-3">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        t.role === "assistant"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t.role === "assistant" ? (
                        <Bot className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-semibold">{tr("Ty")}</span>
                      )}
                    </div>
                    <div className="flex-1 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                      {t.text}
                    </div>
                  </div>
                ))}
                {agentBusy && (
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="flex-1 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                      {tr("Czytam kartę pacjenta…")}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  value={agentQuestion}
                  onChange={(e) => setAgentQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleAsk();
                    }
                  }}
                  placeholder={tr("np. Kiedy ostatnio był u nas i na co czeka?")}
                  disabled={agentBusy}
                />
                <Button
                  className="shrink-0"
                  disabled={agentBusy || agentQuestion.trim().length === 0}
                  onClick={() => void handleAsk()}
                >
                  {tr("Zapytaj")}
                </Button>
              </div>

              {agentCost !== null && (
                <p className="text-xs text-muted-foreground">
                  {tr("Ostatnie wywołanie: ")} {agentCost.toFixed(4)}{" "}
                  {tr(" USD. Koszty i dzienny limit ustawiasz w Ustawieniach → PRM_Agent.")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI AGENT */}

        {/* AUTOMATION */}
        <TabsContent value="automation" className="mt-6 space-y-4">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base inline-flex items-center gap-2">
                <Workflow className="h-4 w-4 text-primary" /> {tr(" Automatyzacje tego pacjenta")}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tr(
                  "Przebiegi bieżące i zakończone. Silnik jest zdarzeniowy — pacjent wchodzi do automatyzacji przez wyzwalacz, nie przez dopisanie z karty.",
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {runs === null ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : runs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {tr("Ten pacjent nie przeszedł jeszcze przez żadną automatyzację.")}
                </p>
              ) : (
                runs.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border/60"
                  >
                    <div
                      className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${RUN_TONE[r.status] ?? "bg-muted text-muted-foreground"}`}
                    >
                      <Workflow className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{r.automationName}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.stepLabel}
                        {r.currentNodeTitle ? ` · ${r.currentNodeTitle}` : ""} {tr(" · start ")}{" "}
                        {r.startedAt}
                        {r.endedAt ? tr(" · koniec {endedAt}", { endedAt: r.endedAt }) : ""}
                      </div>
                      {r.lastError && (
                        <p className="text-xs text-destructive mt-1">
                          {tr("Błąd: ")} {r.lastError}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="font-normal shrink-0">
                      {RUN_LABELS[r.status] ?? r.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            {tr(
              'Poszczególne kroki, decyzje warunków i błędy są na osi czasu w „Aktywnościach" (kategoria Automatyzacje) oraz w panelu „Przebiegi" w builderze.',
            )}
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Says out loud that a tab shows example data.
 *
 * These tabs were built before the modules behind them existed, and their
 * numbers have never come from the database. Leaving them looking functional is
 * the failure mode this project keeps removing everywhere else, so until they
 * are either built or dropped, they say what they are.
 */
function DemoNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[oklch(0.78_0.15_75)]/40 bg-[oklch(0.78_0.15_75)]/10 px-3 py-2">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[oklch(0.48_0.15_75)] mt-0.5" />
      <p className="text-xs leading-relaxed text-[oklch(0.38_0.1_75)] dark:text-[oklch(0.85_0.1_75)]">
        <b>{tr("Dane przykładowe.")}</b> {children}
      </p>
    </div>
  );
}

/** Icons for the three built-in consents; anything the clinic adds gets the generic one. */
const CONSENT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  email: Mail,
  sms: MessageSquare,
  profiling: Sparkles,
};

/**
 * Real consent switches, part of the card's edit/save flow.
 *
 * The list is no longer hardcoded: it comes from Engage → Consent & RODO, so a
 * consent the clinic adds there (photo release, research participation) shows
 * up here on its own. Built-ins are stored as columns on the contact, added
 * ones in `contact_consents`, which is why the two halves are set through
 * different callbacks — the card does not get to pretend they are the same row.
 */
function SubscriptionsBlock({
  defs,
  draft,
  editing,
  loaded,
  source,
  updatedAt,
  onBuiltin,
  onExtra,
}: {
  defs: ConsentDef[];
  draft: ContactDraft;
  editing: boolean;
  /** Answers to the added consents arrive separately; until they do, they are not shown as "no". */
  loaded: boolean;
  source: string;
  updatedAt: number | null;
  onBuiltin: (key: "consentEmail" | "consentSms" | "consentProfiling", value: boolean) => void;
  onExtra: (key: string, value: boolean) => void;
}) {
  const builtinKey = (key: string) =>
    key === "email" ? "consentEmail" : key === "sms" ? "consentSms" : "consentProfiling";

  const value = (def: ConsentDef) => {
    if (!def.builtin) return draft.extraConsents[def.key] === true;
    return def.key === "email"
      ? draft.consentEmail
      : def.key === "sms"
        ? draft.consentSms
        : draft.consentProfiling;
  };

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">{tr("Zgody")}</div>
      <div className="space-y-2">
        {defs.length === 0 && (
          <p className="text-xs text-muted-foreground">{tr("Brak zdefiniowanych zgód.")}</p>
        )}
        {defs.map((c) => {
          const on = value(c);
          const Icon = CONSENT_ICONS[c.key] ?? ShieldCheck;
          const pending = !c.builtin && !loaded;
          return (
            <div key={c.key} className="flex items-start justify-between gap-3 py-1">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>{c.label}</span>
                  {!c.gates && (
                    <span className="text-[10px] text-muted-foreground/70">
                      {tr("nie blokuje wysyłki")}
                    </span>
                  )}
                </div>
                {c.note && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{c.note}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 pt-0.5">
                <span className={`text-xs ${on ? "text-success" : "text-muted-foreground"}`}>
                  {pending ? "…" : on ? "tak" : "nie"}
                </span>
                <Switch
                  checked={on}
                  disabled={!editing || pending}
                  onCheckedChange={(v) =>
                    c.builtin
                      ? onBuiltin(
                          builtinKey(c.key) as "consentEmail" | "consentSms" | "consentProfiling",
                          v,
                        )
                      : onExtra(c.key, v)
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
      {/* Where the consent came from is the part that matters in an audit —
          "granted" without a provenance is an assertion, not a record. */}
      <p className="text-[11px] text-muted-foreground mt-2">
        {tr("Źródło: ")} <b className="text-foreground">{source || "nieznane"}</b>
        {updatedAt
          ? tr(" · zmiana {v0}", { v0: new Date(updatedAt).toLocaleDateString(intlLocale()) })
          : ""}
        {source === "wypis" ? tr(" — pacjent wypisał się sam.") : ""}
      </p>
    </div>
  );
}

/** Built-in columns whose value the draft keeps as a plain string. */
const DRAFT_TEXT_KEYS = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "pesel",
  "source",
  "medium",
  "campaign",
]);

/**
 * One field of the contact card, rendered from its definition.
 *
 * Everything the card knows about a field — its name, its type, whether it can
 * be typed into — comes from `contact_field_defs`, so a clinic that renamed
 * "PESEL" or added "Lekarz prowadzący" gets exactly that here without a code
 * change. Built-in columns read from the draft's own properties; added fields
 * read from `draft.customFields`, keyed by the definition.
 */
function ContactFieldRow({
  def,
  contact,
  draft,
  editing,
  onScalar,
  onCustom,
}: {
  def: ContactFieldDef;
  contact: Contact;
  draft: ContactDraft;
  editing: boolean;
  onScalar: (value: string | string[]) => void;
  onCustom: (value: string) => void;
}) {
  // Long inputs get the full width — a tag list or a paragraph squeezed into
  // half a column is unreadable next to a phone number.
  const wide = def.type === "list" || def.type === "textarea";
  const wrap = (children: React.ReactNode) => (
    <div className={wide ? "col-span-2" : ""}>{children}</div>
  );

  // ── read-only columns: identity, not data ────────────────────────────────
  if (def.readOnly) {
    const raw = String((contact as unknown as Record<string, unknown>)[def.key] ?? "");
    return wrap(<Field label={def.label} value={raw || "—"} mono={def.key === "prmId"} />);
  }

  // ── built-in columns ─────────────────────────────────────────────────────
  if (def.builtin) {
    if (def.key === "status") {
      return wrap(
        editing ? (
          <div>
            <div className="text-xs text-muted-foreground mb-1">{def.label}</div>
            <Select value={draft.status} onValueChange={(v) => onScalar(v)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABELS) as ContactStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <Field label={def.label} value={STATUS_LABELS[contact.status]} />
        ),
      );
    }

    if (def.key === "segments" || def.key === "tags") {
      const values = def.key === "segments" ? draft.segments : draft.tags;
      return wrap(
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">{def.label}</div>
          {editing ? (
            def.key === "segments" ? (
              // Segmenty wybiera się z modułu Segmenty, nigdy nie wpisuje: pole
              // wolnego tekstu to sposób, w jaki jedno audytorium dorabia się
              // trzech pisowni.
              <SegmentPicker value={values} onChange={(v) => onScalar(v)} />
            ) : (
              <TagInput
                value={values}
                onChange={(v) => onScalar(v)}
                placeholder={tr("Wpisz tag i naciśnij Enter…")}
              />
            )
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {values.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
              {values.map((v) =>
                def.key === "segments" ? (
                  <Badge
                    key={v}
                    className="font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-2.5"
                  >
                    {v}
                  </Badge>
                ) : (
                  <Badge key={v} variant="outline" className="font-normal">
                    #{v}
                  </Badge>
                ),
              )}
            </div>
          )}
        </div>,
      );
    }

    const value = DRAFT_TEXT_KEYS.has(def.key)
      ? String((draft as unknown as Record<string, unknown>)[def.key] ?? "")
      : String((contact as unknown as Record<string, unknown>)[def.key] ?? "");
    const mono = def.key === "pesel";
    return wrap(
      editing ? (
        <EditField
          label={def.label}
          value={value}
          onChange={onScalar}
          mono={mono}
          hint={def.hint}
        />
      ) : (
        <Field label={def.label} value={value || "—"} mono={mono} />
      ),
    );
  }

  // ── fields the clinic added ──────────────────────────────────────────────
  const raw = draft.customFields[def.key] ?? "";

  if (!editing) {
    const shown =
      def.type === "boolean" ? (raw === "1" ? "Tak" : raw === "0" ? "Nie" : "—") : raw || "—";
    return wrap(
      <div>
        <div className="text-xs text-muted-foreground">{def.label}</div>
        <div className="mt-0.5 text-sm whitespace-pre-wrap">
          {def.type === "list" && raw ? (
            <span className="flex flex-wrap gap-1.5">
              {raw.split(",").map((v) => (
                <Badge key={v} variant="outline" className="font-normal">
                  {v.trim()}
                </Badge>
              ))}
            </span>
          ) : (
            shown
          )}
        </div>
      </div>,
    );
  }

  return wrap(
    <div>
      <div className="text-xs text-muted-foreground mb-1">{def.label}</div>
      {def.type === "textarea" && (
        <Textarea
          value={raw}
          onChange={(e) => onCustom(e.target.value)}
          className="min-h-[70px] resize-none text-sm"
        />
      )}
      {def.type === "select" && (
        <Select value={raw || NO_VALUE} onValueChange={(v) => onCustom(v === NO_VALUE ? "" : v)}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_VALUE}>—</SelectItem>
            {def.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {def.type === "boolean" && (
        <div className="flex items-center gap-2 h-9">
          <Switch checked={raw === "1"} onCheckedChange={(v) => onCustom(v ? "1" : "0")} />
          <span className="text-sm text-muted-foreground">
            {raw === "1" ? tr("Tak") : tr("Nie")}
          </span>
        </div>
      )}
      {def.type === "list" && (
        <TagInput
          value={
            raw
              ? raw
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean)
              : []
          }
          onChange={(v) => onCustom(v.join(", "))}
          placeholder={tr("Wpisz wartość i naciśnij Enter…")}
        />
      )}
      {(def.type === "text" || def.type === "number" || def.type === "date") && (
        <Input
          value={raw}
          type={def.type === "text" ? "text" : def.type}
          onChange={(e) => onCustom(e.target.value)}
          className="h-9 text-sm"
        />
      )}
      {def.hint && (
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{def.hint}</p>
      )}
    </div>,
  );
}

/** Radix forbids an empty string as a select item value. */
const NO_VALUE = "__none__";

function EditField({
  label,
  value,
  onChange,
  mono,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 ${mono ? "font-mono text-xs" : "text-sm"}`}
      />
      {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      {/* A long address used to push its way into the neighbouring column: an
          e-mail has nowhere to wrap, so the grid cell simply grew. It now keeps
          its width and scrolls inside itself — the text stays selectable, so the
          whole address can still be read and copied. */}
      <div
        className={`mt-0.5 overflow-x-auto whitespace-nowrap pb-0.5 ${mono ? "font-mono text-xs" : "text-sm"}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

/** The select value standing for "on no funnel" — Radix forbids an empty string as an item value. */
const NO_FUNNEL = "__none__";

function PatientFunnel({
  funnels,
  funnelId,
  ready,
  onFunnelIdChange,
  currentIndex,
  onPrev,
  onNext,
}: {
  funnels: Funnel[];
  /** Empty string = the contact is on no funnel, which is a normal state. */
  funnelId: string;
  ready: boolean;
  onFunnelIdChange: (v: string) => void;
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const stages = funnels.find((f) => f.id === funnelId)?.stages ?? [];
  const progress = stages.length ? ((currentIndex + 1) / stages.length) * 100 : 0;
  const noFunnel = !funnelId;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">{tr("Lejek pacjenta")}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {noFunnel ? (
              tr("Pacjent nie jest przypisany do żadnego lejka")
            ) : stages.length ? (
              <>
                {tr("Etap ")} {currentIndex + 1} {tr(" z ")} {stages.length} ·{" "}
                {Math.round(progress)}
                {tr("% ścieżki")}
              </>
            ) : (
              tr("Ten lejek nie ma jeszcze etapów")
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={funnelId || NO_FUNNEL}
            disabled={!ready}
            onValueChange={(v) => onFunnelIdChange(v === NO_FUNNEL ? "" : v)}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FUNNEL}>{tr("Bez lejka")}</SelectItem>
              {funnels.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to="/funnels">
              <Settings2 className="h-3.5 w-3.5" /> {tr(" Zarządzaj lejkami")}
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {noFunnel ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {tr(
              "Wybierz lejek powyżej, żeby poprowadzić tego pacjenta ścieżką — albo zostaw bez lejka i przypisz go automatyzacją (akcja „Przypisz do lejka”, np. po dodaniu tagu lub wejściu do segmentu).",
            )}
          </p>
        ) : stages.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {tr("Dodaj etapy do tego lejka w module")}{" "}
            <Link to="/funnels" className="text-primary hover:underline">
              {tr("Lejki")}
            </Link>
            {tr(", żeby zobaczyć tu ścieżkę pacjenta.")}
          </p>
        ) : (
          <>
            <div className="flex items-stretch gap-1.5 overflow-x-auto">
              {stages.map((stage, i) => {
                const isDone = i < currentIndex;
                const isCurrent = i === currentIndex;
                const isFuture = i > currentIndex;
                return (
                  <div
                    key={stage.id}
                    className={`relative flex-1 min-w-[140px] rounded-lg px-4 py-3 transition-colors
                      ${isDone ? "bg-primary/10 text-primary border border-primary/20" : ""}
                      ${isCurrent ? "bg-primary text-primary-foreground" : ""}
                      ${isFuture ? "bg-muted/50 text-muted-foreground border border-border/60" : ""}
                    `}
                    style={{
                      clipPath:
                        "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)",
                    }}
                  >
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-80">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]
                          ${isDone ? "bg-primary text-primary-foreground" : ""}
                          ${isCurrent ? "bg-primary-foreground/20 text-primary-foreground" : ""}
                          ${isFuture ? "bg-background text-muted-foreground border border-border" : ""}
                        `}
                      >
                        {isDone ? "✓" : i + 1}
                      </span>
                      {tr("Etap ")} {i + 1}
                    </div>
                    <div className="mt-1.5 text-sm font-semibold leading-tight">{stage.label}</div>
                    <div
                      className={`mt-0.5 text-[11px] leading-snug ${isCurrent ? "opacity-90" : "opacity-70"}`}
                    >
                      {stage.description}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" disabled={currentIndex === 0} onClick={onPrev}>
                  {tr("Cofnij etap")}
                </Button>
                <Button size="sm" disabled={currentIndex === stages.length - 1} onClick={onNext}>
                  {tr("Następny etap")}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
