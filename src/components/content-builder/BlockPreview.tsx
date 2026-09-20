import type { CSSProperties } from "react";
import { ImageIcon, Facebook, Instagram, Linkedin, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseAttachmentFiles } from "@/lib/content-builder-html";
import {
  personalizationField,
  resolvePersonalizationValue,
  resolveMergeTagsInHtml,
  parseFormFields,
  parseSurveyQuestions,
  type ContentBlock,
  type PersonalizationSample,
} from "@/lib/content-builder";
import { t } from "@/lib/i18n";

function typographyStyle(d: Record<string, string>): CSSProperties {
  return {
    fontFamily: d.fontFamily && d.fontFamily !== "inherit" ? d.fontFamily : undefined,
    fontSize: d.fontSize ? `${d.fontSize}px` : undefined,
    color: d.color || undefined,
  };
}

export function BlockPreview({
  block,
  sample,
}: {
  block: ContentBlock;
  sample?: PersonalizationSample;
}) {
  const d = block.data;
  const align = (d.align as "left" | "center" | "right") || "left";

  switch (block.type) {
    case "header":
      return (
        <div
          className="flex items-center gap-3 py-2"
          title={d.linkUrl ? t("Odnośnik: {linkUrl}", { linkUrl: d.linkUrl }) : undefined}
        >
          {d.logoImageUrl ? (
            <img src={d.logoImageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center text-xs font-bold">
              {(d.logoText || "PRM Core").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="leading-tight">
            <div className="text-sm font-semibold">{d.logoText || t("Nagłówek")}</div>
            {d.tagline && <div className="text-xs text-muted-foreground">{d.tagline}</div>}
            {/* Odnośnika nie da się pokazać wprost na podglądzie — kliknięcie
                w płótnie zaznacza blok. Zamiast tego znacznik, żeby było
                widać, że nagłówek jest klikalny. */}
            {d.linkUrl && <div className="text-[10px] text-primary truncate">🔗 {d.linkUrl}</div>}
          </div>
        </div>
      );
    case "heading":
      return (
        <h3 className="text-lg font-semibold" style={{ textAlign: align, ...typographyStyle(d) }}>
          {d.text || t("Nagłówek")}
        </h3>
      );
    case "text":
    case "html":
      return d.html ? (
        <div
          className="text-sm [&_p]:m-0"
          style={{ textAlign: align }}
          dangerouslySetInnerHTML={{ __html: resolveMergeTagsInHtml(d.html, sample) }}
        />
      ) : (
        <p
          className="text-sm text-muted-foreground whitespace-pre-wrap"
          style={{ textAlign: align }}
        >
          {d.text || t("Tekst…")}
        </p>
      );
    case "personalization": {
      const field = personalizationField(d.field);
      const prefix = d.prefix || "";
      const suffix = d.suffix || "";
      if (!sample) {
        return (
          <div className="flex items-center gap-2 text-sm" style={{ textAlign: align }}>
            {prefix}
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft text-primary px-2 py-0.5 text-xs font-medium border border-dashed border-primary/40">
              <Wand2 className="h-3 w-3" /> {field?.label ?? t("Personalizacja")}
            </span>
            {suffix}
          </div>
        );
      }
      const resolved = resolvePersonalizationValue(d.field, sample) || d.fallback || "";
      if (field?.kind === "link") {
        return (
          <p className="text-sm" style={{ textAlign: align }}>
            {prefix}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-primary underline underline-offset-2"
            >
              {resolved}
            </a>
            {suffix}
          </p>
        );
      }
      return (
        <p className="text-sm" style={{ textAlign: align }}>
          {prefix}
          {resolved}
          {suffix}
        </p>
      );
    }
    case "image":
      return d.url ? (
        <img src={d.url} alt={d.alt || ""} className="w-full rounded-md object-cover max-h-48" />
      ) : (
        <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground gap-2">
          <ImageIcon className="h-5 w-5" /> <span className="text-xs">{t("Brak obrazu")}</span>
        </div>
      );
    case "button":
      return (
        <div style={{ textAlign: align }}>
          <span
            className="inline-block rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2"
            style={typographyStyle(d)}
          >
            {d.label || t("Przycisk")}
          </span>
        </div>
      );
    case "form": {
      const fields = parseFormFields(d);
      return (
        <div className="space-y-2">
          {fields.map((f) => (
            <div
              key={f.name}
              className={cn(
                "rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
                f.type === "textarea" && "py-4",
              )}
            >
              {f.label}
              {f.required ? " *" : ""}
            </div>
          ))}
          {d.consentText && (
            <div className="flex gap-2 items-start text-[11px] text-muted-foreground">
              <div className="h-3 w-3 rounded-sm border border-border shrink-0 mt-0.5" />
              <span>{d.consentText}</span>
            </div>
          )}
          <div className="rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 text-center">
            {d.submitLabel || t("Wyślij")}
          </div>
        </div>
      );
    }
    case "survey": {
      const questions = parseSurveyQuestions(d);
      return (
        <div className="space-y-3">
          {questions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("Brak pytań — dodaj je w panelu obok.")}
            </p>
          )}
          {questions.map((q) => (
            <div key={q.id} className="space-y-1.5">
              <div className="text-xs font-medium">
                {q.text || t("Pytanie…")}
                {q.required ? " *" : ""}
              </div>
              {q.type === "rating" ? (
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className="flex-1 rounded-md border border-border py-1 text-center text-[11px] text-muted-foreground"
                    >
                      {n}
                    </div>
                  ))}
                </div>
              ) : q.type === "single" ? (
                <div className="space-y-1">
                  {(q.options.length > 0 ? q.options : ["Opcja 1", "Opcja 2"]).map((opt, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-[11px] text-muted-foreground"
                    >
                      <span className="h-3 w-3 rounded-full border border-border shrink-0" />
                      {opt}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/30 py-4 px-3 text-[11px] text-muted-foreground">
                  {t("Odpowiedź otwarta")}
                </div>
              )}
            </div>
          ))}
          {d.askEmail === "1" && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {t("Twój e-mail *")}
            </div>
          )}
          <div className="rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 text-center">
            {d.submitLabel || t("Wyślij odpowiedzi")}
          </div>
        </div>
      );
    }
    case "divider":
      return <hr className="border-border" />;
    case "spacer":
      return <div style={{ height: `${Number(d.height) || 24}px` }} />;
    case "social": {
      const socials = [
        { key: "facebook", Icon: Facebook },
        { key: "instagram", Icon: Instagram },
        { key: "linkedin", Icon: Linkedin },
      ];
      return (
        <div className="flex items-center justify-center gap-3">
          {socials.map(({ key, Icon }) => (
            <div
              key={key}
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center",
                d[key] ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
          ))}
        </div>
      );
    }
    case "attachments": {
      const files = parseAttachmentFiles(d.fileIds ?? "");
      return (
        <div className="space-y-1.5 py-1" style={{ textAlign: align }}>
          {d.title && <div className="text-xs font-semibold">{d.title}</div>}
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("Brak plików — wybierz je w panelu po prawej.")}
            </p>
          ) : (
            files.map((f) => (
              <div
                key={f.id}
                className={
                  (d.mode ?? "attach") === "link"
                    ? "text-xs text-primary"
                    : "text-xs text-foreground"
                }
              >
                📎 {f.name}
                {f.size && <span className="text-muted-foreground"> ({f.size})</span>}
              </div>
            ))
          )}
        </div>
      );
    }
    case "plan":
      // Podgląd pokazuje **znacznik**, nie treść planu — bo treść jest inna
      // u każdego pacjenta i powstaje dopiero przy wysyłce. Udawanie tu
      // konkretnego planu byłoby pokazywaniem czegoś, czego nikt nie dostanie.
      return (
        <div className="space-y-1 py-1" style={{ textAlign: align }}>
          {d.title && <div className="text-base font-semibold">{d.title}</div>}
          <div className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 bg-primary/5 px-2 py-1 text-xs text-primary">
            {d.planName?.trim()
              ? t('Plan „{v0}"', { v0: d.planName.trim() })
              : t("Plan ostatnio przypisany pacjentowi")}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("Treść planu wejdzie tu przy wysyłce, osobno dla każdego odbiorcy.")}
          </p>
        </div>
      );
    case "footer":
      return (
        <div className="space-y-2">
          {d.imageUrl && <img src={d.imageUrl} alt="" className="mx-auto h-10 object-contain" />}
          {d.html ? (
            <div
              className="text-xs text-muted-foreground [&_a]:underline"
              style={{ textAlign: align, ...typographyStyle(d) }}
              dangerouslySetInnerHTML={{ __html: d.html }}
            />
          ) : (
            <p
              className="text-xs text-muted-foreground whitespace-pre-wrap"
              style={{ textAlign: align, ...typographyStyle(d) }}
            >
              {d.text || t("Stopka")}
            </p>
          )}
        </div>
      );
    default:
      return null;
  }
}
