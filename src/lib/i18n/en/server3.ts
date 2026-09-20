/** Server messages, part 3: AI prompts, emails to patients and staff, logs, reports. */
export const server3: Record<string, string> = {
  '\nNie piszesz HTML-a. Układasz wiadomość z KLOCKÓW, które system sam zamieni na kod.\n\nDOSTĘPNE KLOCKI (typ + pola „data"):\n- image      {url, alt, radius:"0", width:"600", href?}  ← kadr z projektu; radius:"0" ZAWSZE, żeby kadry stykały się bez zaokrągleń\n- heading    {text, align:"left|center|right", fontSize:"26", color:"#111111"}\n- text       {html:"<p>…</p>", align}                    ← akapity; w html wolno tylko <p> <br> <strong> <em> <a href>\n- button     {label, url, align, fontSize:"16"}\n- divider    {}\n- spacer     {height:"24"}\n- social     {facebook, instagram, linkedin}             ← tylko gdy projekt ma ikony społecznościowe\n\nZASADY UKŁADANIA:\n1. Idziesz przez projekt OD GÓRY DO DOŁU i zamieniasz każdą sekcję na klocki, w tej samej kolejności.\n2. Fotografie, zrzuty ekranu, ilustracje, logo → klocek "image" z adresem KADRU (dostajesz listę). Każdy kadr użyj najwyżej raz.\n3. Teksty czytelne z projektu (nagłówki, akapity, etykiety przycisków, dane w stopce) → klocki "heading", "text", "button" — jako ŻYWY TEKST, nigdy jako obraz.\n4. Sekcja, w której zdjęcie stoi OBOK tekstu: daj klocek "image", a pod nim "heading" i "text". Wiadomość jest jednokolumnowa — na telefonie i tak by się tak ułożyła, a tak wygląda identycznie wszędzie.\n5. Odstępy między sekcjami: "spacer" (24 px między sekcjami, 12 wewnątrz). Linie oddzielające: "divider".\n6. Kolory tekstu i rozmiary odczytaj z projektu i wpisz w pola. Nagłówek główny zwykle 26–30 px, śródtytuł 20–22, akapit 15–16, stopka 11.\n7. OSTATNI klocek to ZAWSZE "text" ze stopką: dane placówki i zdanie o wypisie.\n   Klocek "text" jest jedynym, który renderuje HTML — klocek "footer" ESCAPUJE go, więc link\n   wypisu wyszedłby w wiadomości jako goły napis. Stopkę składasz tak:\n   {"type":"text","data":{"align":"center","html":"<p style=\'font-size:11px;color:#6b7280;line-height:1.6\'>NAZWA · ADRES · TELEFON<br>Nie chcesz otrzymywać tych wiadomości? <a href=\'%%PRM_UNSUBSCRIBE%%\'>Wypisz się</a>.</p>"}}\n   Placeholder %%PRM_UNSUBSCRIBE%% dokładnie w tej postaci — wysyłka podmienia go na adres jednorazowy.\n8. Nie używaj klocków "html", "form", "survey", "personalization", "header", "footer".\n\nAdresy obrazów WYŁĄCZNIE z listy kadrów. Jeśli na jakąś sekcję kadru brakuje — pomiń obraz, zakoduj sekcję samym tekstem i napisz o tym w rekomendacjach. Nigdy nie wymyślaj adresu i nie powtarzaj tego samego kadru.':
    '\nYou do not write HTML. You assemble the message from BLOCKS that the system turns into code.\n\nAVAILABLE BLOCKS (type + "data" fields):\n- image      {url, alt, radius:"0", width:"600", href?}  ← a frame from the design; radius:"0" ALWAYS, so frames meet without rounded corners\n- heading    {text, align:"left|center|right", fontSize:"26", color:"#111111"}\n- text       {html:"<p>…</p>", align}                    ← paragraphs; html may contain only <p> <br> <strong> <em> <a href>\n- button     {label, url, align, fontSize:"16"}\n- divider    {}\n- spacer     {height:"24"}\n- social     {facebook, instagram, linkedin}             ← only when the design has social icons\n\nLAYOUT RULES:\n1. Go through the design FROM TOP TO BOTTOM and turn each section into blocks, in the same order.\n2. Photos, screenshots, illustrations, logos → an "image" block with a FRAME URL (you get a list). Use each frame at most once.\n3. Text readable in the design (headings, paragraphs, button labels, footer details) → "heading", "text", "button" blocks — as LIVE TEXT, never as an image.\n4. A section with a photo NEXT TO text: use an "image" block, followed by "heading" and "text". The message is single-column — it would stack like that on a phone anyway, and this way it looks the same everywhere.\n5. Spacing between sections: "spacer" (24 px between sections, 12 inside). Separating lines: "divider".\n6. Read text colours and sizes from the design and put them in the fields. The main heading is usually 26–30 px, a subheading 20–22, a paragraph 15–16, the footer 11.\n7. The LAST block is ALWAYS "text" with the footer: the clinic\'s details and a sentence about unsubscribing.\n   The "text" block is the only one that renders HTML — the "footer" block ESCAPES it, so the unsubscribe\n   link would appear in the message as plain text. Build the footer like this:\n   {"type":"text","data":{"align":"center","html":"<p style=\'font-size:11px;color:#6b7280;line-height:1.6\'>NAME · ADDRESS · PHONE<br>Don\'t want to receive these messages? <a href=\'%%PRM_UNSUBSCRIBE%%\'>Unsubscribe</a>.</p>"}}\n   The placeholder %%PRM_UNSUBSCRIBE%% exactly in this form — sending replaces it with a one-time URL.\n8. Do not use the "html", "form", "survey", "personalization", "header", "footer" blocks.\n\nImage URLs ONLY from the frame list. If a section has no frame — skip the image, build the section from text only and mention it in the recommendations. Never invent a URL and never repeat the same frame.',
  '\nZASADY KODOWANIA POP-UPU:\n- To fragment HTML wstrzykiwany do gotowego okna na stronie placówki (system sam rysuje ramkę, tło okna i krzyżyk) — NIE koduj <html>/<head>/<body> ani własnego overlaya.\n- Style inline, nowoczesny CSS dozwolony (flexbox tak — to przeglądarka, nie klient pocztowy). Zero skryptów.\n- Responsywność: max-width:100%, obrazy width:100% height:auto, tekst czytelny na telefonie.\n- Odtwórz teksty z grafiki jako żywy tekst (dostępność, czytelność), grafika tylko tam, gdzie niezastępowalna.\n- Przycisk-łącze z wyraźnym wezwaniem do działania; jeśli użytkownik nie podał adresu docelowego, użyj href="#" i powiedz o tym w rekomendacjach.\n- Język polski.':
    '\nPOP-UP CODING RULES:\n- This is an HTML fragment injected into a ready-made window on the clinic\'s website (the system draws the frame, the window background and the close button) — do NOT code <html>/<head>/<body> or your own overlay.\n- Inline styles; modern CSS is allowed (flexbox yes — this is a browser, not an email client). No scripts.\n- Responsive: max-width:100%, images width:100% height:auto, text readable on a phone.\n- Recreate the text from the design as live text (accessibility, readability); images only where they cannot be replaced.\n- A link button with a clear call to action; if the user did not give a target URL, use href="#" and say so in the recommendations.\n- English language.',
  '<form {FORM_MARKER_ATTRIBUTE}\n      data-prm-tag="popup-lead"\n      data-prm-success="Dziękujemy! Odezwiemy się wkrótce.">\n\n  <input type="text"  name="firstName" placeholder="Imię" />\n  <input type="email" name="email" placeholder="E-mail" required />\n  <input type="tel"   name="phone" placeholder="Telefon" />\n\n  <label>\n    <input type="checkbox" name="consent" required />\n    Wyrażam zgodę na kontakt.\n  </label>\n\n  <button type="submit">Zapisz się</button>\n</form>':
    '<form {FORM_MARKER_ATTRIBUTE}\n      data-prm-tag="popup-lead"\n      data-prm-success="Thank you! We will be in touch soon.">\n\n  <input type="text"  name="firstName" placeholder="First name" />\n  <input type="email" name="email" placeholder="Email" required />\n  <input type="tel"   name="phone" placeholder="Phone" />\n\n  <label>\n    <input type="checkbox" name="consent" required />\n    I agree to be contacted.\n  </label>\n\n  <button type="submit">Sign up</button>\n</form>',
  '<h1 class="ok">Gotowe — zgody wycofane</h1>\n           <p>Adres <span class="who">{email}</span> nie będzie już otrzymywać naszych\n           wiadomości marketingowych.</p>\n           <p class="muted">Zmiana obowiązuje od razu. Nadal możemy kontaktować się w sprawach\n           dotyczących Twoich wizyt.</p>':
    '<h1 class="ok">Done — consent withdrawn</h1>\n           <p>The address <span class="who">{email}</span> will no longer receive our\n           marketing messages.</p>\n           <p class="muted">The change takes effect immediately. We may still contact you about\n           your visits.</p>',
  '<h1>Wypisanie z komunikacji marketingowej</h1>\n           <p>Cześć <span class="who">{name}</span>. Po potwierdzeniu wycofamy Twoje zgody na\n           marketing e-mail i SMS oraz na profilowanie. Przestaniesz otrzymywać od nas newslettery\n           i oferty.</p>\n           <form method="POST"><button type="submit">Potwierdzam wypisanie</button></form>\n           <p class="muted">Nadal będziemy mogli wysyłać wiadomości niemarketingowe dotyczące\n           Twoich wizyt — np. przypomnienie o terminie. Jeśli nie chcesz żadnego kontaktu,\n           napisz do nas.</p>':
    '<h1>Unsubscribe from marketing communication</h1>\n           <p>Hello <span class="who">{name}</span>. Once you confirm, we will withdraw your consent to\n           email and SMS marketing and to profiling. You will stop receiving newsletters\n           and offers from us.</p>\n           <form method="POST"><button type="submit">Confirm unsubscribe</button></form>\n           <p class="muted">We will still be able to send non-marketing messages about\n           your visits — e.g. an appointment reminder. If you want no contact at all,\n           write to us.</p>',
  '<h1>Zgody są już wycofane</h1>\n             <p>Adres <span class="who">{email}</span> nie otrzymuje od nas wiadomości\n             marketingowych. Nie musisz nic więcej robić.</p>\n             <p class="muted">Nadal możemy wysyłać wiadomości niemarketingowe dotyczące Twoich wizyt.</p>':
    '<h1>Consent already withdrawn</h1>\n             <p>The address <span class="who">{email}</span> does not receive marketing\n             messages from us. You do not need to do anything else.</p>\n             <p class="muted">We may still send non-marketing messages about your visits.</p>',
  "<h1>Nie rozpoznajemy tego linku</h1>\n             <p>Mógł wygasnąć albo pochodzić z wiadomości, której już nie ma w naszym systemie.\n             Jeśli chcesz wycofać zgodę, odpowiedz na dowolną naszą wiadomość — zrobimy to ręcznie.</p>":
    "<h1>We do not recognise this link</h1>\n             <p>It may have expired or come from a message that is no longer in our system.\n             If you want to withdraw consent, reply to any of our messages — we will do it manually.</p>",
  '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;font-family:Arial,Helvetica,sans-serif">\n<tr><td align="center">\n<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e7ec;border-radius:12px;padding:28px">\n\n<tr><td style="padding-bottom:4px;color:#667085;font-size:13px">{v0} · {v1}</td></tr>\n<tr><td style="padding-bottom:16px;font-size:20px;font-weight:700;color:#101828">Analiza bezpieczeństwa</td></tr>\n\n<tr><td style="padding:14px 16px;background:{kolor}12;border-left:4px solid {kolor2};border-radius:6px">\n  <div style="color:{kolor22};font-size:15px;font-weight:700;text-transform:uppercase">{v5}</div>\n  <div style="margin-top:4px;color:#101828;font-size:15px">{v6}</div>\n</td></tr>\n\n<tr><td style="padding-top:20px;color:#101828;font-size:14px;line-height:1.55">{v7}</td></tr>\n\n<tr><td style="padding-top:22px;font-size:15px;font-weight:700;color:#101828">Do zrobienia</td></tr>\n<tr><td>{kroki}</td></tr>\n\n<tr><td style="padding-top:24px;font-size:15px;font-weight:700;color:#101828">Sprawdzenia ({v9}/{length})</td></tr>\n<tr><td><table cellpadding="0" cellspacing="0" style="margin-top:6px">{sprawdzenia}</table></td></tr>\n\n<tr><td style="padding-top:24px;font-size:15px;font-weight:700;color:#101828">Ruch z ostatniej doby</td></tr>\n<tr><td><table cellpadding="0" cellspacing="0" style="margin-top:6px">\n{v12}\n{v13}\n{v14}\n{v15}\n</table></td></tr>\n\n<tr><td style="padding-top:24px;font-size:15px;font-weight:700;color:#101828">Sieci z serią odmów</td></tr>\n<tr><td><table cellpadding="0" cellspacing="0" style="margin-top:6px">{podejrzane}</table></td></tr>\n\n<tr><td style="padding-top:26px;border-top:1px solid #e4e7ec;color:#667085;font-size:12px;line-height:1.6">\n  Adresy skrócone do sieci, a tokeny w ścieżkach usunięte — do analizy nie trafiają\n  dane pozwalające rozpoznać pacjenta. Logi kasują się po 30 dniach.<br>\n  {v17}\n</td></tr>\n\n</table></td></tr></table>':
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;font-family:Arial,Helvetica,sans-serif">\n<tr><td align="center">\n<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e7ec;border-radius:12px;padding:28px">\n\n<tr><td style="padding-bottom:4px;color:#667085;font-size:13px">{v0} · {v1}</td></tr>\n<tr><td style="padding-bottom:16px;font-size:20px;font-weight:700;color:#101828">Security analysis</td></tr>\n\n<tr><td style="padding:14px 16px;background:{kolor}12;border-left:4px solid {kolor2};border-radius:6px">\n  <div style="color:{kolor22};font-size:15px;font-weight:700;text-transform:uppercase">{v5}</div>\n  <div style="margin-top:4px;color:#101828;font-size:15px">{v6}</div>\n</td></tr>\n\n<tr><td style="padding-top:20px;color:#101828;font-size:14px;line-height:1.55">{v7}</td></tr>\n\n<tr><td style="padding-top:22px;font-size:15px;font-weight:700;color:#101828">To do</td></tr>\n<tr><td>{kroki}</td></tr>\n\n<tr><td style="padding-top:24px;font-size:15px;font-weight:700;color:#101828">Checks ({v9}/{length})</td></tr>\n<tr><td><table cellpadding="0" cellspacing="0" style="margin-top:6px">{sprawdzenia}</table></td></tr>\n\n<tr><td style="padding-top:24px;font-size:15px;font-weight:700;color:#101828">Traffic in the last 24 hours</td></tr>\n<tr><td><table cellpadding="0" cellspacing="0" style="margin-top:6px">\n{v12}\n{v13}\n{v14}\n{v15}\n</table></td></tr>\n\n<tr><td style="padding-top:24px;font-size:15px;font-weight:700;color:#101828">Networks with a series of rejections</td></tr>\n<tr><td><table cellpadding="0" cellspacing="0" style="margin-top:6px">{podejrzane}</table></td></tr>\n\n<tr><td style="padding-top:26px;border-top:1px solid #e4e7ec;color:#667085;font-size:12px;line-height:1.6">\n  Addresses are shortened to networks and tokens removed from paths — no data that could identify\n  a patient goes into the analysis. Logs are deleted after 30 days.<br>\n  {v17}\n</td></tr>\n\n</table></td></tr></table>',
  'Jesteś PRM_Agent — asystentem zespołu polskiej przychodni, pracującym na karcie konkretnego pacjenta.\n\nZASADY, od których nie ma odstępstw:\n1. Opierasz się WYŁĄCZNIE na danych z sekcji FAKTY. Nie zmyślasz statystyk, dat,\n   preferencji ani "open rate". Jeśli czegoś nie ma w faktach — piszesz, że tego nie wiemy.\n2. Nie stawiasz diagnoz i nie doradzasz leczenia. Jesteś narzędziem obsługi\n   pacjenta i marketingu, nie personelem medycznym.\n3. Piszesz po polsku, zwięźle, konkretnie. Bez lania wody i bez marketingowego żargonu.\n4. Gdy proponujesz następny krok, musi on wynikać z faktów i mieścić się w zgodach:\n   pacjent bez zgody na e-mail nie dostanie propozycji mailingu.\n5. WEJŚCIA NA STRONĘ mówią, czym pacjent realnie się interesował — to często\n   najświeższy sygnał, jaki mamy. Powtarzające się wejścia na tę samą podstronę\n   (np. cennik) traktuj jako wyraźną intencję i wspominaj o nich wprost, razem\n   z adresem. Pojedyncze wejście na stronę główną nie znaczy nic.':
    "You are PRM_Agent — an assistant to a clinic's team, working on a specific patient's record.\n\nRULES WITHOUT EXCEPTIONS:\n1. You rely ONLY on the data in the FACTS section. You do not invent statistics, dates,\n   preferences or \"open rate\". If something is not in the facts, you say we do not know it.\n2. You do not diagnose and do not advise on treatment. You are a patient service\n   and marketing tool, not medical staff.\n3. You write in English, concisely and specifically. No padding and no marketing jargon.\n4. When you suggest a next step, it must follow from the facts and stay within the consents:\n   a patient without email consent will not get a mailing suggestion.\n5. WEBSITE VISITS show what the patient was really interested in — often the\n   freshest signal we have. Treat repeated visits to the same page\n   (e.g. pricing) as a clear intention and mention them directly, together\n   with the URL. A single visit to the home page means nothing.",
  'Jesteś PRM_Agentem — analitykiem bezpieczeństwa systemu PRM Core,\nCRM-a medycznego {v0}. Dostajesz gotowe liczby z ostatniej doby.\n\nZASADY:\n- Nie licz niczego samodzielnie i nie poprawiaj podanych liczb. Zostały policzone\n  przez kod. Twoim zadaniem jest powiedzieć, co one znaczą.\n- Pisz po polsku, rzeczowo, bez straszenia i bez uspokajania na wyrost.\n- Odróżniaj rutynę od sygnału: pojedyncze 404 to internetowy szum, seria żądań\n  pod te same zamknięte adresy z jednej sieci to skanowanie, a blokada logowania\n  na koncie pracownika to najczęściej zapomniane hasło, nie włamanie.\n- Gdy nie wiadomo, powiedz „nie wiadomo" i napisz, co by to rozstrzygnęło.\n- Nie proponuj blokowania adresów IP automatycznie.\n- Nie wymyślaj zdarzeń, których nie ma w danych.\n\nZgłoś wynik wywołaniem narzędzia "raport_bezpieczenstwa" — dokładnie raz.':
    'You are PRM_Agent — the security analyst of the PRM Core system,\na medical CRM {v0}. You get ready-made numbers from the last 24 hours.\n\nRULES:\n- Do not calculate anything yourself and do not correct the numbers given. They were calculated\n  by code. Your job is to say what they mean.\n- Write in English, matter-of-factly, without alarming and without unwarranted reassurance.\n- Tell routine from signal: a single 404 is internet noise, a series of requests\n  to the same closed URLs from one network is scanning, and a sign-in lockout\n  on a staff account is most often a forgotten password, not a break-in.\n- When it is not known, say "not known" and write what would settle it.\n- Do not propose blocking IP addresses automatically.\n- Do not invent events that are not in the data.\n\nReport the result by calling the "raport_bezpieczenstwa" tool — exactly once.',
  'Jesteś PRM_Agentem — koderem kreacji w systemie PRM Core {v0}. Dostajesz grafikę przygotowaną przez grafika i kodujesz z niej {what}.\n\n{craft}\n\n{v3}\n\nODPOWIADASZ WYŁĄCZNIE JSON-em (bez markdownu, bez płotków):\n{\n  "reply": "krótko po polsku, co ułożyłeś",\n  "subjects": ["3–5 propozycji tytułów wiadomości"],\n  "preheader": "tekst preheadera, 40–90 znaków",\n  "blocks": [\n    {"type": "image", "data": {"url": "…", "alt": "…", "radius": "0", "width": "600"}},\n    {"type": "heading", "data": {"text": "…", "align": "center", "fontSize": "28", "color": "#111111"}}\n  ],\n  "notes": ["co zostało kadrem, a co żywym tekstem"],\n  "recommendations": ["czego brakuje, co warto poprawić"]\n}\n\nPrzy poprawkach modyfikuj OSTATNIĄ wersję kodu (dostaniesz ją), nie zaczynaj od zera — chyba że użytkownik prosi inaczej.':
    'You are PRM_Agent — the creative coder in the PRM Core system {v0}. You get a design prepared by a designer and build {what} from it.\n\n{craft}\n\n{v3}\n\nYOU ANSWER ONLY WITH JSON (no markdown, no code fences):\n{\n  "reply": "briefly, in English, what you assembled",\n  "subjects": ["3–5 suggested subject lines"],\n  "preheader": "preheader text, 40–90 characters",\n  "blocks": [\n    {"type": "image", "data": {"url": "…", "alt": "…", "radius": "0", "width": "600"}},\n    {"type": "heading", "data": {"text": "…", "align": "center", "fontSize": "28", "color": "#111111"}}\n  ],\n  "notes": ["what became a frame and what became live text"],\n  "recommendations": ["what is missing, what is worth improving"]\n}\n\nFor changes, modify the LATEST version of the code (you will get it), do not start from scratch — unless the user asks otherwise.',
  'Jesteś asystentem budowania segmentów w PRM Core — systemie komunikacji z pacjentami polskiej placówki medycznej. Rozmawiasz po polsku, zwięźle i konkretnie.\n\nTWOJE ZADANIE\nZrozum, kogo użytkownik chce objąć segmentem, i zamień to na definicję warunków. Jeśli czegoś nie da się wyrazić — powiedz to WPROST i zaproponuj najbliższy sensowny odpowiednik, wyjaśniając, czym się różni od tego, o co pytał.\n\nJAK ZBUDOWANY JEST SEGMENT\nSegment to grupy warunków. W grupie warunki łączy „wszystkie” (AND) albo „dowolny” (OR); grupy między sobą tak samo. Dwa poziomy, głębiej się nie da.\n\nDOSTĘPNE WARUNKI — wolno ci używać WYŁĄCZNIE tych kluczy:\n{v0}\n\nWIADOMOŚCI, na które mogą wskazywać warunki otwarcia i kliknięcia (jako "value" podaj identyfikator z lewej, albo zostaw puste = dowolna wiadomość):\n{templateList}\n\nCZEGO SIĘ NIE DA — jeśli użytkownik o to prosi, powiedz otwarcie, że tego nie zbierzemy, i zaproponuj zamiennik:\n{v2}\n\nZASADY ROZMOWY\n1. Nie zgaduj adresów URL, nazw tagów, segmentów ani kampanii. Jeśli warunek ich potrzebuje, a użytkownik nie podał — DOPYTAJ. Lepiej zadać jedno pytanie niż zaproponować segment z wymyślonym adresem.\n2. Nie wywołuj narzędzia, dopóki nie masz kompletu informacji. Sama rozmowa nic nie kosztuje użytkownika poza czasem.\n3. Gdy masz komplet — wywołaj propose_segment i w treści odpowiedzi wyjaśnij po ludzku, kogo ten segment obejmie i czego NIE obejmie.\n4. Nigdy nie podawaj liczby osób. Nie znasz jej — system policzy ją sam i pokaże użytkownikowi.\n5. Jeśli prośba jest niewykonalna nawet w przybliżeniu, powiedz to i nie proponuj niczego na siłę.\n\nPRZYKŁAD ROZMOWY, O KTÓRY CHODZI\nUżytkownik: „Chcę segment z kontaktami, które kliknęły w przycisk «Umów wizytę» na stronie.”\nTy: wyjaśniasz, że kod śledzący zapisuje wejścia na adresy, a nie kliknięcia w elementy strony, więc kliknięcia w przycisk nie zobaczymy. Proponujesz zamiennik: osoby, które weszły na stronę rejestracji (bo tam prowadzi ten przycisk) — i pytasz o dokładny adres. Dodajesz, że jeśli chodzi o tych, którzy doszli dalej, można dołożyć drugi warunek na kolejny adres, ale system sprawdzi „był na obu”, a nie „najpierw na jednej, potem na drugiej” — kolejności nie zapisujemy.\n\n{v3}':
    'You are the segment-building assistant in PRM Core — a patient communication system for a medical clinic. You talk in English, concisely and specifically.\n\nYOUR TASK\nUnderstand whom the user wants the segment to include, and turn that into a definition of conditions. If something cannot be expressed — say so PLAINLY and suggest the closest sensible equivalent, explaining how it differs from what was asked.\n\nHOW A SEGMENT IS BUILT\nA segment is groups of conditions. Within a group conditions are combined with "all" (AND) or "any" (OR); groups are combined the same way. Two levels, no deeper.\n\nAVAILABLE CONDITIONS — you may use ONLY these keys:\n{v0}\n\nMESSAGES that open and click conditions can point to (give the identifier on the left as "value", or leave it empty = any message):\n{templateList}\n\nWHAT CANNOT BE DONE — if the user asks for it, say openly that we do not collect it, and suggest an alternative:\n{v2}\n\nCONVERSATION RULES\n1. Do not guess URLs, tag, segment or campaign names. If a condition needs them and the user did not give them — ASK. One question is better than a segment with an invented URL.\n2. Do not call the tool until you have all the information. The conversation itself costs the user nothing but time.\n3. When you have everything — call propose_segment and in your reply explain in plain words whom the segment will include and whom it will NOT.\n4. Never give a number of people. You do not know it — the system will count it and show it to the user.\n5. If the request cannot be met even approximately, say so and do not force a suggestion.\n\nAN EXAMPLE OF THE KIND OF CONVERSATION WE MEAN\nUser: "I want a segment of contacts who clicked the «Book a visit» button on the website."\nYou: explain that the tracking code records visits to URLs, not clicks on page elements, so a button click cannot be seen. Suggest an alternative: people who visited the booking page (because that is where the button leads) — and ask for the exact URL. Add that if they want those who got further, a second condition on another URL can be added, but the system checks "visited both", not "first one, then the other" — order is not recorded.\n\n{v3}',
  'Jesteś dyrektorem artystycznym przygotowującym projekt mailingu do zakodowania.\n\nDostajesz JEDEN plik z całym projektem. Twoim zadaniem jest wskazać, które fragmenty trzeba WYCIĄĆ jako osobne pliki graficzne, bo nie da się ich odtworzyć tekstem.\n\nWYCINAJ: fotografie, zrzuty ekranu, ilustracje, ikony, logo, elementy dekoracyjne o złożonej formie.\nNIE WYCINAJ: nagłówków, akapitów, etykiet przycisków, danych w stopce, jednolitych teł — to zostanie odtworzone jako żywy tekst.\n\nWspółrzędne podajesz jako UŁAMKI wymiarów obrazu (0–1), gdzie 0,0 to lewy górny róg:\n- left/top — położenie lewego górnego rogu kadru,\n- width/height — rozmiar kadru.\nKadr ma obejmować sam element z niewielkim marginesem, bez sąsiedniego tekstu.\n\nODPOWIADASZ WYŁĄCZNIE JSON-em:\n{\n  "slices": [\n    {"name": "krotka-nazwa-po-angielsku", "left": 0.0, "top": 0.0, "width": 1.0, "height": 0.22, "alt": "opis po polsku", "role": "hero|photo|screenshot|icon|logo|decor"}\n  ],\n  "sections": ["lista sekcji projektu od góry do dołu, po polsku — co po czym idzie"],\n  "palette": {"bg": "#ffffff", "text": "#111111", "accent": "#1e9bd7"}\n}\n\nKadrów ma być tyle, ile realnie potrzeba (zwykle 3–12). Nazwy bez polskich znaków i spacji.':
    'You are an art director preparing an email design for coding.\n\nYou get ONE file with the whole design. Your task is to point out which parts must be CUT OUT as separate image files because they cannot be recreated with text.\n\nCUT OUT: photos, screenshots, illustrations, icons, logos, decorative elements with complex shapes.\nDO NOT CUT OUT: headings, paragraphs, button labels, footer details, flat backgrounds — these will be recreated as live text.\n\nGive coordinates as FRACTIONS of the image dimensions (0–1), where 0,0 is the top left corner:\n- left/top — the position of the frame\'s top left corner,\n- width/height — the frame size.\nThe frame should contain only the element with a small margin, without neighbouring text.\n\nYOU ANSWER ONLY WITH JSON:\n{\n  "slices": [\n    {"name": "short-name-in-english", "left": 0.0, "top": 0.0, "width": 1.0, "height": 0.22, "alt": "description in English", "role": "hero|photo|screenshot|icon|logo|decor"}\n  ],\n  "sections": ["list of the design\'s sections from top to bottom, in English — what follows what"],\n  "palette": {"bg": "#ffffff", "text": "#111111", "accent": "#1e9bd7"}\n}\n\nMake as many frames as are really needed (usually 3–12). Names without accented characters and spaces.',
  'Jesteś nadzorcą systemu PRM Core — CRM i automatyzacji komunikacji z pacjentami placówki medycznej.\n\nDostajesz zrzut stanu systemu: automatyzacje z liczbą przebiegów, segmenty i tagi kontaktów, ostatnie błędy oraz listę spostrzeżeń, które już wykryły detektory deterministyczne.\n\nTwoje zadanie: dołożyć **to, czego liczenie nie pokaże** — wzorce i wnioski. Na przykład: segment, który urósł na tyle, że warto zrobić dla niego osobną komunikację; automatyzacja aktywna od dawna, do której nikt nie wchodzi (zły wyzwalacz); powtarzający się motyw w błędach; automatyzacja, która startuje, ale prawie nigdy nie kończy.\n\nZasady, bez wyjątków:\n1. **Nie powtarzaj spostrzeżeń, które są już na liście detektorów.** Zostały zgłoszone i użytkownik je widzi.\n2. **Nie zmyślaj liczb.** Używaj wyłącznie tych ze zrzutu. Jeśli czegoś nie ma w danych, nie twierdź, że jest.\n3. Maksymalnie 4 spostrzeżenia. Lepiej dwa trafne niż cztery oczywiste.\n4. Poziom "critical" tylko wtedy, gdy coś realnie szkodzi pacjentom albo danym. Wzorce i propozycje to "info".\n5. Pisz po polsku, zwięźle, bez marketingowego tonu. Pole proposedAction ma być czynnością, którą da się wykonać w tym systemie.\n6. Jeśli dane są zbyt ubogie na sensowne wnioski (mało kontaktów, brak przebiegów) — zwróć pustą listę. To poprawna odpowiedź.':
    'You are the supervisor of the PRM Core system — a CRM and patient communication automation for a medical clinic.\n\nYou get a snapshot of the system state: automations with their run counts, contact segments and tags, recent errors and the list of insights already found by deterministic detectors.\n\nYour task: add **what counting will not show** — patterns and conclusions. For example: a segment that has grown enough to deserve its own communication; an automation active for a long time that nobody enters (wrong trigger); a recurring theme in errors; an automation that starts but almost never finishes.\n\nRules, without exceptions:\n1. **Do not repeat insights that are already on the detectors\' list.** They have been reported and the user sees them.\n2. **Do not invent numbers.** Use only those in the snapshot. If something is not in the data, do not claim it is.\n3. At most 4 insights. Two accurate ones are better than four obvious ones.\n4. The "critical" level only when something really harms patients or data. Patterns and suggestions are "info".\n5. Write in English, concisely, without a marketing tone. The proposedAction field must be an action that can be done in this system.\n6. If the data is too thin for sensible conclusions (few contacts, no runs) — return an empty list. That is a correct answer.',
  'Jesteś projektantem automatyzacji marketingowych w PRM Core — systemie do komunikacji z pacjentami placówki medycznej.\n\nNa podstawie opisu użytkownika zaprojektuj scenariusz i zwróć go wywołaniem narzędzia build_automation. Zawsze wywołaj to narzędzie dokładnie raz.\n\nWYZWALACZE (trigger):\n{v0}\n\nWARUNKI (condition):\n{v1}\n\nAKCJE (action):\n{v2}\n\nDOSTĘPNE SZABLONY TREŚCI (pole "template" w akcjach wysyłki — używaj WYŁĄCZNIE tych nazw, dokładnie tak zapisanych):\n{templateLines}\n\nZasady:\n1. Używaj wyłącznie kluczy z powyższych list. Nie wymyślaj własnych.\n2. Akcje wysyłki (send_email, send_newsletter, send_sms, show_popup) wymagają pola config.template z nazwy powyżej. Jeśli dla danego kanału nie ma żadnego szablonu, nie używaj tej akcji.\n3. Scenariusz ma być realistyczny i możliwie prosty — zwykle 2–5 kroków. Nie dodawaj kroków, o które nikt nie prosił.\n4. Rozgałęzienia (condition, path, split, ai_agent) mogą mieć tylko jeden poziom zagnieżdżenia: w gałęziach umieszczaj wyłącznie akcje i opóźnienia.\n5. Który rodzaj rozgałęzienia wybrać:\n   - condition — jedno pytanie tak/nie (dwie gałęzie).\n   - path — kilka grup pacjentów rozróżnianych filtrami (np. wg segmentu, tagu, statusu). Odnogi są sprawdzane po kolei, kontakt schodzi pierwszą pasującą, więc ostatnia odnoga musi być bez filtrów jako „Pozostali”.\n   - split — test A/B: podział losowy wg procentów, bez żadnych warunków. Używaj TYLKO, gdy użytkownik prosi o test, porównanie wariantów albo losowy podział.\n   - ai_agent — tylko gdy decyzja naprawdę wymaga oceny kontekstu pacjenta i nie da się jej zapisać filtrem. Kosztuje realne pieniądze przy każdym kontakcie, więc gdy wystarczy filtr, użyj path lub condition.\n6. Nazwa automatyzacji: krótka, po polsku, bez cudzysłowów.\n7. W polu notes wypisz założenia i braki (np. „brak szablonu SMS — pominięto krok"), po polsku. Nie zmyślaj, że coś istnieje.':
    'You design marketing automations in PRM Core — a system for communicating with a medical clinic\'s patients.\n\nBased on the user\'s description, design a workflow and return it by calling the build_automation tool. Always call this tool exactly once.\n\nTRIGGERS (trigger):\n{v0}\n\nCONDITIONS (condition):\n{v1}\n\nACTIONS (action):\n{v2}\n\nAVAILABLE CONTENT TEMPLATES (the "template" field in send actions — use ONLY these names, spelled exactly like this):\n{templateLines}\n\nRules:\n1. Use only keys from the lists above. Do not invent your own.\n2. Send actions (send_email, send_newsletter, send_sms, show_popup) require config.template with a name from above. If there is no template for a channel, do not use that action.\n3. The workflow should be realistic and as simple as possible — usually 2–5 steps. Do not add steps nobody asked for.\n4. Branches (condition, path, split, ai_agent) can only have one level of nesting: put only actions and delays in the branches.\n5. Which kind of branch to choose:\n   - condition — one yes/no question (two branches).\n   - path — several groups of patients told apart by filters (e.g. by segment, tag, status). Branches are checked in order, a contact takes the first one that matches, so the last branch must have no filters, as "Everyone else".\n   - split — A/B test: a random split by percentages, without conditions. Use ONLY when the user asks for a test, a comparison of variants or a random split.\n   - ai_agent — only when the decision really needs an assessment of the patient\'s context and cannot be written as a filter. It costs real money for every contact, so when a filter is enough, use path or condition.\n6. Automation name: short, in English, without quotation marks.\n7. In the notes field list assumptions and gaps (e.g. "no SMS template — step skipped"), in English. Do not pretend that something exists.',
  "\n\nDOSTĘPNE KADRY (używaj WYŁĄCZNIE tych adresów, każdy najwyżej raz):\n":
    "\n\nAVAILABLE FRAMES (use ONLY these URLs, each at most once):\n",
  "\n\nOBECNY UKŁAD (zmodyfikuj go i oddaj CAŁY, w tym samym formacie):\n":
    "\n\nCURRENT LAYOUT (modify it and return ALL of it, in the same format):\n",
  "\n\nSEKCJE PROJEKTU (od góry):\n{v0}": "\n\nDESIGN SECTIONS (from the top):\n{v0}",
  "  (brak wysłanych wiadomości — warunki otwarcia/kliknięcia zostaw bez wskazania konkretnej)":
    "  (no messages sent — leave open/click conditions without a specific message)",
  " (model wskazał nieistniejącą ścieżkę „{wanted}” — użyto pierwszej)":
    " (the model named a path that does not exist, “{wanted}” — the first one was used)",
  " Dozwolone wartości: {v0}.": " Allowed values: {v0}.",
  " Obsługuje okno czasowe (days: 0 = kiedykolwiek, 7, 30, 90, 365).":
    " Supports a time window (days: 0 = ever, 7, 30, 90, 365).",
  " Załączniki: {v0}": " Attachments: {v0}",
  " · {v0}/{v1} tokenów{v2}": " · {v0}/{v1} tokens{v2}",
  "(Pominięto {skipped} wpisów — baza wiedzy przekracza limit kontekstu. Jeśli pytanie dotyczy czegoś, czego tu nie ma, powiedz o tym zamiast zgadywać.)":
    "(Skipped {skipped} entries — the knowledge base exceeds the context limit. If the question is about something that is not here, say so instead of guessing.)",
  "(bez tytułu)": "(untitled)",
  "(brak szablonów)": "(no templates)",
  "(brak — powiązanie będzie zgadywane z grafiku)":
    "(none — the link will be guessed from the schedule)",
  "(domyślnie: nie)": "(default: no)",
  "(domyślnie: tak)": "(default: yes)",
  "(nie przysłano — nie zapiszemy niczego)": "(not sent — nothing will be saved)",
  "(nie przysłano — zapiszemy brak zgody, nie odmowę)":
    "(not sent — we will record no consent, not a refusal)",
  "(plan usunięty)": "(plan deleted)",
  "(środki na koncie, dane w Integracje → Klucze i dane dostępowe, nadawcę w Integracje → SMS API).</p>":
    "(account balance, credentials in Integrations → Keys and credentials, the sender in Integrations → SMS API).</p>",
  ", przedłużono {przedluzone} będących w użyciu": ", extended {przedluzone} still in use",
  "- (brak zarejestrowanych zdarzeń)": "- (no recorded events)",
  "- {key} — „{label}” (pole własne placówki). Operatory: jest dokładnie / nie jest / zawiera / nie zawiera / zaczyna się od / jest uzupełnione / jest puste.":
    "- {key} — “{label}” (clinic's custom field). Operators: is exactly / is not / contains / does not contain / starts with / is filled in / is empty.",
  "/health bez szczegółów dla anonimowych": "/health without details for anonymous users",
  "<p>Dopóki bramka nie działa, konta chroni samo hasło. Sprawdź Twilio ":
    "<p>While the gateway is down, accounts are protected by the password alone. Check Twilio ",
  "<p>Kod weryfikacyjny nie został wysłany, więc logowanie odbyło się ":
    "<p>The verification code was not sent, so the sign-in happened ",
  "<p>Ktoś poprosił o ustawienie nowego hasła do konta <strong>{email}</strong> w PRM Core.</p>":
    "<p>Someone asked to set a new password for the account <strong>{email}</strong> in PRM Core.</p>",
  "<p>Twój kod weryfikacyjny do PRM Core:</p>": "<p>Your PRM Core verification code:</p>",
  "<p>Ważny {v0} minut. Nikomu go nie podawaj — ": "<p>Valid for {v0} minutes. Never share it — ",
  "<strong>Powód:</strong> {reason}</p>": "<strong>Reason:</strong> {reason}</p>",
  "<strong>bez drugiego składnika</strong>.</p>": "<strong>without a second factor</strong>.</p>",
  "Analiza bezpieczeństwa PRM Core": "PRM Core security analysis",
  "Automatyzacja jest pusta — dodaj wyzwalacz i przynajmniej jedną akcję.":
    "The automation is empty — add a trigger and at least one action.",
  "Automatyzacja musi zaczynać się od wyzwalacza.": "The automation must start with a trigger.",
  "Automatyzacja musi zawierać przynajmniej jedną akcję.":
    "The automation must contain at least one action.",
  "Automatyzacja została wyłączona — przebieg zatrzymany.":
    "The automation was turned off — run stopped.",
  "BEZ drugiego składnika. Powód: {reason}": "WITHOUT a second factor. Reason: {reason}",
  "Brak klucza Anthropic — uzupełnij go w Integracje → Klucze i dane dostępowe. PRM_Agent nie może wykonać zapytania.":
    "No Anthropic key — add it in Integrations → Keys and credentials. PRM_Agent cannot run the request.",
  "Brak klucza Google — uzupełnij go w Integracje → Klucze i dane dostępowe. PRM_Agent nie może wykonać zapytania.":
    "No Google key — add it in Integrations → Keys and credentials. PRM_Agent cannot run the request.",
  "Brak klucza OpenAI — uzupełnij go w Integracje → Klucze i dane dostępowe. PRM_Agent nie może wykonać zapytania.":
    "No OpenAI key — add it in Integrations → Keys and credentials. PRM_Agent cannot run the request.",
  "Brak skonfigurowanego klucza SendGrid — uzupełnij go w Integracje → Klucze i dane dostępowe.":
    "No SendGrid key configured — add it in Integrations → Keys and credentials.",
  "Brak skonfigurowanego nadawcy SMS — nie wysłano nic.":
    "No SMS sender configured — nothing was sent.",
  "Brak skonfigurowanych danych Twilio — uzupełnij je w Integracje → Klucze i dane dostępowe.":
    "No Twilio credentials configured — add them in Integrations → Keys and credentials.",
  "Brakuje: {v0}. Kroki korzystające z tych integracji będą kończyć się błędem.":
    "Missing: {v0}. Steps using these integrations will fail.",
  "Brakujące treści: {v0}. Kroki wysyłki zakończą się błędem.":
    "Missing content: {v0}. Send steps will fail.",
  "Bramka SMS nie wysłała kodu weryfikacyjnego — {email} został zalogowany ":
    "The SMS gateway did not send the verification code — {email} was signed in ",
  "Błąd połączenia z Claude API: {v0}": "Error connecting to the Claude API: {v0}",
  "Błąd wywołania AI: {v0}": "AI call error: {v0}",
  "Claude API odrzuciło zapytanie: {message}": "The Claude API rejected the request: {message}",
  "Claude odmówił wykonania zapytania ze względów bezpieczeństwa.":
    "Claude declined the request for safety reasons.",
  "Dodano odnogę „Pozostali” bez filtra — bez niej kontakt niepasujący do żadnego filtra trafiłby na ostatnią odnogę wbrew jej warunkom.":
    "Added an “Everyone else” branch without a filter — without it, a contact matching no filter would go to the last branch against its conditions.",
  "Dostęp zewnętrznych asystentów AI do narzędzi systemu. Bez tokenu dostęp jest wyłączony.":
    "Access for external AI assistants to the system's tools. Without a token, access is off.",
  "Dozwolone wartości: włączone albo wyłączone.": "Allowed values: on or off.",
  "Dwa kafelki mają ten sam identyfikator.": "Two tiles have the same identifier.",
  "Dzienny limit kosztów AI wyczerpany ({v0} / {v1} USD) — węzeł pominięty, wybrano pierwszą ścieżkę.":
    "Daily AI cost limit reached ({v0} / {v1} USD) — step skipped, the first path was chosen.",
  "E-maile: kampanie, automatyzacje, Skrzynka, kody logowania i raport bezpieczeństwa.":
    "Emails: campaigns, automations, Inbox, sign-in codes and the security report.",
  "Funkcje serwerowe wymagają zalogowania": "Server functions require signing in",
  "Gemini odrzucił zapytanie: {detail}": "Gemini rejected the request: {detail}",
  "Hasło zostaje takie, jakie jest, a odnośnik wygaśnie sam.</p>":
    "The password stays as it is, and the link will expire by itself.</p>",
  "Jednokrotny wybór": "Single choice",
  "Kafelek ma niepoprawną definicję.": "The tile has an invalid definition.",
  "Każdy pasujący kontakt uruchamia przebieg, który kończy się natychmiast — nic się nie wykona. Scenariusz przeszedł walidację przy aktywacji, więc krawędź zniknęła podczas późniejszej edycji.":
    "Every matching contact starts a run that ends immediately — nothing will happen. The workflow passed validation on activation, so the connection disappeared during a later edit.",
  "Kliknij „Podłącz stronę” jeszcze raz i zaznacz strony na liście.":
    "Click “Connect page” again and select the pages on the list.",
  "Klinika ABC — Zdrowie w dobrych rękach": "ABC Clinic — Your health in good hands",
  "Kod jest w źródle strony, ale wysyła dane na localhost — to adres, który działa wyłącznie na komputerze programisty. Wklej kod jeszcze raz, z tej strony.":
    "The code is in the page source, but it sends data to localhost — an address that only works on a developer's computer. Paste the code again, from this page.",
  "Kod znaleziony w źródle strony.": "Code found in the page source.",
  "Kontakt usunięty": "Contact deleted",
  "Kontakt {contactId} (usunięty)": "Contact {contactId} (deleted)",
  "Krok {nodeId} nie istnieje już w scenariuszu.":
    "Step {nodeId} no longer exists in the workflow.",
  "Krok „{v0}” ma niepodłączoną ścieżkę wyjścia.": "Step “{v0}” has an unconnected output.",
  "Krok „{v0}” nie jest połączony z resztą scenariusza.":
    "Step “{v0}” is not connected to the rest of the workflow.",
  "Kroki po rozgałęzieniu ({dropped}) nie zostały wstawione — dodaj je w wybranej gałęzi w builderze.":
    "Steps after the branch ({dropped}) were not inserted — add them in the chosen branch in the builder.",
  "Kroków: {done}": "Steps: {done}",
  "Ktoś wywołuje /api/webhooks/leads z nieprawidłowym sekretem. To albo zepsuta integracja po zmianie sekretu, albo próba dobrania się do endpointu.":
    "Someone is calling /api/webhooks/leads with an invalid secret. Either an integration broke after a secret change, or someone is probing the endpoint.",
  "Link wygasł": "Link expired",
  "Materiały edukacyjne": "Educational materials",
  "Miara „{m}” nie należy do źródła {label}.": "Measure “{m}” does not belong to source {label}.",
  "Model nie odpowiedział: {v0}.": "The model did not respond: {v0}.",
  "Model podał nieznany wyzwalacz „{triggerKey}” — użyto „Nowy kontakt”. Zmień go w builderze.":
    "The model gave an unknown trigger “{triggerKey}” — “New contact” was used. Change it in the builder.",
  "Na początku albo na końcu jest spacja — pewnie z kopiowania.":
    "There is a space at the start or end — probably from copying.",
  "Nagłówki bezpieczeństwa": "Security headers",
  "Najwyżej {maxDims} wymiary.": "At most {maxDims} dimensions.",
  "Nic w systemie nie wysyła jeszcze tego zdarzenia — ten wyzwalacz nigdy nie uruchomi automatyzacji.":
    "Nothing in the system sends this event yet — this trigger will never start the automation.",
  "Nie da się filtrować po tym polu.": "This field cannot be filtered on.",
  "Nie ma kodu w źródle strony, ale działa tam Google Tag Manager ({v0}). Kod może siedzieć w kontenerze — sprawdź go tam. Rozstrzyga dopiero odebrany sygnał.":
    "There is no code in the page source, but Google Tag Manager runs there ({v0}). The code may be in the container — check there. Only a received signal settles it.",
  "Nie mam pewności, o co chodzi — doprecyzuj proszę.":
    "I am not sure what you mean — could you clarify?",
  "Nie udało się odczytać odpowiedzi modelu ({v0}). Spróbuj ponownie albo doprecyzuj polecenie.":
    "Could not read the model's answer ({v0}). Try again or make the instruction more specific.",
  "Nie udało się wysłać SMS-a: {v0}": "Could not send the SMS: {v0}",
  "Nie udało się wysłać e-maila: {v0}": "Could not send the email: {v0}",
  "Nie widzę katalogu z logami ({LOG_DIR}). Czy wdrożono zmianę w docker-compose.yml?":
    "I cannot see the log directory ({LOG_DIR}). Was the change to docker-compose.yml deployed?",
  "Nie wyszła — sprawdź dziennik silnika": "Not sent — check the engine log",
  "Nie znaleziono kodu w źródle strony ani menedżera tagów.":
    "No code found in the page source and no tag manager.",
  "Nieprawidłowy parametr bezpieczeństwa — spróbuj podłączyć jeszcze raz.":
    "Invalid security parameter — try connecting again.",
  "Nieznane narzędzie „{name}”.": "Unknown tool “{name}”.",
  "Nieznane pole „{field}” — warunek pominięty.": "Unknown field “{field}” — condition skipped.",
  "Nieznane źródło danych.": "Unknown data source.",
  "Nieznane źródło": "Unknown source",
  "Nowa wiadomość e-mail": "New email",
  "ODDAJĄ KARTOTEKI BEZ LOGOWANIA — to wyciek danych pacjentów":
    "SERVE PATIENT RECORDS WITHOUT SIGN-IN — this is a patient data leak",
  "Obejrzeć ruch z {length} sieci, które dostały najwięcej odmów.":
    "Review the traffic from the {length} networks with the most rejections.",
  "Oceń prawdopodobieństwo stawienia się pacjenta na wizytę i automatycznie dobierz najskuteczniejszy kanał przypomnienia.":
    "Assess how likely the patient is to attend the visit and automatically choose the most effective reminder channel.",
  "Odmowa: {reason} Nie wysłano nic.": "Refused: {reason} Nothing was sent.",
  "Omówienie bez udziału modelu — poniżej same liczby. ":
    "Overview without the model — the numbers only below. ",
  "OpenAI odrzuciło zapytanie: {detail}": "OpenAI rejected the request: {detail}",
  "Ostatni błąd: {error}": "Last error: {error}",
  "Otwórz Przebiegi tej automatyzacji, sprawdź krok, na którym się zatrzymuje, i popraw jego konfigurację.":
    "Open this automation's Runs, check the step where it stops and fix its configuration.",
  "Otwórz automatyzację i zapisz ją ponownie — publikacja wyśle szablony na serwer. Jeśli szablon został skasowany, wybierz inny.":
    "Open the automation and save it again — publishing sends the templates to the server. If a template was deleted, choose another.",
  "Otwórz automatyzację w builderze i połącz kroki. Przycisk „Przetestuj” pokaże na wybranym kontakcie, dokąd faktycznie dochodzi ścieżka.":
    "Open the automation in the builder and connect the steps. The “Test” button shows on a chosen contact where the path really leads.",
  "PRM_Agent nie podjął decyzji w {MAX_TOOL_ROUNDS} rundach — wybrano pierwszą ścieżkę.":
    "PRM_Agent did not decide within {MAX_TOOL_ROUNDS} rounds — the first path was chosen.",
  "PRM_Agent nie wybrał ścieżki (model odpowiedział tekstem: „{v0}”) — wybrano pierwszą ścieżkę.":
    "PRM_Agent did not choose a path (the model answered with text: “{v0}”) — the first path was chosen.",
  "PRM_SECRETS_KEY w pliku .env ma zły format — potrzebne 64 znaki szesnastkowe.":
    "PRM_SECRETS_KEY in the .env file has the wrong format — 64 hexadecimal characters are needed.",
  "Pacjent kliknął link wypisania w wiadomości.":
    "The patient clicked the unsubscribe link in a message.",
  "Pacjent nie ma adresu e-mail — nie wysłano wiadomości.":
    "The patient has no email address — no message was sent.",
  "Pacjent nie ma numeru telefonu — nie wysłano SMS-a.":
    "The patient has no phone number — no SMS was sent.",
  "Plan „{name}” nie ma jeszcze treści": "Plan “{name}” has no content yet",
  "Plan: pacjent nie ma przypisanego żadnego planu": "Plan: the patient has no assigned plan",
  "Plik {id} nie istnieje już w bibliotece Media.":
    "File {id} no longer exists in the Media library.",
  "Po polu „{label}” nie da się filtrować.": "The “{label}” field cannot be filtered on.",
  "Po przekroczeniu limitu węzły AI zaczną być pomijane.":
    "Once the limit is exceeded, AI steps will start being skipped.",
  "Pobieranie projektów z Canvy do Studia.": "Fetching designs from Canva into Studio.",
  "Podnieś limit w Ustawienia → PRM_Agent albo ogranicz liczbę węzłów AI w aktywnych automatyzacjach.":
    "Raise the limit in Settings → PRM_Agent or reduce the number of AI steps in active automations.",
  "Podłączono stron: {okCount}.": "Pages connected: {okCount}.",
  "Podłączono {okCount}, nie udało się dla: {v1}": "Connected {okCount}, failed for: {v1}",
  "Pola bez odpowiednika w Ustawieniach → Pola kontaktu (zignorowane): {v0}. Załóż je w systemie albo popraw nazwę.":
    "Fields without a counterpart in Settings → Contact fields (ignored): {v0}. Create them in the system or fix the name.",
  "Pole „{label}” nie istnieje na kontakcie — warunek pominięty.":
    "Field “{label}” does not exist on the contact — condition skipped.",
  "Pominięto nieznany krok „{v0}”.": "Skipped the unknown step “{v0}”.",
  "Pominięto nieznany warunek „{key}”.": "Skipped the unknown condition “{key}”.",
  "Pominięto warunek na nieistniejącym polu „{field}”.":
    "Skipped a condition on the non-existent field “{field}”.",
  "Pominięto warunek „{field}” z nieznanym operatorem „{operator}”.":
    "Skipped condition “{field}” with the unknown operator “{operator}”.",
  "Ponowne zgłoszenie z formularza.": "Repeat submission from a form.",
  "Potencjalny pacjent — implant słuchowy": "Potential patient — hearing implant",
  "Powiązywanie pacjentów nie powiodło się: {v0}": "Linking patients failed: {v0}",
  "Powiązywanie pominęło {noDoctor} kontaktów — nie rozpoznano lekarza: ":
    "Linking skipped {noDoctor} contacts — the doctor was not recognised: ",
  "Pozyskanie: źródło {v0}, medium {v1}, kampania {v2}":
    "Acquisition: source {v0}, medium {v1}, campaign {v2}",
  "Połączono z kontem {accountName}.": "Connected to account {accountName}.",
  "Przebieg zakończony — koniec ścieżki.": "Run finished — end of path.",
  "Przebieg zakończony.": "Run finished.",
  "Przebiegi kończą się statusem „failed” bez zapisanego powodu.":
    "Runs end with the “failed” status without a recorded reason.",
  "Przebiegi mają status „w toku”, ale nie mają zaplanowanego kolejnego kroku i nic się w nich nie działo od ponad {v0} godzin.":
    "Runs have the “in progress” status, but have no next step scheduled and nothing has happened in them for more than {v0} hours.",
  "Przekroczono limit {MAX_STEPS_PER_RUN} kroków — możliwa pętla w scenariuszu.":
    "The {MAX_STEPS_PER_RUN}-step limit was exceeded — the workflow may contain a loop.",
  "Przeniesione z Ustawień → SMTP.": "Moved from Settings → SMTP.",
  "Przeniesiono dane dostępowe z .env do panelu": "Credentials moved from .env to the panel",
  Przychodzące: "Incoming",
  "Przygotowałem propozycję segmentu.": "I have prepared a segment suggestion.",
  "Przypominamy o wizycie jutro o 10:00 w Klinika ABC. W razie pytań: 22 000 00 00.":
    "A reminder of your visit tomorrow at 10:00 at ABC Clinic. Questions: 22 000 00 00.",
  "Pusta treść — nie wysłano nic.": "Empty content — nothing was sent.",
  "Raport ma niepoprawną definicję.": "The report has an invalid definition.",
  "Rozgałęzienie wymaga co najmniej dwóch odnóg — pominięto je.":
    "A branch step needs at least two branches — it was skipped.",
  "Rozważ zamianę tego węzła na warunek albo rozgałęzienie z filtrem — decyzja jest przewidywalna, a deterministyczny krok jest darmowy i szybszy.":
    "Consider replacing this step with a condition or a branch with a filter — the decision is predictable, and a deterministic step is free and faster.",
  "SMS (krótka wiadomość, maksymalnie 320 znaków, bez formatowania)":
    "SMS (a short message, at most 320 characters, no formatting)",
  "SMS wychodzące i przychodzące oraz kody logowania SMS.":
    "Outgoing and incoming SMS and SMS sign-in codes.",
  "SendGrid odrzucił wysyłkę: {detail}": "SendGrid rejected the send: {detail}",
  "Serwer został zatrzymany w środku wykonywania kroku (status „processing” bez zakończenia). Krok mógł być wysyłką, której los jest nieznany — dlatego NIE jest ponawiany automatycznie.":
    "The server was stopped in the middle of running a step (status “processing” without completion). The step may have been a send whose outcome is unknown — so it is NOT retried automatically.",
  "Split A/B wymaga co najmniej dwóch wariantów — pominięto go.":
    "An A/B split needs at least two variants — it was skipped.",
  "Sprawdź konfigurację tego kroku — powtarzalny błąd zwykle oznacza brakujący szablon, pusty numer nadawcy albo nieosiągalną integrację.":
    "Check this step's configuration — a recurring error usually means a missing template, an empty sender number or an unreachable integration.",
  "Sprawdź listę lekarzy (Lekarze) — bez ich identyfikatora nie ma czego zapytać o grafik.":
    "Check the doctor list (Doctors) — without their identifier there is nothing to ask for a schedule.",
  "Sprawdź w Integracje → Meta Ads, czy Zapier ma aktualny sekret. Jeśli tak — zrotuj sekret; stare wywołania przestaną przechodzić.":
    "Check in Integrations whether the sending system has the current secret. If it does — rotate the secret; old calls will stop getting through.",
  "Sprawdź w Kontaktach źródło dzisiejszych wpisów. Jeśli to spam z formularza, rozważ dodanie pola-pułapki albo wyłączenie pop-upu z formularzem.":
    "Check the source of today's entries in Contacts. If it is form spam, consider adding a honeypot field or turning off the pop-up with the form.",
  "Sprawdź w dzienniku silnika, czy wiadomość z tego kroku wyszła (wiersz „action” obok wpisu przebiegu). Jeśli nie wyszła — wyłącz i włącz automatyzację, aby domknąć osierocone przebiegi.":
    "Check in the engine log whether this step's message went out (the “action” row next to the run entry). If it did not — turn the automation off and on to close orphaned runs.",
  "Sprawdź, czy krok, na którym stoją, nie został skasowany ze scenariusza. Wyłączenie i włączenie automatyzacji zamyka osierocone przebiegi.":
    "Check whether the step they are stuck on was deleted from the workflow. Turning the automation off and on closes orphaned runs.",
  "Sprzątanie segmentów: usunięto {usuniete} po terminie ważności":
    "Segment clean-up: deleted {usuniete} past their expiry",
  "Strona niepodłączona": "Page not connected",
  "Synchronizacja grafików nie powiodła się: {v0}": "Schedule sync failed: {v0}",
  "Synchronizacja pacjentów nie powiodła się: {v0}": "Patient sync failed: {v0}",
  "Ten odnośnik jest nieprawidłowy.": "This link is invalid.",
  "Ten odnośnik został już użyty.": "This link has already been used.",
  "To był Twój ostatni kod zapasowy. Wygeneruj nowe w Ustawieniach → Bezpieczeństwo.":
    "That was your last backup code. Generate new ones in Settings → Security.",
  "Token sprawdza klient MCP przy pierwszym połączeniu.":
    "The MCP client checks the token on the first connection.",
  "Trasa {sciezka} zamknięta": "Route {sciezka} closed",
  "Twilio odrzucił wysyłkę: {detail}": "Twilio rejected the send: {detail}",
  "Twój kod weryfikacyjny: {code}\nWażny {v1} minut. Nikomu go nie podawaj.":
    "Your verification code: {code}\nValid for {v1} minutes. Never share it.",
  "Uzupełnij klucze w Integracje → Klucze i dane dostępowe.":
    "Add the keys in Integrations → Keys and credentials.",
  "Użyto kodu zapasowego. Zostało ich {recoveryLeft}.":
    "A backup code was used. {recoveryLeft} left.",
  "W ostatniej dobie: {total} żądań, {notFound} odmów 404, ":
    "In the last 24 hours: {total} requests, {notFound} 404 rejections, ",
  "WEJŚCIA NA STRONĘ ({length}) — najnowsze pierwsze:": "WEBSITE VISITS ({length}) — newest first:",
  "WIADOMOŚCI W SKRZYNCE ({length}):": "INBOX MESSAGES ({length}):",
  "WYSŁANE E-MAILE: {length}": "EMAILS SENT: {length}",
  "WYSŁANE SMS-y: {length}": "SMS SENT: {length}",
  "Wartość jest za długa.": "The value is too long.",
  "Wartość nie może być pusta — żeby usunąć, użyj „Usuń”.":
    "The value cannot be empty — to remove it, use “Remove”.",
  "Wartość zawiera znak nowej linii albo tabulator.":
    "The value contains a newline or tab character.",
  "Warunek „{label}” nie ma wartości — pominięty w liczeniu.":
    "Condition “{label}” has no value — skipped in counting.",
  "Wiadomość z kliniki": "Message from the clinic",
  "Wizyty i przychód": "Visits and revenue",
  "Wpis {name} zapisano innym kluczem głównym (PRM_SECRETS_KEY).":
    "Entry {name} was saved with a different master key (PRM_SECRETS_KEY).",
  "Wpisu {name} nie da się odszyfrować — jest uszkodzony albo należy do innego pola.":
    "Entry {name} cannot be decrypted — it is damaged or belongs to another field.",
  "Wszystkie sprawdzenia przeszły.": "All checks passed.",
  "Wybierz, co liczyć.": "Choose what to count.",
  "Wybierz, po czym grupować.": "Choose what to group by.",
  Wychodzące: "Outgoing",
  "Wykres liniowy grupuje najpierw po czasie: dzień, tydzień albo miesiąc.":
    "A line chart groups by time first: day, week or month.",
  "Wymagane zalogowanie — zaloguj się i spróbuj ponownie.":
    "Sign-in required — sign in and try again.",
  "Wymiar „{v0}” nie należy do źródła {label}.":
    "Dimension “{v0}” does not belong to source {label}.",
  "Wysyłka jeszcze nie dotarła do tej osoby": "The send has not reached this person yet",
  Wysłana: "Sent",
  "Wysłano SMS na {phone}.": "SMS sent to {phone}.",
  "Wysłano e-mail „{subject}” na {email}.": "Email “{subject}” sent to {email}.",
  "Wysłano {v0} „{subject}” na {email}.": "Sent {v0} “{subject}” to {email}.",
  "Wysłany ręcznie": "Sent manually",
  "Węzeł Agent AI nie ma zdefiniowanych ścieżek — nie ma z czego wybierać.":
    "The AI agent step has no paths defined — there is nothing to choose from.",
  "Węzeł Agent AI wymaga co najmniej dwóch ścieżek — pominięto go.":
    "The AI agent step needs at least two paths — it was skipped.",
  "Węzły AI są pomijane — przebiegi idą pierwszą ścieżką. Deterministyczne kroki działają normalnie.":
    "AI steps are skipped — runs take the first path. Deterministic steps work normally.",
  "Własny limit raportu wyczerpany (${v0} / ${v1}).":
    "The report's own limit is reached (${v0} / ${v1}).",
  "Za dużo kombinacji do pokazania — zawęź zakres dat, dodaj filtr albo zmień wymiar na mniej szczegółowy.":
    "Too many combinations to show — narrow the date range, add a filter or choose a less detailed dimension.",
  "Zakoduj wiadomość z załączonej grafiki.": "Build the message from the attached design.",
  "Zakres może obejmować najwyżej {MAX_RANGE_DAYS} dni.":
    "The range can cover at most {MAX_RANGE_DAYS} days.",
  "Zakładanie kont zostało wyłączone. Konto tworzy administrator placówki.":
    "Sign-up is disabled. Accounts are created by the clinic administrator.",
  "Zalogowano, ale Facebook nie oddał żadnej strony — sprawdzono konto osobiste ":
    "Signed in, but Facebook returned no page — the personal account ",
  "Zapis z panelu wymaga klucza głównego PRM_SECRETS_KEY w pliku .env na serwerze.":
    "Saving from the panel requires the PRM_SECRETS_KEY master key in the .env file on the server.",
  "Zgoda przeniesiona przy imporcie listy telefonicznej — plik nie podał źródła.":
    "Consent carried over in the phone list import — the file gave no source.",
  "Zgoda przeniesiona przy imporcie. Źródło podane w pliku: {consentSource}.":
    "Consent carried over in the import. Source given in the file: {consentSource}.",
  "Zgody już wycofane": "Consent already withdrawn",
  "Zgody: e-mail {v0}, SMS {v1}, profilowanie {v2} (źródło: {v3})":
    "Consents: email {v0}, SMS {v1}, profiling {v2} (source: {v3})",
  "Zmieniono dane dostępowe w panelu": "Credentials changed in the panel",
  "[Copilot] nie udało się zapisać tury": "[Copilot] could not save the turn",
  "[PRM Engine] nadzorca nie dokończył przeglądu":
    "[PRM Engine] the supervisor did not finish the review",
  "[PRM Engine] nie udało się zapisać logu": "[PRM Engine] could not save the log",
  "[PRM Engine] nie udało się zapisać zdarzenia": "[PRM Engine] could not save the event",
  "[PRM Engine] pętla wystartowała (tick co {TICK_INTERVAL_MS} ms)":
    "[PRM Engine] loop started (tick every {TICK_INTERVAL_MS} ms)",
  "[PRM Engine] raport bezpieczeństwa nie wyszedł": "[PRM Engine] the security report was not sent",
  "[PRM Engine] sprzątanie segmentów nie powiodło się": "[PRM Engine] segment clean-up failed",
  "[PRM Engine] sprzątanie wygasłych kont nie powiodło się":
    "[PRM Engine] clean-up of expired accounts failed",
  "[PRM Engine] tick nie powiódł się": "[PRM Engine] tick failed",
  "[PRM] nie udało się odczytać integration_credentials — używam .env":
    "[PRM] could not read integration_credentials — using .env",
  "[lekarze] pominięto {odrzucone} z {length} pozycji w {file} — brak nazwiska lub identyfikatora.":
    "[doctors] skipped {odrzucone} of {length} entries in {file} — no surname or ID.",
  "[lekarze] {file} musi zawierać tablicę, zasiew pominięty.":
    "[doctors] {file} must contain an array, seeding skipped.",
  "[lekarze] {file} nie jest poprawnym JSON-em, zasiew pominięty:":
    "[doctors] {file} is not valid JSON, seeding skipped:",
  "aplikacja uwierzytelniająca": "authenticator app",
  "bez sesji odsyłają na ekran logowania": "redirect to sign-in without a session",
  "brak idOsoby — powiązanie będzie zgadywane z grafiku lekarza":
    "no idOsoby — the link will be guessed from the doctor's schedule",
  "błąd: {v0}": "error: {v0}",
  "cała doba": "all day",
  "czas spędzony na stronie, liczba odsłon, głębokość przewinięcia":
    "time spent on the website, number of page views, scroll depth",
  "data wiadomości": "message date",
  "data wysyłki": "send date",
  "i portfolio firmowe. Najczęstsza przyczyna: przy podłączaniu nie zaznaczono ":
    "and the business portfolio were checked. The most common cause: no page was selected when connecting ",
  "jest dokładnie": "is exactly",
  "jest uzupełnione": "is filled in",
  "kliknięcie w przycisk, link lub dowolny element NA STRONIE — kod śledzący rejestruje wejścia na adresy, nie zdarzenia w treści strony (kliknięcia śledzimy tylko w wiadomościach e-mail)":
    "a click on a button, link or any element ON THE WEBSITE — the tracking code records visits to URLs, not events in the page content (clicks are tracked only in emails)",
  "kolejność zdarzeń („najpierw wszedł na A, potem na B”) — warunki sprawdzają, czy coś się wydarzyło, nie w jakiej kolejności":
    "the order of events (“first visited A, then B”) — conditions check whether something happened, not in what order",
  "kwoty, płatności, historia zakupów — nie ma takiego modułu":
    "amounts, payments, purchase history — there is no such module",
  "nazwa usługi (title)": "service name (title)",
  "nie udało się odczytać — pomijam": "could not read — skipping",
  "nie udało się sprawdzić: {v0}": "could not check: {v0}",
  "nie widzę katalogu {dir}": "cannot see the directory {dir}",
  "nie wystąpiło": "did not occur",
  "nieznany błąd bramki SMS": "unknown SMS gateway error",
  "nieznany błąd": "unknown error",
  "odpowiedzi z ankiet i formularzy — trafiają do notatki na karcie kontaktu, a po treści notatek nie da się filtrować":
    "survey and form answers — they go into a note on the contact card, and notes cannot be filtered by content",
  "około 1 wiadomość co {seconds} s": "about 1 message every {seconds} s",
  "około 1 wiadomość co {v0} min": "about 1 message every {v0} min",
  "pop-up na stronę placówki": "a pop-up for the clinic's website",
  "pracownicy PRM Core nigdy o niego nie proszą.</p>": "PRM Core staff will never ask for it.</p>",
  "ten sam e-mail (nazwiska nie przeczą sobie)":
    "same email (surnames do not contradict each other)",
  "termin nieokreślony": "time not set",
  usunięta: "deleted",
  "wiadomość e-mail (kampania marketingowa placówki medycznej)":
    "an email (a medical clinic's marketing campaign)",
  "wiadomość e-mail": "email",
  "wiadomość z formularza na stronie — odpowiedź pójdzie e-mailem":
    "a message from a website form — the reply will go by email",
  "wiek, płeć, adres — nie ma takich pól, chyba że placówka dodała je jako pola własne":
    "age, sex, address — there are no such fields, unless the clinic added them as custom fields",
  "wizyty odbyte, odwołane i przełożone — system widzi wyłącznie rezerwacje zrobione online przez stronę":
    "completed, cancelled and rescheduled visits — the system sees only bookings made online through the website",
  wyjście: "exit",
  "wystawia szczegóły: {v0}…": "exposes details: {v0}…",
  wystąpiło: "occurred",
  "za 30 minut, żeby awaria nie zasypała skrzynki.</p>":
    "in 30 minutes, so the outage does not flood the inbox.</p>",
  "zaczyna się od": "starts with",
  "zmień hasło i powiadom administratora.</p>":
    "change your password and notify the administrator.</p>",
  "{SYSTEM}\n\nFAKTY O PACJENCIE (jedyne źródło prawdy):\n{facts}":
    "{SYSTEM}\n\nFACTS ABOUT THE PATIENT (the only source of truth):\n{facts}",
  "{label} nie ma podziału.": "{label} has no breakdown.",
  "{label} pokazuje najwyżej {maxMeasures} {v2}.": "{label} shows at most {maxMeasures} {v2}.",
  "{length} kopii, najświeższa sprzed {dni} dni":
    "{length} backups, the newest from {dni} days ago",
  "{length} sprawdzeń nie przeszło.": "{length} checks failed.",
  "{linked} powiązanych, {v1} pominiętych": "{linked} linked, {v1} skipped",
  "{message} Wybrano pierwszą ścieżkę.": "{message} The first path was chosen.",
  "{ok} ok / {failed} błędów": "{ok} ok / {failed} errors",
  "{refreshed}/{linked} odświeżonych": "{refreshed}/{linked} refreshed",
  "{total} wywołań, za każdym razem ta sama ścieżka. Koszt tych wywołań: ${v1}.":
    "{total} calls, the same path every time. Cost of these calls: ${v1}.",
  "{v0} (stan na dziś)": "{v0} (as of today)",
  "© 2026 Klinika ABC Sp. z o.o., ul. Zdrowa 12, Warszawa\nWypisz się z tej listy w każdej chwili.":
    "© 2026 ABC Clinic Ltd., 12 Health Street, London\nUnsubscribe from this list at any time.",
  "Średnia z pozostałych dni to {v0}. Taki skok zwykle oznacza bota wypełniającego formularz albo import.":
    "The average of the other days is {v0}. Such a jump usually means a bot filling in a form, or an import.",
  "żadnej strony albo aplikacja nie ma uprawnienia business_management. ":
    "or the app lacks the business_management permission. ",
  ' Jedna pacjentka na trzech wizytach liczy się raz — pytanie brzmi „ilu ludzi się zapisało". Kolumna „Wizyt" pokazuje drugą połowę tej odpowiedzi.':
    " A patient with three visits counts once — the question is “how many people booked”. The “Visits” column shows the other half of that answer.",
  ' Wysyłka w trybie marketingowym idzie wyłącznie do kontaktów ze zgodą na dany kanał. Tryb administracyjny — ustawiany na kroku automatyzacji — pomija zgodę marketingową i służy wiadomościom niemarketingowym, np. przypomnieniu o wizycie. Tag „nie kontaktować" blokuje wysyłkę w obu trybach.':
    " Marketing mode sends only to contacts with consent for the channel. Administrative mode — set on the automation step — skips marketing consent and is for non-marketing messages, e.g. a visit reminder. The “do not contact” tag blocks sending in both modes.",
  ' ani liczby dostarczonych — o tym wie wyłącznie serwer pocztowy, a my pokażemy wtedy „brak danych", nie zmyśloną wartość.':
    " or the number delivered — only the mail server knows that, and until then we show “no data”, not an invented value.",
  ' ograniczenie „nie częściej niż" — cykliczny przebieg i tak pilnuje się sam. Przy kilkuset powiązanych pacjentach synchronizacja trwa kilka minut; okno można zamknąć, leci dalej.':
    " the “no more often than” limit — the scheduled run takes care of itself anyway. With a few hundred linked patients the sync takes a few minutes; you can close the window, it keeps running.",
  ' ze statusem „Lead".': " with the “Lead” status.",
  '" nie ma już na liście. Wiadomość wyśle się bez tego fragmentu — wybierz inny plan albo zostaw „ostatnio przypisany".':
    "” is no longer on the list. The message will be sent without this part — choose another plan or keep “most recently assigned”.",
  '" · zlecona ': "” · started ",
  ') — ramkę, tło i przycisk zamykania dokłada PRM Core. Żeby formularz w tym kodzie zbierał kontakty, zajrzyj do „Formularze — instrukcja".':
    ") — PRM Core adds the frame, background and close button. For a form in this code to collect contacts, see “Forms — guide”.",
  ', a do bazy dopiero po „Zapisz" na górnym pasku. Obrazy z archiwum leżą w bibliotece Media i odwołują się do nich adresy w kodzie.':
    ", and to the database only after “Save” on the top bar. Images from the archive are in the Media library, and URLs in the code point to them.",
  '<input name="custom_skad_o_nas" data-prm-label="Skąd wiesz o nas?" />':
    '<input name="custom_how_did_you_hear" data-prm-label="How did you hear about us?" />',
  '<p style="color:#475467;font-size:13px">Jeśli to nie Ty prosiłeś o zmianę — nie rób nic. ':
    '<p style="color:#475467;font-size:13px">If you did not ask for this change — do nothing. ',
  '<p style="color:#475467;font-size:13px">Odnośnik działa <strong>przez godzinę</strong> i tylko raz.</p>':
    '<p style="color:#475467;font-size:13px">The link works <strong>for one hour</strong> and only once.</p>',
  '<p style="color:#666;font-size:12px">Jeśli to nie Ty próbujesz się zalogować, ':
    '<p style="color:#666;font-size:12px">If it is not you trying to sign in, ',
  '<p style="color:#666;font-size:12px">Kolejne takie powiadomienie najwcześniej ':
    '<p style="color:#666;font-size:12px">The next such notification no sooner than ',
  '<p style="margin:8px 0 0;color:#475467;font-size:14px">Nic nie wymaga działania.</p>':
    '<p style="margin:8px 0 0;color:#475467;font-size:14px">Nothing needs action.</p>',
  '<td style="padding:5px 12px 5px 0;font-size:13px">{blocked} odmów / {requests} żądań</td>':
    '<td style="padding:5px 12px 5px 0;font-size:13px">{blocked} rejections / {requests} requests</td>',
  '<tr><td colspan="3" style="padding:5px 0;font-size:14px;color:#475467">Żadna sieć nie zebrała serii odmów.</td></tr>':
    '<tr><td colspan="3" style="padding:5px 0;font-size:14px;color:#475467">No network had a series of rejections.</td></tr>',
  'Dotyczy pop-upów tworzonych poza PRM Core (własny HTML, zewnętrzne narzędzia). Formularze zbudowane blokiem „Formularz" mają to już ustawione automatycznie.':
    "Applies to pop-ups created outside PRM Core (custom HTML, external tools). Forms built with the “Form” block have this set up automatically.",
  'Feed „{feedName}" — {rowCount} wierszy.': "Feed “{feedName}” — {rowCount} rows.",
  'Google Authenticator → „+" → „Skanuj kod QR".': "Google Authenticator → “+” → “Scan a QR code”.",
  'Kampania „{templateName}": problem z załącznikami — {v1}':
    "Campaign “{templateName}”: attachment problem — {v1}",
  'Kanały zostawione na „Bez zmian" nie zostaną dotknięte. Każda faktyczna zmiana trafia na oś czasu pacjenta razem z podstawą i nazwiskiem osoby, która ją wprowadziła.':
    "Channels left on “No change” will not be touched. Every actual change goes on the patient's timeline together with the basis and the name of the person who made it.",
  'Każde wysłanie tworzy kontakt w zakładce Contacts (status „Lead") z tymi tagami.':
    "Every submission creates a contact in the Contacts tab (status “Lead”) with these tags.",
  'Kliknij „Wygeneruj podsumowanie" albo zadaj pytanie poniżej.':
    "Click “Generate summary” or ask a question below.",
  'Nadawca „{name}" już istnieje.': "Sender “{name}” already exists.",
  'Nadawca „{name}" usunięty.': "Sender “{name}” deleted.",
  'Nic nie pasuje do „{fraza}".': "Nothing matches “{fraza}”.",
  'Nie ma jeszcze żadnej wysyłki. Otwórz szablon w module Newsletter, E-mail albo SMS i wybierz „Wyślij do segmentu".':
    "There are no sends yet. Open a template in the Newsletter, Email or SMS module and choose “Send to segment”.",
  'Nie ma szablonu „{templateName}". Sprawdź nazwę w module {v1}.':
    "There is no template “{templateName}”. Check the name in the {v1} module.",
  'Nie udało się wyciąć kadru „{name}" — {reason}. Ta sekcja jest bez zdjęcia.':
    "Could not cut the frame “{name}” — {reason}. This section has no image.",
  'Nieznany status „{statusRaw}" — kontakt został leadem. Dozwolone: Lead, Pacjent, Aktywny, Nieaktywny.':
    "Unknown status “{statusRaw}” — the contact became a lead. Allowed: Lead, Pacjent, Aktywny, Nieaktywny.",
  'Otrzymujesz tę wiadomość, bo wyraziłeś zgodę na kontakt marketingowy. <a href="{UNSUBSCRIBE_PLACEHOLDER}">Wypisz się</a>.':
    'You are receiving this message because you agreed to marketing contact. <a href="{UNSUBSCRIBE_PLACEHOLDER}">Unsubscribe</a>.',
  'Pacjenci, którzy kliknęli link wypisania albo mają tag „nie kontaktować".':
    "Patients who clicked the unsubscribe link or have the “do not contact” tag.",
  'Pacjent ma już przypisany plan „{name}".': "The patient already has plan “{name}” assigned.",
  'Plan o nazwie „{name}" już istnieje.': "A plan named “{name}” already exists.",
  'Plan „{v0}"': "Plan “{v0}”",
  'Pobrano „{title}"': "Fetched “{title}”",
  'Podglądu w Gmailu, Outlooku i oceny spamu tu nie ma — wymagałyby usługi, która naprawdę otworzy wiadomość w tych klientach. Prawdziwy test robi przycisk „Wyślij test" na górnym pasku.':
    "There is no Gmail or Outlook preview or spam score here — they would need a service that really opens the message in those clients. The real test is the “Send test” button on the top bar.",
  'Pola akcji, np. {"template": "Nazwa szablonu", "tag": "vip"}.':
    'Action fields, e.g. {"template": "Template name", "tag": "vip"}.',
  'Poszczególne kroki, decyzje warunków i błędy są na osi czasu w „Aktywnościach" (kategoria Automatyzacje) oraz w panelu „Przebiegi" w builderze.':
    "Individual steps, condition decisions and errors are on the timeline under “Activities” (Automations category) and in the “Runs” panel in the builder.",
  'Status „{label}" ma już taki klucz ({key}).': "Status “{label}” already has this key ({key}).",
  'Status „{label}" usunięty.': "Status “{label}” deleted.",
  'Status „{newLabel}" dodany.': "Status “{newLabel}” added.",
  'Studio edytuje wiadomości założone w module kanału. Utwórz tam pierwszą, a potem wróć tutaj albo wybierz „Otwórz w Studiu" z jej menu.':
    "Studio edits messages created in the channel module. Create the first one there, then come back here or choose “Open in Studio” from its menu.",
  'Szablon „{name}" nie ma jeszcze treści.': "Template “{name}” has no content yet.",
  'Tag „telefon" dokłada się sam — te dopisują się obok.':
    "The “telefon” tag is added automatically — these are added next to it.",
  'Usunąć feed „{name}" wraz z danymi?': "Delete feed “{name}” with its data?",
  'Usunąć „{fileName}"? Jeśli grafika jest użyta w wysłanych e-mailach, przestanie się w nich wyświetlać.':
    "Delete “{fileName}”? If the image is used in sent emails, it will stop showing in them.",
  'Usunąć „{fileName}"? Pliku nie da się odzyskać.':
    "Delete “{fileName}”? The file cannot be recovered.",
  'Wiadomości będą rozłożone równomiernie: {v0}. Limit nie znaczy „100 na raz, potem cisza".':
    "Messages will be spread evenly: {v0}. A limit does not mean “100 at once, then silence”.",
  'Widoczny {v0} {v1}. Godzina „do" liczy się włącznie.':
    "Visible {v0} {v1}. The “to” time is inclusive.",
  'Zacznij od wrzucenia grafiki (przycisk niżej). Potem możesz pisać np. „zamień kolejność sekcji", „dodaj przycisk z linkiem do rejestracji", „zaproponuj inne tytuły".':
    "Start by uploading a design (button below). Then you can write e.g. “swap the sections”, “add a button linking to booking”, “suggest other subject lines”.",
  'Zmiany wchodzą po „Zastosuj"': "Changes apply after “Apply”",
  "krytyczne spostrzeżenie": "critical insight",
  "krytycznych spostrzeżeń": "critical insights",
  'text-decoration:none;border-radius:8px">Ustaw nowe hasło</a></p>':
    'text-decoration:none;border-radius:8px">Set a new password</a></p>',
  '„Pacjentów" to liczba osób, nie wizyt.': "“Patients” is the number of people, not visits.",
  '„{fileName}" nie zmieścił się — łączny limit załączników to 22 MB.':
    "“{fileName}” did not fit — the total attachment limit is 22 MB.",
  '„{name}" — otwieram w edytorze': "“{name}” — opening in the editor",
};
