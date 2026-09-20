import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Database, Key, Loader2, Table2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  changeFeedKeyColumn,
  getFeedPreviewRows,
  getFeeds,
  importFeedSheet,
  previewFeedFile,
  removeFeed,
  type FeedPreview,
} from "@/lib/api/feeds.functions";
import type { FeedRow } from "@/lib/db/schema";
import { intlLocale, t } from "@/lib/i18n";

export const Route = createFileRoute("/feeds")({
  head: () => ({ meta: [{ title: t("Feedy — PRM Core") }] }),
  component: FeedsPage,
});

// Feedy — arkusze z danymi wykorzystywanymi w wiadomościach.
//
// Moduł jest z założenia AGNOSTYCZNY wobec zawartości: nie wie, czy wgrano
// listę lekarzy, katalog produktów czy cennik. Nagłówek pliku staje się listą
// pól, a wiersze — danymi.

function FeedsPage() {
  const [feeds, setFeeds] = useState<FeedRow[] | null>(null);
  const [preview, setPreview] = useState<FeedPreview | null>(null);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [sheet, setSheet] = useState("");
  const [feedName, setFeedName] = useState("");
  const [keyColumn, setKeyColumn] = useState("");
  const [busy, setBusy] = useState(false);
  const [openFeed, setOpenFeed] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    getFeeds()
      .then(setFeeds)
      .catch(() => setFeeds([]));
  }, []);
  useEffect(() => refresh(), [refresh]);

  async function pick(f: File) {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let raw = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        raw += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const base64 = btoa(raw);
      const p = await previewFeedFile({ data: { fileName: f.name, bytesBase64: base64 } });
      if (p.sheets.length === 0) {
        toast.error(t("Nie znaleziono danych w pliku — sprawdź, czy pierwszy wiersz to nagłówek."));
        return;
      }
      setFile({ name: f.name, base64 });
      setPreview(p);
      setSheet(p.sheets[0].name);
      setFeedName(p.sheets[0].name);
      setKeyColumn("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Nie udało się odczytać pliku."));
    } finally {
      setBusy(false);
    }
  }

  const chosen = preview?.sheets.find((s) => s.name === sheet);

  async function doImport() {
    if (!file || !chosen) return;
    setBusy(true);
    try {
      const r = await importFeedSheet({
        data: {
          fileName: file.name,
          bytesBase64: file.base64,
          sheetName: chosen.name,
          feedName,
          keyColumn,
        },
      });
      if (!r.ok) {
        toast.error(r.error ?? t("Nie udało się wgrać."));
        return;
      }
      toast.success(
        t('Feed „{feedName}" — {rowCount} wierszy.', { feedName: feedName, rowCount: r.rowCount }),
      );
      setPreview(null);
      setFile(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function openRows(f: FeedRow) {
    if (openFeed === f.id) {
      setOpenFeed(null);
      return;
    }
    setOpenFeed(f.id);
    setRows(await getFeedPreviewRows({ data: { feedId: f.id } }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t("Feedy")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "Arkusze z danymi (CSV, XLSX), które wstawiasz w newsletterach i e-mailach jako pola dynamiczne — np. link do opinii przypisany do lekarza.",
            )}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = "";
          }}
        />
        <Button className="gap-1.5" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}

          {t("Wgraj plik")}
        </Button>
      </div>

      {/* ── podgląd przed zapisem ── */}
      {preview && chosen && (
        <Card className="border-primary/40 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base">
              {t("Co odczytałem z pliku ")} {file?.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.sheets.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Arkusz")}</Label>
                <Select
                  value={sheet}
                  onValueChange={(v) => {
                    setSheet(v);
                    setFeedName(v);
                    setKeyColumn("");
                  }}
                >
                  <SelectTrigger className="max-w-[320px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {preview.sheets.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {s.name} ({s.rowCount} {t(" wierszy)")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Nazwa feedu")}</Label>
                <Input value={feedName} onChange={(e) => setFeedName(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    "Pod tą nazwą wstawisz pola w treści. Wgranie pliku pod istniejącą nazwą podmienia zawartość.",
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Kolumna dopasowania")}</Label>
                <Select
                  value={keyColumn || "__none__"}
                  onValueChange={(v) => setKeyColumn(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("Bez dopasowania")}</SelectItem>
                    {chosen.columns.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    "Po tej kolumnie system znajdzie wiersz dla konkretnego pacjenta — np. nazwisko lekarza. Zostaw puste, gdy feed jest ten sam dla wszystkich.",
                  )}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {chosen.columns.map((c) => (
                      <TableHead key={c} className="whitespace-nowrap text-xs">
                        {c}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chosen.sample.map((r, i) => (
                    <TableRow key={i}>
                      {chosen.columns.map((c) => (
                        <TableCell key={c} className="max-w-[220px] truncate text-xs" title={r[c]}>
                          {r[c]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Podgląd pierwszych trzech wierszy z ")} {chosen.rowCount}
              {t(
                ". Sprawdź, czy nagłówki się zgadzają — przesunięty nagłówek daje bezsensowne nazwy pól.",
              )}
            </p>

            <div className="flex gap-2">
              <Button disabled={!feedName.trim() || busy} onClick={() => void doImport()}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t("Wgraj ")} {chosen.rowCount} {t(" wierszy")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                }}
              >
                {t("Anuluj")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── lista feedów ── */}
      <Card className="border-border/60 shadow-[var(--shadow-card)]">
        <CardContent className="p-4">
          {feeds === null ? (
            <div className="py-12 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : feeds.length === 0 ? (
            <div className="py-12 text-center">
              <Database className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {t(
                  "Nie ma jeszcze żadnego feedu. Wgraj plik CSV albo XLSX — kolumny mogą być dowolne.",
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {feeds.map((f) => (
                <div key={f.id} className="rounded-lg border border-border/60">
                  <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">{f.name}</span>
                    <Badge variant="secondary" className="font-normal">
                      {f.rowCount.toLocaleString(intlLocale())} {t(" wierszy")}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {f.columns.length} {t(" kolumn")}
                    </Badge>
                    {f.keyColumn ? (
                      <Badge variant="outline" className="gap-1 font-normal">
                        <Key className="h-3 w-3" /> {f.keyColumn}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("bez dopasowania")}</span>
                    )}
                    <div className="flex-1" />
                    <Select
                      value={f.keyColumn || "__none__"}
                      onValueChange={(v) => {
                        void changeFeedKeyColumn({
                          data: { feedId: f.id, column: v === "__none__" ? "" : v },
                        }).then(() => {
                          refresh();
                          toast.success(t("Zmieniono kolumnę dopasowania."));
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 w-[190px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("Bez dopasowania")}</SelectItem>
                        {f.columns.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => void openRows(f)}>
                      {openFeed === f.id ? t("Ukryj") : t("Podgląd")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => {
                        if (
                          !window.confirm(
                            t('Usunąć feed „{name}" wraz z danymi?', { name: f.name }),
                          )
                        )
                          return;
                        void removeFeed({ data: { id: f.id } }).then(() => {
                          refresh();
                          toast.success(t("Feed usunięty."));
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {openFeed === f.id && (
                    <div className="overflow-x-auto border-t">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            {f.columns.map((c) => (
                              <TableHead key={c} className="whitespace-nowrap text-xs">
                                {c}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r, i) => (
                            <TableRow key={i}>
                              {f.columns.map((c) => (
                                <TableCell
                                  key={c}
                                  className="max-w-[240px] truncate text-xs"
                                  title={r[c]}
                                >
                                  {r[c]}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <p className="px-3 py-2 text-[11px] text-muted-foreground">
                        {t("Pierwsze ")} {rows.length} {t(" z ")} {f.rowCount}{" "}
                        {t(" wierszy · plik źródłowy:")} {f.sourceFile || "—"}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="space-y-2 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Check className="h-4 w-4 text-success" /> {t(" Jak użyć feedu w wiadomości")}
          </div>
          <p className="text-muted-foreground">
            {t(
              "W edytorze treści (Newsletter, Email) wstaw pole dynamiczne z listy — system złoży znacznik postaci",
            )}{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              {t("%%FEED:nazwa|pole_kontaktu|kolumna%%")}
            </code>
            {t(
              ". Przy wysyłce zostanie zastąpiony wartością z wiersza pasującego do tego pacjenta.",
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Gdy dla kogoś nie ma pasującego wiersza, pole zostaje puste, a informacja o tym trafia do dziennika kampanii — nie znika po cichu.",
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
