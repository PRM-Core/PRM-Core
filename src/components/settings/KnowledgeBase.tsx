import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Plus, Pencil, Trash2, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getKnowledge,
  saveKnowledge,
  deleteKnowledge,
  type KnowledgeEntryView,
} from "@/lib/api/knowledge.functions";
import { t } from "@/lib/i18n";

// The clinic's own knowledge base. Whatever is here is what the agent is
// allowed to state as fact when it writes to a patient — so the editor is
// deliberately plain text the marketer owns, not something generated.

export function KnowledgeBase() {
  const [entries, setEntries] = useState<KnowledgeEntryView[] | null>(null);
  const [editing, setEditing] = useState<KnowledgeEntryView | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeEntryView | null>(null);

  const refresh = () => getKnowledge().then(setEntries);
  useEffect(() => {
    refresh();
  }, []);

  const startNew = () => {
    setEditing(null);
    setTitle("");
    setContent("");
    setOpen(true);
  };

  const startEdit = (entry: KnowledgeEntryView) => {
    setEditing(entry);
    setTitle(entry.title);
    setContent(entry.content);
    setOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveKnowledge({
        data: { id: editing?.id, title: title.trim(), content: content.trim() },
      });
      await refresh();
      setOpen(false);
      toast.success(editing ? t("Zaktualizowano wpis") : t("Dodano wpis do bazy wiedzy"));
    } catch (err) {
      toast.error(t("Nie udało się zapisać"), { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteKnowledge({ data: { id: deleteTarget.id } });
    await refresh();
    setDeleteTarget(null);
    toast.success(t("Wpis usunięty"));
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center text-accent-foreground">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{t("Baza wiedzy")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("Materiały, na których agent opiera treść wiadomości do pacjentów.")}
            </p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={startNew}>
          <Plus className="h-3.5 w-3.5" /> {t(" Dodaj wpis")}
        </Button>
      </CardHeader>

      <CardContent>
        {entries === null ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t(
              "Baza jest pusta. Dodaj cennik, opisy zabiegów, godziny otwarcia albo standardowe odpowiedzi — agent użyje wyłącznie tego, co tu zapiszesz.",
            )}
          </p>
        ) : (
          <div className="divide-y">
            {entries.map((entry) => (
              <div key={entry.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{entry.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {entry.content}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => startEdit(entry)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive"
                  onClick={() => setDeleteTarget(entry)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader>
            <SheetTitle>{editing ? t("Edytuj wpis") : t("Nowy wpis")}</SheetTitle>
            <SheetDescription>
              {t(
                "Pisz konkretnie i faktograficznie. Agent traktuje ten tekst jako prawdę o placówce.",
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4 flex-1">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Tytuł")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("np. Cennik — implanty słuchowe")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Treść")}</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t(
                  "np. Konsultacja kwalifikacyjna: 250 zł. Badanie audiometryczne: 150 zł…",
                )}
                className="min-h-[260px] resize-none"
              />
            </div>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("Anuluj")}
            </Button>
            <Button
              className="gap-1.5"
              onClick={handleSave}
              disabled={saving || !title.trim() || !content.trim()}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}

              {t("Zapisz")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Usunąć „")}
              {deleteTarget?.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Agent przestanie korzystać z tego materiału przy pisaniu wiadomości. Tej operacji nie można cofnąć.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Anuluj")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("Usuń")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
