/**
 * Oczyszczanie treści wklejanej z Worda, Google Docs i stron WWW.
 *
 * **Dlaczego to musi istnieć.** Edytor nie miał żadnej obsługi wklejania, więc
 * do `contentEditable` wchodziło dokładnie to, co Word wkłada do schowka:
 * setki atrybutów `mso-*`, znaczniki `<o:p>`, `<style>` z całym arkuszem
 * dokumentu i tabele użyte jako układ strony. Po jednym wklejeniu treść
 * przestawała dać się formatować, a wysłany HTML ważył kilkaset kilobajtów
 * i rozjeżdżał się w Outlooku.
 *
 * **Zasada nadrzędna: TEKST ZOSTAJE NIETKNIĘTY.** Czyścimy wyłącznie znaczniki
 * i style. Żadnego zamieniania cudzysłowów, myślników, spacji nierozdzielających
 * ani „poprawiania" wielkości liter — wklejony akapit ma po wklejeniu brzmieć
 * tak samo, co do znaku. To był drugi człon zgłoszenia: „kopiując tekst nie
 * zmieniaj go".
 *
 * **Co zostaje z formatowania**: pogrubienie, kursywa, podkreślenie,
 * przekreślenie, listy, nagłówki, akapity, odnośniki i kolor tekstu. Reszta
 * (rodzina i rozmiar czcionki z Worda, tła, marginesy, klasy) leci, bo to są
 * ustawienia dokumentu tekstowego, a nie wiadomości — Calibri 11 pt z Worda
 * w mailu wygląda źle i nadpisuje styl szablonu.
 */

/** Znaczniki, które przepuszczamy. Reszta jest rozwijana — treść zostaje, opakowanie znika. */
const KEEP_TAGS = new Set([
  "P",
  "BR",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "STRIKE",
  "A",
  "UL",
  "OL",
  "LI",
  "H1",
  "H2",
  "H3",
  "H4",
  "BLOCKQUOTE",
  "SPAN",
]);

/** Znaczniki wycinane RAZEM z zawartością — nie niosą treści, tylko śmieci. */
const DROP_TAGS = new Set(["STYLE", "SCRIPT", "META", "LINK", "TITLE", "HEAD", "O:P", "XML"]);

/**
 * Style, które przepuszczamy.
 *
 * Świadomie bez `font-family` i `font-size`: te przychodzą z Worda
 * (Calibri, 11 pt) i nadpisywałyby krój szablonu, przez co wklejony akapit
 * wyglądałby inaczej niż napisany na miejscu.
 */
const KEEP_STYLES = new Set(["font-weight", "font-style", "text-decoration", "color"]);

/** Adresy, które wolno zostawić w odnośniku. `javascript:` to wektor ataku. */
function safeHref(href: string): string | null {
  const clean = href.trim();
  return /^(https?:|mailto:|tel:|#)/i.test(clean) ? clean : null;
}

function cleanStyle(style: string): string {
  return style
    .split(";")
    .map((rule) => rule.trim())
    .filter((rule) => {
      const prop = rule.split(":")[0]?.trim().toLowerCase();
      if (!prop || !KEEP_STYLES.has(prop)) return false;
      // Word wpisuje wartości `mso-*` także w dozwolone właściwości.
      return !rule.toLowerCase().includes("mso-");
    })
    .join("; ");
}

/** Czy ten `<span>` cokolwiek wnosi. Pusty opakowuje treść bez powodu. */
function spanIsUseful(el: Element): boolean {
  return cleanStyle(el.getAttribute("style") ?? "") !== "";
}

function walk(node: Node, doc: Document): Node[] {
  if (node.nodeType === 3 /* tekst */) {
    // Tekst kopiowany 1:1 — bez normalizacji, bez zamiany znaków.
    return [doc.createTextNode(node.nodeValue ?? "")];
  }
  if (node.nodeType !== 1) return [];

  const el = node as Element;
  const tag = el.tagName.toUpperCase();

  if (DROP_TAGS.has(tag)) return [];

  const children = [...el.childNodes].flatMap((c) => walk(c, doc));

  // Komórki i wiersze tabeli: zawartość zostaje, układ znika. Word buduje
  // z tabel kolumny strony, a w wiadomości nie mamy takiego bloku — zostawienie
  // ich dałoby zagnieżdżone tabele, których nie da się już edytować.
  if (tag === "TD" || tag === "TH") {
    const p = doc.createElement("p");
    children.forEach((c) => p.appendChild(c));
    return p.textContent?.trim() ? [p] : [];
  }
  if (tag === "TABLE" || tag === "TBODY" || tag === "THEAD" || tag === "TR") return children;

  if (!KEEP_TAGS.has(tag)) {
    // Nieznany znacznik: rozwijamy. `DIV` z Google Docs to zwykle akapit,
    // więc dostaje `<p>`, żeby nie skleić wszystkiego w jedną linię.
    if (tag === "DIV" && children.length > 0) {
      const p = doc.createElement("p");
      children.forEach((c) => p.appendChild(c));
      return [p];
    }
    return children;
  }

  if (tag === "SPAN" && !spanIsUseful(el)) return children;

  const out = doc.createElement(tag.toLowerCase());
  if (tag === "A") {
    const href = safeHref(el.getAttribute("href") ?? "");
    if (!href) return children;
    out.setAttribute("href", href);
    // Odnośnik z maila otwiera się poza klientem pocztowym — zawsze nowa karta.
    out.setAttribute("target", "_blank");
    out.setAttribute("rel", "noopener noreferrer");
  }
  const style = cleanStyle(el.getAttribute("style") ?? "");
  if (style) out.setAttribute("style", style);

  children.forEach((c) => out.appendChild(c));

  // Puste opakowanie po czyszczeniu nic nie wnosi. `<br>` jest wyjątkiem —
  // ono z definicji nie ma treści, a niesie przełamanie linii.
  if (tag !== "BR" && !out.textContent?.trim() && out.childNodes.length === 0) return [];
  return [out];
}

/**
 * Wklejany HTML sprowadzony do postaci, którą edytor rozumie.
 *
 * @param html Zawartość `text/html` ze schowka.
 */
export function sanitizePastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Komentarze warunkowe Worda (`<!--[if gte mso 9]>`) potrafią nieść cały
  // arkusz stylów dokumentu.
  doc.body.querySelectorAll("*").forEach((el) => {
    if (el.nodeName.includes(":")) el.remove();
  });
  const cleaned = [...doc.body.childNodes].flatMap((n) => walk(n, doc));
  const wrapper = doc.createElement("div");
  cleaned.forEach((c) => wrapper.appendChild(c));
  return wrapper.innerHTML;
}

/** Zwykły tekst na HTML — każda linia osobnym akapitem, znaki bez zmian. */
export function plainTextToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((para) => `<p>${escape(para).split("\n").join("<br>")}</p>`)
    .join("");
}
