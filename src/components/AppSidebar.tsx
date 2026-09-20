import { isReadOnlyRole } from "@/lib/auth/roles";
import {
  Link,
  useNavigate,
  useRouteContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  AppWindow,
  BarChart3,
  ClipboardList,
  Filter,
  Image as ImageIcon,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  Newspaper,
  PenTool,
  PhoneCall,
  Plug,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Table2,
  Users,
  Workflow,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { PrmLogo, PrmLogoTile } from "@/components/PrmLogo";
import { logoutUser } from "@/lib/api/auth.functions";
import { getInboxUnreadCount } from "@/lib/api/inbox.functions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { useEffect, useState } from "react";
import { t, localized } from "@/lib/i18n";

const workspace = localized(() => [
  { title: t("Dashboard"), url: "/", icon: LayoutDashboard },
  { title: t("Kontakty"), url: "/contacts", icon: Users },
  { title: t("Kontakty telefoniczne"), url: "/phone-contacts", icon: PhoneCall },
  { title: t("Segmenty"), url: "/segments", icon: Layers },
  { title: t("Lekarze"), url: "/doctors", icon: Stethoscope },
  { title: t("Lejki"), url: "/funnels", icon: Filter },
  { title: t("Automation"), url: "/automation", icon: Workflow },
  { title: t("Newsletter"), url: "/newsletter", icon: Newspaper },
  { title: t("Email"), url: "/email", icon: Mail },
  { title: t("Pop-Up"), url: "/popup", icon: AppWindow },
  { title: "SMS", url: "/sms", icon: MessageSquare },
  // Studio wchodzi zaraz za kanałami, bo służy do składania ich treści —
  // nie jest osobnym kanałem, tylko edytorem tego, co w nich pójdzie.
  { title: t("Design Studio"), url: "/studio", icon: PenTool },
  // Wysyłki tuż pod kanałami, bo to ich wspólny wynik: tu ląduje wszystko,
  // co wyszło z Newslettera, E-maila i SMS-a do segmentu.
  { title: t("Wysyłki"), url: "/campaigns", icon: Send },
  { title: t("Reports"), url: "/reports", icon: BarChart3 },
]);

const care: typeof workspace = localized(() => [
  { title: t("Plany leczenia"), url: "/care", icon: ClipboardList },
]);

const engage = localized(() => [
  { title: t("Omnichannel Inbox"), url: "/inbox", icon: Inbox },
  { title: t("AI Copilot"), url: "/copilot", icon: Sparkles },
  { title: t("Consent & RODO"), url: "/consent", icon: ShieldCheck },
]);

/**
 * Sekcja techniczna. `edycja: true` oznacza ekran, który dla konta podglądu jest
 * pusty z definicji: jego funkcje serwerowe wystawiają konfigurację i sekrety
 * integracji, więc bramka roli je odrzuca. Pokazanie takiej pozycji w menu
 * kończyłoby się ekranem błędu — lepiej jej tam nie mieć.
 */
const system = localized(() => [
  { title: t("Integrations"), url: "/integrations", icon: Plug, edycja: true },
  { title: t("Media"), url: "/media", icon: ImageIcon },
  // Feedy obok Media, bo to ta sama rodzina: materiały, z których składa się
  // wiadomość — Media daje pliki, Feedy dane.
  { title: t("Feedy"), url: "/feeds", icon: Table2 },
  { title: t("Settings"), url: "/settings", icon: SettingsIcon, edycja: true },
]);

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));
  const { user } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  // Unread patient messages, polled slowly — the sidebar is on every screen, so
  // this is the one number that has to be right without anyone opening the inbox.
  useEffect(() => {
    if (!user) return;
    const load = () =>
      void getInboxUnreadCount()
        .then(setUnread)
        .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [user]);

  const handleLogout = async () => {
    await logoutUser();
    await router.invalidate();
    navigate({ to: "/login" });
  };

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : "?";
  const fullName = user ? `${user.firstName} ${user.lastName}` : "Nie zalogowano";

  const podglad = isReadOnlyRole(user?.role);
  const renderGroup = (label: string, items: Array<(typeof system)[number]>) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items
            .filter((item) => !(podglad && item.edycja))
            .map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                  <Link to={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
                {item.url === "/inbox" && unread > 0 && (
                  <SidebarMenuBadge className="bg-primary text-primary-foreground">
                    {unread}
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    // „offcanvas", nie „icon": kolumna **chowa się
    // całkowicie**, tak jak na tablecie. Pasek samych ikon zostawiał 48 px,
    // które przy raportach i płótnie Studia były realnie potrzebne.
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b border-sidebar-border">
        {/* Logotyp zamiast dawnego emblematu i napisu „PRM Core" — nazwa jest
            już częścią znaku, więc powtarzanie jej obok byłoby dublowaniem.
            „Healthcare CRM" zostaje jako podpis. Przy zwiniętej nawigacji
            wordmark się nie mieści, więc zostaje sam znak. */}
        {/* Logotyp i podpis w jednym bloku, jeden pod drugim. Rozdzielone
            (logo w `Link`, podpis obok) rozjeżdżały się w pionie, bo każdy
            element wnosił własny odstęp. */}
        <Link to="/" className="flex flex-col gap-1.5 px-2 py-3">
          <PrmLogo className="h-7 w-auto group-data-[collapsible=icon]:hidden" />
          <PrmLogoTile className="hidden h-8 w-8 group-data-[collapsible=icon]:block" />
          <span className="pl-0.5 text-[11px] leading-none text-muted-foreground group-data-[collapsible=icon]:hidden">
            {t("Healthcare CRM")}
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {renderGroup("Workspace", workspace)}
        {renderGroup("Care", care)}
        {renderGroup("Engage", engage)}
        {renderGroup("System", system)}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2.5 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="h-8 w-8 rounded-full bg-primary-soft flex items-center justify-center text-xs font-semibold text-primary shrink-0">
            {initials}
          </div>
          <div className="flex flex-col leading-tight min-w-0 flex-1">
            <span className="text-xs font-medium truncate">{fullName}</span>
            <span className="text-[11px] text-muted-foreground">
              {user ? ROLE_LABELS[user.role] : ""}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            title={t("Wyloguj się")}
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
