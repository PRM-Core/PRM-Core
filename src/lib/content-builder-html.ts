import {
  personalizationField,
  resolvePersonalizationValue,
  resolveMergeTagsInHtml,
  mergeTagHtml,
  parseFormFields,
  parseBlockTags,
  parseSurveyQuestions,
  FORM_MARKER_ATTRIBUTE,
  STUDIO_FONTS,
  columnWidths,
  studioFontStack,
  studioFontsHref,
  SURVEY_MARKER_ATTRIBUTE,
  type ContentBlock,
  type ContentItem,
  type PersonalizationSample,
} from "./content-builder";
import { t } from "@/lib/i18n";

// Renders the same block model as BlockPreview.tsx to a real HTML string, for
// actually sending an email (not just previewing it in the app). Kept as
// plain string templating (no DOM/browser APIs) so it's safe to import from
// server-only code as well as the client.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function typographyCss(d: Record<string, string>): string {
  const parts: string[] = [];
  if (d.fontFamily && d.fontFamily !== "inherit") parts.push(`font-family:${d.fontFamily}`);
  if (d.fontSize) parts.push(`font-size:${d.fontSize}px`);
  if (d.color) parts.push(`color:${d.color}`);
  return parts.length ? `;${parts.join(";")}` : "";
}

// `sample` is optional so the same renderer can produce an UNRESOLVED snapshot
// (merge-tag chips left in place) for PRM Engine, which stores one copy of a
// template and personalizes it per recipient at send time.
function renderBlock(
  block: ContentBlock,
  sample?: PersonalizationSample,
  style?: Record<string, string>,
): string {
  const d = block.data;
  // Kolor akcentu z zakładki „Style". Pusto = indygo, które renderer miał
  // zaszyte od początku — wiadomości sprzed tej zmiany wyglądają identycznie.
  const accent = style?.accent || "#4f46e5";
  const align = d.align || "left";

  switch (block.type) {
    case "header": {
      const logo = d.logoImageUrl
        ? `<img src="${escapeHtml(d.logoImageUrl)}" width="36" height="36" alt="" style="border-radius:8px;object-fit:cover" />`
        : `<div style="width:36px;height:36px;border-radius:8px;background:#eef2ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;font-family:Arial,sans-serif">${escapeHtml((d.logoText || "PRM Core").slice(0, 2).toUpperCase())}</div>`;
      const inner = `<table role="presentation" width="100%"><tr>
        <td style="width:44px;vertical-align:middle">${logo}</td>
        <td style="padding-left:12px;vertical-align:middle">
          <div style="font-size:14px;font-weight:600;font-family:Arial,sans-serif">${escapeHtml(d.logoText || t("Nagłówek"))}</div>
          ${d.tagline ? `<div style="font-size:12px;color:#6b7280;font-family:Arial,sans-serif">${escapeHtml(d.tagline)}</div>` : ""}
        </td>
      </tr></table>`;
      // Cały nagłówek klikalny, gdy podano adres — logo prowadzące na stronę
      // placówki to standard, którego brakowało. `text-decoration:none`, bo
      // podkreślony blok z logo wygląda jak błąd.
      return d.linkUrl
        ? `<a href="${escapeHtml(d.linkUrl)}" style="text-decoration:none;color:inherit" target="_blank">${inner}</a>`
        : inner;
    }
    case "heading":
      return `<h3 style="font-size:18px;font-weight:600;text-align:${align};margin:0;font-family:Arial,sans-serif${typographyCss(d)}">${escapeHtml(d.text || t("Nagłówek"))}</h3>`;
    case "text":
    case "html":
      return d.html
        ? `<div style="text-align:${align};font-family:Arial,sans-serif">${resolveMergeTagsInHtml(d.html, sample)}</div>`
        : `<p style="font-size:14px;color:#4b5563;white-space:pre-wrap;text-align:${align};margin:0;font-family:Arial,sans-serif">${escapeHtml(d.text || "")}</p>`;
    case "personalization": {
      const field = personalizationField(d.field);
      const prefix = escapeHtml(d.prefix || "");
      const suffix = escapeHtml(d.suffix || "");
      // Without a sample this is a snapshot, so the legacy block emits the same
      // merge chip the rich-text path does and gets resolved server-side later.
      if (!sample) {
        return `<p style="font-size:14px;text-align:${align};margin:0;font-family:Arial,sans-serif">${prefix}${mergeTagHtml(d.field)}${suffix}</p>`;
      }
      const resolved = escapeHtml(resolvePersonalizationValue(d.field, sample) || d.fallback || "");
      if (field?.kind === "link") {
        return `<p style="font-size:14px;text-align:${align};margin:0;font-family:Arial,sans-serif">${prefix}<a href="#" style="color:#4f46e5;text-decoration:underline">${resolved}</a>${suffix}</p>`;
      }
      return `<p style="font-size:14px;text-align:${align};margin:0;font-family:Arial,sans-serif">${prefix}${resolved}${suffix}</p>`;
    }
    case "image": {
      if (!d.url) return "";
      // Promień domyślnie 8 px — tak wyglądały obrazy w kreatorze od początku
      // i nie ma powodu zmieniać istniejących wiadomości. Kadry pociętego
      // projektu ustawiają `radius: "0"`, bo mają się stykać w jedną całość;
      // zaokrąglone rogi robiły z nich sterta kafelków.
      // Puste = domyślne 8 px (tak działał kreator od początku). Dopiero jawne
      // „0" znosi zaokrąglenie — inaczej pusta wartość dawałaby `border-radius:px`.
      const radius = (d.radius ?? "").trim() || "8";
      const radiusCss = radius === "0" ? "" : `border-radius:${radius}px;`;
      // `width` w atrybucie, nie tylko w stylu: Outlook ignoruje szerokość
      // z CSS i bez tego rozciąga obraz do rozmiaru oryginału.
      const widthAttr = d.width ? ` width="${escapeHtml(d.width)}"` : "";
      const link = d.href
        ? (html: string) => `<a href="${escapeHtml(d.href)}" target="_blank">${html}</a>`
        : (html: string) => html;
      return link(
        `<img src="${escapeHtml(d.url)}" alt="${escapeHtml(d.alt || "")}"${widthAttr} style="width:100%;max-width:100%;${radiusCss}display:block;border:0;height:auto" />`,
      );
    }
    case "button":
      return `<table role="presentation" width="100%"><tr><td style="text-align:${align}">
        <a href="${escapeHtml(d.url || "#")}" style="display:inline-block;background:${escapeHtml(accent)};color:#ffffff;font-size:14px;font-weight:500;padding:10px 20px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif${typographyCss(d)}">${escapeHtml(d.label || "Przycisk")}</a>
      </td></tr></table>`;
    case "form": {
      // The markup produced here IS the public contract for hand-coded popups:
      // a form carrying FORM_MARKER_ATTRIBUTE with inputs named after
      // FORM_FIELDS. prm-tracker.js intercepts its submit and posts to
      // FORM_ENDPOINT_PATH. Keep in sync with the form guide dialog.
      const inputStyle =
        "width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;font-family:Arial,sans-serif;margin-bottom:8px";
      const inputs = parseFormFields(d)
        .map((f) => {
          const placeholder = `${escapeHtml(f.label)}${f.required ? " *" : ""}`;
          const req = f.required ? " required" : "";
          // data-prm-label carries the human label for custom fields, so the
          // note written on the contact reads "Skąd wiesz o nas?: …" rather
          // than the generated key.
          const labelAttr = f.custom ? ` data-prm-label="${escapeHtml(f.label)}"` : "";
          return f.type === "textarea"
            ? `<textarea name="${f.name}"${labelAttr} placeholder="${placeholder}"${req} rows="3" style="${inputStyle}"></textarea>`
            : `<input type="${f.type}" name="${f.name}"${labelAttr} placeholder="${placeholder}"${req} style="${inputStyle}" />`;
        })
        .join("");

      const consent = d.consentText
        ? `<label style="display:flex;gap:8px;align-items:flex-start;font-size:11px;color:#6b7280;margin:4px 0 10px;font-family:Arial,sans-serif">
             <input type="checkbox" name="consent" required style="margin-top:2px" />
             <span>${escapeHtml(d.consentText)}</span>
           </label>`
        : "";

      return `<form ${FORM_MARKER_ATTRIBUTE} data-prm-tag="${escapeHtml(parseBlockTags(d).join(","))}" data-prm-success="${escapeHtml(d.successMessage || "")}" style="margin:0">
        ${inputs}${consent}
        <button type="submit" style="width:100%;background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:11px 16px;font-size:14px;font-weight:600;cursor:pointer;font-family:Arial,sans-serif">${escapeHtml(d.submitLabel || t("Wyślij"))}</button>
      </form>`;
    }
    case "survey": {
      // Same contract idea as the form block, but answers land as a note on the
      // contact card instead of contact columns — see /api/surveys/submit.
      const inputStyle =
        "width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;font-family:Arial,sans-serif";
      const questions = parseSurveyQuestions(d)
        .map((q, idx) => {
          const label = `<div style="font-size:13px;font-weight:600;margin:0 0 6px;font-family:Arial,sans-serif">${escapeHtml(q.text)}${q.required ? " *" : ""}</div>`;
          const req = q.required ? " required" : "";
          const key = `q${idx}`;
          let control = "";

          if (q.type === "rating") {
            control = `<div style="display:flex;gap:6px">${[1, 2, 3, 4, 5]
              .map(
                (n) =>
                  `<label style="flex:1;text-align:center;border:1px solid #d1d5db;border-radius:8px;padding:8px 0;font-size:14px;font-family:Arial,sans-serif;cursor:pointer">
                     <input type="radio" name="${key}" value="${n}"${req} style="display:block;margin:0 auto 4px" />${n}
                   </label>`,
              )
              .join("")}</div>`;
          } else if (q.type === "single") {
            control = q.options
              .map(
                (opt) =>
                  `<label style="display:flex;gap:8px;align-items:center;font-size:13px;font-family:Arial,sans-serif;margin-bottom:6px">
                     <input type="radio" name="${key}" value="${escapeHtml(opt)}"${req} />
                     <span>${escapeHtml(opt)}</span>
                   </label>`,
              )
              .join("");
          } else {
            control = `<textarea name="${key}"${req} rows="3" style="${inputStyle}"></textarea>`;
          }

          return `<div data-prm-question="${escapeHtml(q.text)}" style="margin-bottom:14px">${label}${control}</div>`;
        })
        .join("");

      const emailField =
        d.askEmail === "1"
          ? `<div style="margin-bottom:14px">
               <div style="font-size:13px;font-weight:600;margin:0 0 6px;font-family:Arial,sans-serif">${escapeHtml(t("Twój e-mail *"))}</div>
               <input type="email" name="email" required placeholder="${escapeHtml(t("jan.kowalski@example.com"))}" style="${inputStyle}" />
             </div>`
          : "";

      return `<form ${SURVEY_MARKER_ATTRIBUTE} data-prm-tag="${escapeHtml(parseBlockTags(d).join(","))}" data-prm-success="${escapeHtml(d.successMessage || "")}" style="margin:0">
        ${questions}${emailField}
        <button type="submit" style="width:100%;background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:11px 16px;font-size:14px;font-weight:600;cursor:pointer;font-family:Arial,sans-serif">${escapeHtml(d.submitLabel || t("Wyślij odpowiedzi"))}</button>
      </form>`;
    }
    case "divider":
      return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0" />`;
    case "spacer":
      return `<div style="height:${Number(d.height) || 24}px;line-height:0;font-size:0">&nbsp;</div>`;
    case "social": {
      const networks: Array<[key: "facebook" | "instagram" | "linkedin", label: string]> = [
        ["facebook", "Facebook"],
        ["instagram", "Instagram"],
        ["linkedin", "LinkedIn"],
      ];
      const enabled = networks.filter(([key]) => d[key]).map(([, label]) => label);
      if (!enabled.length) return "";
      return `<p style="text-align:center;font-size:12px;color:#6b7280;margin:0;font-family:Arial,sans-serif">${escapeHtml(enabled.join(" · "))}</p>`;
    }
    case "columns": {
      /**
       * Kolumny jako **tabela**, nie flexbox ani grid.
       *
       * Outlook na Windows renderuje HTML silnikiem Worda, który nie zna
       * `display:flex` ani `grid` — układ zbudowany na nich rozsypuje się tam
       * w pionową kolumnę. Tabela z procentowymi szerokościami to jedyna
       * konstrukcja działająca wszędzie, i dlatego wygląda archaicznie:
       * to nie zaniedbanie, tylko warunek konieczny.
       *
       * **Na telefonie kolumny się składają** — `max-width` na `<td>` razem
       * z regułą w `<head>`. Outlook desktop zignoruje regułę i zostawi je
       * obok siebie, co przy dwóch kolumnach jest do przyjęcia; przy trzech
       * robi się ciasno i dlatego lista proporcji nie idzie dalej niż trzy.
       */
      const cols = block.columns ?? [];
      if (cols.length === 0) return "";
      const widths = columnWidths(cols.length, d.ratio || "1:1");
      const gap = Number(d.gap) || 16;
      const cells = cols
        .map((inner, i) => {
          const body = inner
            .map((b) => renderBlock(b, sample, style))
            .join('<div style="height:8px;line-height:0;font-size:0">&nbsp;</div>');
          const padding =
            i === 0
              ? `0 ${gap / 2}px 0 0`
              : i === cols.length - 1
                ? `0 0 0 ${gap / 2}px`
                : `0 ${gap / 2}px`;
          return `<td class="prm-col" width="${widths[i]}%" style="width:${widths[i]}%;padding:${padding};vertical-align:top">${body || "&nbsp;"}</td>`;
        })
        .join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
    }
    case "attachments": {
      /**
       * Pliki dopięte do wiadomości.
       *
       * **Domyślnie prawdziwe załączniki** (`mode` puste albo `"attach"`):
       * identyfikatory z tego bloku trafiają do listy załączników wiadomości
       * w `renderContentItem`, a bajty doczytuje wysyłka. W treści zostaje
       * wtedy sama lista nazw — bez odnośnika, bo plik jest już w wiadomości
       * i klikanie w cokolwiek byłoby myleniem odbiorcy.
       *
       * **Tryb `"link"` zostaje jako wyjście dla ciężkich plików.** Prawdziwy
       * załącznik jest wysyłany **osobno do każdego odbiorcy**: plan
       * dietetyczny na 8 MB przy tysiącu pacjentów to osiem gigabajtów ruchu
       * i tysiąc skrzynek na granicy limitu. Odnośnik do biblioteki Media
       * kosztuje tyle samo co jedno pobranie na chętnego.
       *
       * `%%BASE_URL%%` zamienia się na adres instalacji przy wysyłce; bez tego
       * odnośnik w mailu byłby względny i prowadził donikąd.
       */
      const files = parseAttachmentFiles(d.fileIds ?? "");
      if (files.length === 0) return "";
      const asLink = (d.mode ?? "").trim() === "link";

      const rows = files
        .map((f) => {
          const label = `📎 ${escapeHtml(f.name)}${f.size ? ` <span style="color:#9ca3af;font-size:12px">(${escapeHtml(f.size)})</span>` : ""}`;
          const cell = asLink
            ? `<a href="%%BASE_URL%%/media-file/${escapeHtml(f.id)}" style="color:#4f46e5;font-family:Arial,sans-serif;font-size:14px;text-decoration:none" target="_blank">${label}</a>`
            : `<span style="color:#374151;font-family:Arial,sans-serif;font-size:14px">${label}</span>`;
          return `<tr><td style="padding:6px 0">${cell}</td></tr>`;
        })
        .join("");

      return `<div style="text-align:${align}">
        ${d.title ? `<div style="font-size:13px;font-weight:600;margin-bottom:4px;font-family:Arial,sans-serif">${escapeHtml(d.title)}</div>` : ""}
        <table role="presentation" width="100%">${rows}</table>
      </div>`;
    }
    case "plan": {
      // Wstawiamy **znacznik**, nie treść planu. Podstawienie robi
      // `resolvePlanTags` przy wysyłce, osobno dla każdego pacjenta — jedna
      // migawka obsługuje cały segment, a plan i tak jest inny u każdego.
      const tag = d.planName?.trim() ? `%%PLAN:${d.planName.trim()}%%` : "%%PLAN%%";
      const title = d.title?.trim()
        ? `<h3 style="font-size:18px;font-weight:600;margin:0 0 8px;font-family:Arial,sans-serif">${escapeHtml(d.title)}</h3>`
        : "";
      return `<div style="text-align:${align};font-family:Arial,sans-serif">${title}${tag}</div>`;
    }
    case "footer":
      return `<div style="text-align:center">
        ${d.imageUrl ? `<img src="${escapeHtml(d.imageUrl)}" alt="" style="height:40px;margin:0 auto 8px;display:block" />` : ""}
        ${
          // Stopka przyjmuje odnośniki (regulamin, polityka prywatności,
          // wypisanie), więc treść idzie jako HTML. Stopki sprzed tej zmiany
          // mają tylko `text` i renderują się jak dotąd.
          d.html
            ? `<div style="font-size:11px;color:#9ca3af;text-align:${align};font-family:Arial,sans-serif${typographyCss(d)}">${resolveMergeTagsInHtml(d.html, sample)}</div>`
            : `<p style="font-size:11px;color:#9ca3af;white-space:pre-wrap;text-align:${align};margin:0;font-family:Arial,sans-serif${typographyCss(d)}">${escapeHtml(d.text || "")}</p>`
        }
      </div>`;
    default:
      return "";
  }
}

