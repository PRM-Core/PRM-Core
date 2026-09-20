// Single source of truth for the tracker script: used both to render the
// "preview" shown in Settings → Tracking and to actually serve the real
// /prm-tracker.js file (src/routes/[prm-tracker.js].ts).

/**
 * Kod do wklejenia na stronę (loader v2).
 *
 * Ten loader jest z założenia GŁUPI: nie ustawia żadnych globalnych flag,
 * niczego nie konfiguruje — tylko dokleja skrypt i sprawdza po `src`, czy ten
 * konkretny plik nie jest już doklejony. Cała inteligencja mieszka w
 * hostowanym `prm-tracker.js`, i to jest wniosek wprost z awarii na
 * klinika-abc.pl:
 *
 * Poprzedni loader ustawiał flagę `__prmTrack` PRZED załadowaniem skryptu.
 * W kontenerze GTM stały dwa tagi — jeden z martwym adresem (localhost),
 * drugi poprawny. Gdy pierwszy odpalił się tag z localhostem, flaga już
 * stała, skrypt się nie załadował (nie miał skąd), a poprawny tag grzecznie
 * się wycofał. Śledzenie działało w rytmie rzutu monetą.
 *
 * W v2 strażnik przed podwójnym uruchomieniem siedzi WEWNĄTRZ hostowanego
 * skryptu — ustawia go dopiero kod, który naprawdę się wykonał. Tag z martwym
 * adresem nie ustawia niczego, więc niczego też nie blokuje.
 *
 * `collectorBaseUrl` pochodzi z ustawień silnika (`getBaseUrl`) — ale nawet
 * gdy ktoś wklei kod z niewłaściwym adresem, skrypt i tak odeśle dane tam,
 * skąd sam przyszedł (patrz `buildTrackerScript`), więc pomyłka w adresie
 * psuje co najwyżej ładowanie, nigdy cel wysyłki.
 */
export function buildEmbedSnippet(workspaceId: string, collectorBaseUrl: string): string {
  return `<!-- PRM Core — kod śledzący v2. Wklej przed </head> albo jako JEDEN tag „Niestandardowy HTML" w menedżerze tagów (reguła: All Pages). -->
<script>
(function (d) {
  var u = "${collectorBaseUrl}/prm-tracker.js";
  if (d.querySelector('script[src="' + u + '"]')) return;
  var s = d.createElement("script");
  s.async = true;
  s.src = u;
  s.setAttribute("data-prm-ws", "${workspaceId}");
  (d.head || d.body || d.documentElement).appendChild(s);
})(document);
</script>`;
}

export function buildTrackerScript(): string {
  return `// prm-tracker.js v2 — logika śledzenia (hostowany przez PRM Core, ładowany asynchronicznie)
//
// Dwie zasady czynią go odpornym na błędy instalacji:
//  • Strażnik przed podwójnym uruchomieniem jest TU, nie w kodzie wklejanym na
//    stronę. Skrypt, który się nie załadował (martwy adres w starym tagu GTM),
//    nie ustawia niczego — więc nie blokuje tego właściwego.
//  • Adres serwera to pochodna adresu, z którego przyszedł TEN plik. Skrypt
//    zawsze odsyła dane tam, skąd go pobrano — nie da się go źle skonfigurować.
(function () {
  var w = window, d = document;
  if (w.__prmTracker2) return;
  w.__prmTracker2 = true;

  var cs = d.currentScript;
  var src = (cs && cs.src) || "";
  // "https://host/prm-tracker.js" → "https://host". Bez URL API — działa też
  // w starych WebView. Awaryjnie honoruje konfigurację starego snippetu.
  var BASE = src.indexOf("://") > 0
    ? src.split("/").slice(0, 3).join("/")
    : ((w.PrmTracking || {}).collectorBaseUrl || "");
  if (!BASE) return;
  var WS = (cs && cs.getAttribute("data-prm-ws")) || (w.PrmTracking || {}).workspaceId || "prm_ws_8f21ac49";

  var COOKIE_NAME = "_prmvid";
  var COOKIE_DAYS = 730; // cookie pierwszo-stronowy (ustawia go odwiedzana domena, nie PRM Core)

  function getCookie(name) {
    var m = d.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    d.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax";
  }

  // 1) Anonimowy identyfikator przeglądarki — działa dopóki cookie nie zostanie wyczyszczony.
  var visitorId = getCookie(COOKIE_NAME);
  if (!visitorId) {
    visitorId = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    setCookie(COOKIE_NAME, visitorId, COOKIE_DAYS);
  }

  // 2) Najważniejszy mechanizm rozpoznawania tożsamości: token z linku w e-mailu (?prm_ct=...).
  //    Działa niezależnie od blokad cookies (Safari ITP, tryb prywatny, ad-blockery) — to on,
  //    a nie sam cookie, w 100% pewny sposób łączy przeglądarkę z konkretnym kontaktem.
  //    Serwer dodatkowo DOPISUJE ten token do wcześniejszych anonimowych wizyt tej samej
  //    przeglądarki, więc historia sprzed rozpoznania też trafia na kartę pacjenta.
  var params = new URLSearchParams(w.location.search);
  var clickToken = params.get("prm_ct");
  if (clickToken) {
    setCookie("_prmcid", clickToken, COOKIE_DAYS);
    params.delete("prm_ct");
    var q = params.toString();
    var cleanUrl = w.location.pathname + (q ? "?" + q : "") + w.location.hash;
    w.history.replaceState({}, "", cleanUrl); // sprząta URL w pasku adresu
  }

  // 3) Tryb diagnostyczny: dopisz ?prm_debug=1 do adresu strony, a w rogu
  //    pojawi się plakietka ze stanem — bez konsoli, bez devtools.
  var DEBUG = params.get("prm_debug") === "1";
  var dbgEl = null;
  function debugInit() {
    if (!DEBUG || dbgEl) return;
    dbgEl = d.createElement("div");
    dbgEl.setAttribute("style",
      "position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#0f172a;color:#e2e8f0;" +
      "font:12px/1.6 ui-monospace,Menlo,monospace;padding:10px 14px;border-radius:10px;" +
      "box-shadow:0 10px 34px rgba(0,0,0,.4);max-width:360px;pointer-events:none");
    d.body.appendChild(dbgEl);
    debugUpdate("czekam na wysyłkę…");
  }
  function debugUpdate(status) {
    if (!dbgEl) return;
    var idd = clickToken || getCookie("_prmcid");
    dbgEl.innerHTML =
      "<b>PRM Core — skrypt uruchomiony</b><br>" +
      "serwer: " + BASE + "<br>" +
      "gość: " + String(visitorId).slice(0, 16) + "…<br>" +
      "tożsamość: " + (idd ? "rozpoznany (token z e-maila)" : "anonimowy") + "<br>" +
      "ostatnia wysyłka: " + (status || "—");
  }

  // 4) Dostarczanie: sendBeacon w tle; nieudane wysyłki czekają w kolejce
  //    (localStorage) i wychodzą przy następnej okazji. Chwilowy brak sieci
  //    albo restart PRM Core nie gubi wizyt.
  var QKEY = "_prmq";
  function readQueue() {
    try { return JSON.parse(w.localStorage.getItem(QKEY) || "[]"); } catch (e) { return []; }
  }
  function writeQueue(q) {
    try { w.localStorage.setItem(QKEY, JSON.stringify(q.slice(-20))); } catch (e) { /* storage pełny/zablokowany */ }
  }
  function enqueue(payload) { var q = readQueue(); q.push(payload); writeQueue(q); }

  function post(payload, onDone) {
    var body = JSON.stringify(payload);
    // W trybie debug zawsze fetch — beacon nie zdradza, czy serwer odebrał.
    if (!DEBUG && navigator.sendBeacon) {
      var ok = navigator.sendBeacon(BASE + "/collect", body);
      if (!ok) enqueue(payload);
      if (onDone) onDone(ok ? "przekazano (beacon)" : "w kolejce");
      return;
    }
    fetch(BASE + "/collect", { method: "POST", body: body, keepalive: true })
      .then(function (r) {
        if (r.status !== 204) enqueue(payload);
        if (onDone) onDone(r.status === 204 ? "dostarczono (HTTP 204)" : "HTTP " + r.status + " — w kolejce");
      })
      .catch(function () {
        enqueue(payload);
        if (onDone) onDone("błąd sieci — w kolejce");
      });
  }
  function flushQueue() {
    var q = readQueue();
    if (!q.length) return;
    writeQueue([]);
    for (var i = 0; i < q.length; i++) post(q[i]);
  }

  // 5) Odsłona strony. Wysyłana przy wejściu ORAZ przy nawigacji bez
  //    przeładowania (WordPress z wtyczkami SPA, sklepy, konfiguratory) —
  //    podpinamy się pod pushState i powrót przyciskiem wstecz.
  var lastHref = "";
  function pageview(nav) {
    var href = w.location.href;
    if (href === lastHref) return;
    lastHref = href;
    post({
      v: 2,
      workspaceId: WS,
      visitorId: visitorId,
      contactToken: clickToken || getCookie("_prmcid"),
      url: href,
      title: d.title,
      referrer: nav === "load" ? d.referrer : "",
      nav: nav,
      ts: Date.now(),
    }, debugUpdate);
  }
  function hookSpa() {
    var push = w.history.pushState;
    w.history.pushState = function () {
      push.apply(this, arguments);
      // setTimeout: aplikacja zdąży podmienić document.title po nawigacji.
      setTimeout(function () { pageview("spa"); }, 60);
    };
    w.addEventListener("popstate", function () {
      setTimeout(function () { pageview("pop"); }, 60);
    });
  }

  // 6) Formularze — zarówno te z pop-upów PRM Core, jak i ręcznie zakodowane
  //    na stronie. Warunek jest jeden: <form data-prm-form> z polami name="email"
  //    (wymagane), "firstName", "lastName", "phone". Submit jest przechwytywany
  //    i wysyłany do /api/forms/submit, który zakłada kontakt w PRM Core.

  function bindForm(form) {
    if (form.__prmBound) return;
    form.__prmBound = true;

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();

      var payload = { custom: {} };
      var els = form.querySelectorAll("input, select, textarea");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!el.name || el.type === "submit" || el.type === "button") continue;
        if (el.type === "checkbox") continue; // zgody nie są polem kontaktu
        if (!el.value) continue;
        // Pola spoza standardowego zestawu (name="custom_*" albo z atrybutem
        // data-prm-label) nie mają kolumny w kontaktach — lecą osobno i lądują
        // jako notatka na karcie.
        var customLabel = el.getAttribute("data-prm-label");
        if (customLabel || el.name.indexOf("custom_") === 0) {
          payload.custom[customLabel || el.name] = el.value;
        } else {
          payload[el.name] = el.value;
        }
      }
      payload.tag = form.getAttribute("data-prm-tag") || "";
      payload.campaign = form.getAttribute("data-prm-campaign") || document.title;

      var button = form.querySelector("[type=submit]");
      if (button) { button.disabled = true; button.style.opacity = "0.6"; }

      // text/plain, nie application/json — to czyni z tego "simple request",
      // który nie wymaga preflightu OPTIONS (tak samo jak /collect). Serwer
      // i tak parsuje ciało jako JSON.
      fetch(BASE + "/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.ok) throw new Error("blad");
          var msg = form.getAttribute("data-prm-success") || "Dziękujemy! Zapisaliśmy zgłoszenie.";
          var done = document.createElement("p");
          done.textContent = msg;
          done.setAttribute("style",
            "margin:0;padding:14px 4px;text-align:center;font-size:14px;color:#047857;" +
            "font-family:Arial,Helvetica,sans-serif");
          if (form.parentNode) form.parentNode.replaceChild(done, form);
        })
        .catch(function () {
          if (button) { button.disabled = false; button.style.opacity = "1"; }
          var err = form.querySelector("[data-prm-error]");
          if (!err) {
            err = document.createElement("p");
            err.setAttribute("data-prm-error", "");
            err.setAttribute("style",
              "margin:8px 0 0;font-size:12px;color:#b91c1c;font-family:Arial,Helvetica,sans-serif");
            form.appendChild(err);
          }
          err.textContent = "Nie udało się wysłać formularza. Spróbuj ponownie.";
        });
    });
  }

  // Ankieta: odpowiedzi nie są polami kontaktu — lecą na osobny endpoint,
  // który dopisuje je jako notatkę w karcie pacjenta.
  function bindSurvey(form) {
    if (form.__prmBound) return;
    form.__prmBound = true;

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();

      var answers = [];
      var groups = form.querySelectorAll("[data-prm-question]");
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        var question = group.getAttribute("data-prm-question");
        var value = "";
        var checked = group.querySelector("input[type=radio]:checked");
        if (checked) {
          value = checked.value;
        } else {
          var free = group.querySelector("textarea, input[type=text]");
          if (free) value = free.value;
        }
        if (value) answers.push({ question: question, answer: value });
      }

      var emailEl = form.querySelector("input[name=email]");
      var payload = {
        answers: answers,
        email: emailEl ? emailEl.value : "",
        ct: clickToken || getCookie("_prmcid") || "",
        tag: form.getAttribute("data-prm-tag") || "",
      };

      var button = form.querySelector("[type=submit]");
      if (button) { button.disabled = true; button.style.opacity = "0.6"; }

      fetch(BASE + "/api/surveys/submit", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.ok) throw new Error("blad");
          var msg = form.getAttribute("data-prm-success") || "Dziękujemy za odpowiedzi!";
          var done = document.createElement("p");
          done.textContent = msg;
          done.setAttribute("style",
            "margin:0;padding:14px 4px;text-align:center;font-size:14px;color:#047857;" +
            "font-family:Arial,Helvetica,sans-serif");
          if (form.parentNode) form.parentNode.replaceChild(done, form);
        })
        .catch(function () {
          if (button) { button.disabled = false; button.style.opacity = "1"; }
          var err = form.querySelector("[data-prm-error]");
          if (!err) {
            err = document.createElement("p");
            err.setAttribute("data-prm-error", "");
            err.setAttribute("style",
              "margin:8px 0 0;font-size:12px;color:#b91c1c;font-family:Arial,Helvetica,sans-serif");
            form.appendChild(err);
          }
          err.textContent = "Nie udało się wysłać ankiety. Spróbuj ponownie.";
        });
    });
  }

  function bindForms(root) {
    var forms = root.querySelectorAll("form[data-prm-form]");
    for (var i = 0; i < forms.length; i++) bindForm(forms[i]);
    var surveys = root.querySelectorAll("form[data-prm-survey]");
    for (var j = 0; j < surveys.length; j++) bindSurvey(surveys[j]);
  }

  // 5) Pop-up opublikowany w PRM Core (zakładka Pop-Up → "Wyświetlaj na stronie").
  //    Trzy formaty (okno modalne / małe okno w rogu / belka nad stroną),
  //    targetowanie desktop–mobile i capping wyświetleń — wszystko z konfiguracji
  //    zwróconej przez /popup-active.
  var DAY_MS = 864e5;

  function isMobile() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function allowedHere(cfg) {
    // Mały pop-up w rogu z założenia nie pokazuje się na mobile (za mało miejsca).
    if (cfg.format === "corner" && isMobile()) return false;
    if (cfg.devices === "desktop") return !isMobile();
    if (cfg.devices === "mobile") return isMobile();
    return true;
  }

  function stripSlash(s) {
    return s.length > 1 && s.charAt(s.length - 1) === "/" ? s.slice(0, -1) : s;
  }

  /** Dopasowanie z dziką kartą "*", bez regexpów (adresy roją się od znaków, które trzeba by escapować). */
  function wildcardMatch(pattern, target) {
    var parts = pattern.toLowerCase().split("*");
    var t = target.toLowerCase();
    var pos = 0;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part) continue;
      var idx = t.indexOf(part, pos);
      if (idx === -1) return false;
      if (i === 0 && idx !== 0) return false; // początek musi się zgadzać
      pos = idx + part.length;
    }
    // bez końcowej gwiazdki adres musi kończyć się dokładnie na ostatnim fragmencie
    if (parts[parts.length - 1] !== "" && pos !== t.length) return false;
    return true;
  }

  /**
   * Reguła to pełny adres (https://…) albo sama ścieżka (/kontakt).
   * "*" działa jak dzika karta: /blog/* dopasuje wszystkie podstrony bloga.
   * Query string ignorujemy, chyba że reguła sama go zawiera.
   */
  function urlMatches(rule) {
    rule = (rule || "").trim();
    if (!rule) return false;

    var isFull = rule.indexOf("http://") === 0 || rule.indexOf("https://") === 0;
    var target = isFull ? window.location.href : window.location.pathname + window.location.search;
    if (rule.indexOf("?") === -1) target = target.split("?")[0];

    return wildcardMatch(stripSlash(rule), stripSlash(target));
  }

  function allowedOnThisUrl(cfg) {
    if (cfg.urlMode !== "match") return true; // domyślnie: cały serwis
    var rules = cfg.urlRules || [];
    for (var i = 0; i < rules.length; i++) {
      if (urlMatches(rules[i])) return true;
    }
    return false;
  }

  function cappingStore(cfg) {
    return cfg.cappingMode === "day" ? window.localStorage : window.sessionStorage;
  }

  function readCap(id, cfg) {
    try {
      var raw = cappingStore(cfg).getItem("_prmpop_" + id);
      if (!raw) return null;
      var rec = JSON.parse(raw);
      // okno 24h minęło — licznik startuje od zera
      if (cfg.cappingMode === "day" && Date.now() - rec.since > DAY_MS) return null;
      return rec;
    } catch (e) { return null; }
  }

  function underCap(id, cfg) {
    var rec = readCap(id, cfg);
    return !rec || (rec.count || 0) < (cfg.cappingLimit || 1);
  }

  function countImpression(id, cfg) {
    try {
      var rec = readCap(id, cfg) || { since: Date.now(), count: 0 };
      rec.count = (rec.count || 0) + 1;
      cappingStore(cfg).setItem("_prmpop_" + id, JSON.stringify(rec));
    } catch (e) { /* storage zablokowany — trudno, pokaże się ponownie */ }
  }

  // Pop-up zakolejkowany dla pacjenta liczy się osobno od tego samego szablonu
  // opublikowanego globalnie — inaczej wcześniejsze wyświetlenie wersji dla
  // wszystkich zjadłoby capping i osobista wiadomość nigdy by nie wyszła.
  function capKey(popup) {
    return popup.queueId || popup.id;
  }

  function eligible(popup) {
    var cfg = popup.config || {};
    return allowedHere(cfg) && allowedOnThisUrl(cfg) && underCap(capKey(popup), cfg);
  }

  function showPopup(popup) {
    var cfg = popup.config || {};
    var format = cfg.format || "modal";
    // Szerokość skaluje się w dół na wąskich ekranach (RWD) — nigdy nie wychodzi poza viewport.
    var boxWidth = "min(" + (cfg.width || 480) + "px, calc(100vw - 32px))";
    var root = document.createElement("div");
    var box = document.createElement("div");

    // Tło pod tekstem. Kolor idzie zawsze, obraz dokładany osobną własnością —
    // dzięki temu kolor widać, dopóki obraz się ładuje, i zostaje jako tło
    // zastępcze, gdyby adres okazał się martwy.
    var bg = cfg.background || "#fff";
    var skin = "background:" + bg;
    if (cfg.backgroundImage) {
      skin += ";background-image:url(" + JSON.stringify(String(cfg.backgroundImage)) + ")" +
        ";background-size:cover;background-position:center";
    }
    if (cfg.textColor) skin += ";color:" + cfg.textColor;

    if (format === "bar") {
      root.setAttribute("style",
        "position:fixed;top:0;left:0;right:0;width:100%;z-index:2147483000;" +
        skin + ";box-shadow:0 2px 12px rgba(0,0,0,.15)");
      box.setAttribute("style",
        "position:relative;max-width:1100px;margin:0 auto;padding:12px 44px 12px 20px;" +
        "box-sizing:border-box;font-family:Arial,Helvetica,sans-serif" +
        (cfg.height ? ";min-height:" + cfg.height + "px;display:flex;flex-direction:column;justify-content:center" : ""));
    } else if (format === "corner") {
      root.setAttribute("style",
        "position:fixed;bottom:20px;z-index:2147483000;" +
        (cfg.corner === "bottom-left" ? "left:20px" : "right:20px"));
      box.setAttribute("style",
        "position:relative;" + skin + ";border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.22);" +
        "width:" + boxWidth + ";padding:24px 20px 20px;box-sizing:border-box;" +
        "font-family:Arial,Helvetica,sans-serif;max-height:80vh;overflow:auto" +
        (cfg.height ? ";height:" + cfg.height + "px" : ""));
    } else {
      root.setAttribute("style",
        "position:fixed;inset:0;background:" + (cfg.overlay || "rgba(15,23,42,.45)") + ";z-index:2147483000;" +
        "display:flex;align-items:center;justify-content:center;padding:16px");
      box.setAttribute("style",
        "position:relative;" + skin + ";border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.25);" +
        "width:" + boxWidth + ";padding:28px 24px 24px;box-sizing:border-box;" +
        "font-family:Arial,Helvetica,sans-serif;max-height:85vh;overflow:auto" +
        (cfg.height ? ";height:" + cfg.height + "px" : ""));
    }

    var prevPadding = null;
    function dismiss() {
      if (root.parentNode) root.parentNode.removeChild(root);
      if (prevPadding !== null) document.body.style.paddingTop = prevPadding;
    }

    var close = document.createElement("button");
    close.innerHTML = "&times;";
    close.setAttribute("aria-label", "Zamknij");
    close.setAttribute("style",
      "position:absolute;top:6px;right:10px;border:0;background:none;cursor:pointer;" +
      "font-size:22px;line-height:1;padding:4px;color:#6b7280");
    close.onclick = dismiss;

    var content = document.createElement("div");
    content.innerHTML = popup.html;

    box.appendChild(close);
    box.appendChild(content);
    root.appendChild(box);
    if (format === "modal") {
      root.onclick = function (e) { if (e.target === root) dismiss(); };
    }
    document.body.appendChild(root);

    // Belka ma być NAD stroną, nie na niej — przesuwamy treść w dół o jej wysokość.
    if (format === "bar") {
      prevPadding = document.body.style.paddingTop || "";
      document.body.style.paddingTop = root.offsetHeight + "px";
    }

    bindForms(content);
    countImpression(capKey(popup), cfg);

    // ── statystyki ──────────────────────────────────────────────────────────
    //
    // Zgłaszane **po wyrenderowaniu**, nie po pobraniu z /popup-active: capping,
    // urządzenie i reguły adresu mogły pop-up odrzucić, więc samo pobranie nie
    // znaczy, że ktokolwiek go zobaczył.
    function reportPopup(kind) {
      try {
        fetch(BASE + "/api/popups/event", {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({
            contentItemId: popup.id,
            settingsId: typeof popup.settingsId === "number" ? popup.settingsId : null,
            kind: kind,
            visitorId: visitorId,
            url: location.href
          }),
          keepalive: true
        }).catch(function () { /* statystyka nie może psuć cudzej strony */ });
      } catch (e) { /* jak wyżej */ }
    }
    reportPopup("impression");

    // Kliknięcie liczone z **całego okna**, nie tylko z przycisku: pop-up bywa
    // zbudowany z obrazu albo z odnośnika w tekście, a dla placówki liczy się
    // „zareagował", nie „trafił akurat w przycisk". Zamknięcie krzyżykiem
    // kliknięciem nie jest — stąd wykluczenie przycisku zamykania.
    var clickReported = false;
    box.addEventListener("click", function (e) {
      if (clickReported) return;
      if (e.target === close || (close.contains && close.contains(e.target))) return;
      clickReported = true;
      reportPopup("click");
    }, true);

    // Pop-up zakolejkowany dla konkretnego pacjenta (akcja "Wyświetl pop-up"
    // w automatyzacji) — dopiero teraz, po realnym wyrenderowaniu, zgłaszamy
    // go jako dostarczony. Samo pobranie z /popup-active nic nie dowodzi:
    // capping, urządzenie i reguły adresu mogły go odrzucić.
    if (popup.queueId) {
      fetch(BASE + "/api/popups/shown", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ queueId: popup.queueId }),
        keepalive: true,
      }).catch(function () { /* pop-up i tak jest już na ekranie */ });
    }
  }

  function initPopups() {
    bindForms(document); // formularze zakodowane ręcznie, poza pop-upem PRM Core
    var ct = clickToken || getCookie("_prmcid");
    fetch(BASE + "/popup-active" + (ct ? "?ct=" + encodeURIComponent(ct) : ""))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data) return;
        // Lista jest już posortowana wg priorytetu — pokazujemy PIERWSZY pop-up,
        // dla którego ten odwiedzający się kwalifikuje (urządzenie + capping).
        // Nigdy więcej niż jeden naraz.
        var list = data.popups || (data.popup ? [data.popup] : []);
        for (var i = 0; i < list.length; i++) {
          if (eligible(list[i])) { showPopup(list[i]); return; }
        }
      })
      .catch(function () { /* brak pop-upu / błąd sieci — strona działa normalnie */ });
  }

  // ── start ─────────────────────────────────────────────────────────────
  // Kolejność jest treścią: najpierw plakietka debug (żeby pokazała nawet
  // nieudaną wysyłkę), potem odsłona strony, zaległości z kolejki, nasłuch
  // nawigacji SPA, na końcu pop-upy.
  function init() {
    debugInit();
    pageview("load");
    flushQueue();
    hookSpa();
    initPopups();
  }
  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();`;
}