/** Renders just the block content as an HTML fragment (no document wrapper) — used for the on-site popup overlay, where the fragment is injected into a positioned container by prm-tracker.js. */
export function renderContentItemToFragment(
  item: ContentItem,
  sample?: PersonalizationSample,
): string {
  if (item.source === "zip" || item.source === "html") {
    return item.html || `<p>${escapeHtml(t("Brak treści HTML."))}</p>`;
  }
  return item.blocks
    .map((b) => renderBlock(b, sample, item.style))
    .join('<div style="height:12px;line-height:0;font-size:0">&nbsp;</div>');
}

/** Renders a ContentItem (block-based or ZIP-imported) to a real, sendable HTML string. */
export function renderContentItemToHtml(item: ContentItem, sample?: PersonalizationSample): string {
  if (item.source === "zip" || item.source === "html") {
    return item.html || `<p>${escapeHtml(t("Brak treści HTML w tym archiwum."))}</p>`;
  }

  // Ustawienia z zakładki „Style". Domyślne odpowiadają temu, co renderer
  // miał zaszyte, więc wiadomości sprzed tej zmiany wyglądają identycznie.
  // Muszą być odczytane **przed** treścią — kolor akcentu wchodzi do przycisków,
  // a krój do arkusza czcionek w nagłówku.
  const st = item.style ?? {};

  const body = item.blocks
    .map((b) => renderBlock(b, sample, st))
    .join('<div style="height:12px;line-height:0;font-size:0">&nbsp;</div>');

  // Czcionki użyte w treści — arkusz z instalacji (adres wstawia wysyłka
  // w miejsce `%%BASE_URL%%`), bez Google. Outlook i Gmail
  // go zignorują i pokażą zamiennik systemowy z `font-family`; Apple Mail
  // i klienty mobilne pobiorą właściwy krój.
  const fontsHref = studioFontsHref(
    [...usedStudioFonts(item), ...(st.font ? [st.font] : [])],
    "%%BASE_URL%%",
  );
  const fontsLink = fontsHref ? `\n    <link href="${fontsHref}" rel="stylesheet">` : "";
  const pageBg = st.background || "#f3f4f6";
  const cardBg = st.contentBackground || "#ffffff";
  const width = Number(st.width) || 560;
  // Zero jest tu **prawidłową** wartością („bez zaokrąglenia"), więc nie da się
  // użyć `|| 12` — fałszywe zero cofałoby ustawienie do domyślnego.
  const radius = st.radius?.trim() ? Number(st.radius) : 12;
  const family = st.font ? studioFontStack(st.font) : "Arial,Helvetica,sans-serif";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">${fontsLink}
    <style>
      /* Składanie kolumn na wąskim ekranie. Outlook desktop tego nie czyta
         i zostawi je obok siebie — świadomie, bo tam okno i tak jest szerokie. */
      @media only screen and (max-width: 480px) {
        td.prm-col { display: block !important; width: 100% !important; padding: 0 0 12px 0 !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:24px;background:${escapeHtml(pageBg)};font-family:${family}">
    <div style="max-width:${width}px;margin:0 auto;background:${escapeHtml(cardBg)};border-radius:${radius}px;padding:24px">${body}</div>
  </body>
</html>`;
}

/**
 * Rodziny z listy Studia użyte w tej treści.
 *
 * Czytane z gotowego `font-family` bloków, a nie z osobnego pola: krój bywa
 * ustawiony na całym bloku i na zaznaczeniu wewnątrz tekstu, więc jedyne
 * pewne źródło to sam HTML.
 */
function usedStudioFonts(item: ContentItem): string[] {
  const haystack = JSON.stringify(item.blocks ?? []);
  return STUDIO_FONTS.map((f) => f.family).filter((family) => haystack.includes(`'${family}'`));
}

/**
 * Pliki zapisane w bloku „Załączniki".
 *
 * Zapisywane jako `id|nazwa|rozmiar` po przecinku, bo dane bloku to płaska mapa
 * napisów — JSON w jednym polu byłby nieczytelny przy podglądzie w bazie.
 * Nazwa i rozmiar są **kopiowane w chwili wyboru**: gdyby ktoś skasował plik
 * z Media, wiadomość ma nadal pokazywać, czego brakuje, zamiast pustego wiersza.
 */
export function parseAttachmentFiles(raw: string): { id: string; name: string; size: string }[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, name, size] = entry.split("|");
      return { id: id ?? "", name: name || "Plik", size: size || "" };
    })
    .filter((f) => f.id);
}

/**
 * Identyfikatory plików, które mają pojechać jako **prawdziwe załączniki**.
 *
 * Blok w trybie `"link"` jest świadomie pomijany — tam plik zostaje
 * w bibliotece, a w wiadomości jest po niego odnośnik. Schodzi do kolumn, bo
 * blok z plikami bywa wstawiony w przegrodę, a pominięcie go dałoby wiadomość
 * obiecującą załącznik, którego nie ma.
 *
 * **Jedna funkcja dla serwera i dla przeglądarki**: migawkę składa serwer,
 * a wysyłkę testową uruchamia edytor — dwie kopie tej logiki rozjechałyby się
 * przy pierwszej zmianie i test przestałby sprawdzać to, co pójdzie naprawdę.
 */
export function attachmentIdsFromBlocks(blocks: ContentBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "attachments" && (b.data.mode ?? "attach").trim() !== "link") {
      out.push(...parseAttachmentFiles(b.data.fileIds ?? "").map((f) => f.id));
    }
    for (const col of b.columns ?? []) out.push(...attachmentIdsFromBlocks(col));
  }
  return out;
}

/** Sklejenie bez powtórzeń — ten sam plik bywa i w menu, i w bloku. */
export function mergeAttachmentIds(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** Zapis odwrotny do `parseAttachmentFiles`. */
export function serializeAttachmentFiles(
  files: { id: string; name: string; size: string }[],
): string {
  return files.map((f) => `${f.id}|${f.name}|${f.size}`).join(",");
}
