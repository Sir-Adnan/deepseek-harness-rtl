/* ============================================================================
 * DSH RTL — content script
 * ----------------------------------------------------------------------------
 * کارها:
 *   ۱) خواندن تنظیمات (کش همگام در localStorage + منبع اصلی chrome.storage.sync)
 *   ۲) تشخیص این‌که صفحه واقعاً رابط وب DSH است
 *   ۳) نشاندن dir="rtl" و اتریبیوت‌های وضعیت روی <html> (CSS بقیه را انجام می‌دهد)
 *   ۴) نگهبانی با MutationObserver (SPA به‌طور مداوم DOM را عوض می‌کند)
 *   ۵) تبدیل اختیاری ارقام لاتین به فارسی در متن گفتگو (نه در کد/مسیر/URL)
 *   ۶) دکمهٔ شناور درون Shadow DOM + کلید میان‌بر
 * ========================================================================== */
(() => {
  "use strict";

  /* اجرای دوباره (مثلاً تزریق دستی از پاپ‌آپ) نباید دو نمونه بسازد،
   * فقط تنظیمات را تازه می‌کند. */
  if (window.__dshRtlLoaded) {
    try {
      window.__dshRtlReload && window.__dshRtlReload();
    } catch (_) {}
    return;
  }
  window.__dshRtlLoaded = true;

  const ROOT_ATTR = "data-dsh-rtl";
  const CACHE_KEY = "dsh-rtl:cache:v1";
  const STORE_KEY = "settings";
  const USER_CSS_ID = "dsh-rtl-user-css";
  const EXTRA_CSS_ID = "dsh-rtl-extra-css";
  const FONT_CSS_ID = "dsh-rtl-font-faces";
  const WIDGET_ID = "dsh-rtl-widget";

  const DEFAULTS = {
    enabled: true,
    /** full = کل رابط | chat = فقط متن گفتگو | off = خاموش */
    mode: "full",
    font: "vazir", // vazir | fd | system | none
    plaintext: true, // جهت هوشمند هر پاراگراف
    ltrIslands: true, // کد/ترمینال/دیف چپ‌به‌راست بماند
    mirrorIcons: true, // آینه‌کردن شورون‌ها و کارت‌ها
    persianDigits: false, // تبدیل ارقام متن گفتگو
    lineHeight: 0, // ۰ = پیش‌فرض اپ، در غیر این صورت ضریب خط (۱.۴ تا ۲.۴)
    floatingButton: true,
    detectOnly: true, // فقط صفحه‌هایی که DSH تشخیص داده شوند
    sites: [], // [{ host, mode: 'on' | 'off' }]
    customCss: "",
    extraLtrSelectors: ""
  };

  const MODES = ["full", "chat", "off"];

  const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
  const HAS_ASCII_DIGIT = /[0-9]/;

  /* متن‌هایی که هرگز نباید ارقامشان تبدیل شود */
  const SKIP_DIGIT_SELECTOR = [
    "pre",
    "code",
    "kbd",
    "samp",
    "textarea",
    "input",
    ".katex",
    "[contenteditable]",
    "[data-terminal]",
    "[data-diff]",
    "[data-read]",
    "[data-search]",
    "[data-code-block-content]",
    "[data-code-block-banner]",
    "[data-json-root-row]",
    "[data-ref-chip]",
    "[data-composer-chip]",
    "[data-composer-text-ref]",
    '[class*="_path_"]',
    '[class*="_filePath_"]',
    '[class*="_cwd_"]',
    '[class*="_command_"]',
    '[class*="_lineNumber_"]',
    '[class*="_gutter_"]'
  ].join(",");

  /* متن‌هایی که ماهیت «فنی» دارند و ارقام فارسی در آن‌ها غلط است */
  const TECH_TEXT_RE =
    /(https?:\/\/|www\.|\d+\.\d+|[0-9a-f]{7,}|\/|\\|\b\d+(?:ms|s|px|kb|mb|gb|tb|k|m|b|h)\b|:[0-9]{2,5}\b|\bv?\d+\.\d+\.\d+)/i;

  /* ------------------------------------------------------------------ state */

  let settings = { ...DEFAULTS };
  let detected = false;
  let applying = false; // جلوگیری از حلقهٔ MutationObserver
  /* تا وقتی تنظیمات واقعی خوانده نشده، هیچ‌چیز اعمال نمی‌شود.
   * اگر کش همگام موجود باشد فوراً «آماده» می‌شویم (ضد پرش)، وگرنه صبر می‌کنیم
   * تا chrome.storage جواب بدهد تا حالت پیش‌فرض اشتباهی روی صفحه ننشیند. */
  let settingsReady = false;
  let digitObserver = null;
  let digitTimer = null;
  let widgetHost = null;
  let widgetRefs = null;

  const root = () => document.documentElement;

  /* --------------------------------------------------------------- settings */

  function normalize(raw) {
    const out = { ...DEFAULTS, ...(raw || {}) };
    if (!MODES.includes(out.mode)) out.mode = "full";
    if (!["vazir", "fd", "system", "none"].includes(out.font)) out.font = "vazir";
    out.lineHeight = Number(out.lineHeight) || 0;
    if (out.lineHeight && (out.lineHeight < 1.2 || out.lineHeight > 3)) out.lineHeight = 0;
    if (!Array.isArray(out.sites)) out.sites = [];
    out.sites = out.sites.filter(
      (s) => s && typeof s.host === "string" && (s.mode === "on" || s.mode === "off")
    );
    out.customCss = typeof out.customCss === "string" ? out.customCss : "";
    out.extraLtrSelectors =
      typeof out.extraLtrSelectors === "string" ? out.extraLtrSelectors : "";
    return out;
  }

  /* کش همگام: در document_start اجازه می‌دهد پیش از رندر اپ تصمیم بگیریم و
   * پرش (flash) نداشته باشیم؛ chrome.storage تنها منبع حقیقت است. */
  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (_) {
      return null;
    }
  }

  function writeCache(s) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(s));
    } catch (_) {}
  }

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(STORE_KEY, (res) => {
          if (chrome.runtime.lastError) {
            chrome.storage.local.get(STORE_KEY, (res2) => {
              resolve(normalize(res2 && res2[STORE_KEY]));
            });
            return;
          }
          resolve(normalize(res && res[STORE_KEY]));
        });
      } catch (_) {
        resolve(normalize(null));
      }
    });
  }

  /* -------------------------------------------------------------- detection */

  function looksLikeDsh() {
    try {
      if (window.__DSH_BOOT__) return true;
      if (/deepseek\s*harness/i.test(document.title || "")) return true;
      if (document.querySelector('link[rel="manifest"][href*="manifest.webmanifest"]'))
        return true;
      if (document.querySelector('link[rel="icon"][href*="favicon.svg"]')) return true;
      if (
        document.getElementById("root") &&
        document.querySelector('script[src*="assets/"]')
      )
        return true;
      if (document.querySelector('[class*="_boot_"], [class*="_wordmark_"]')) return true;
    } catch (_) {}
    return false;
  }

  function siteMode(s) {
    const entry = s.sites.find((x) => x.host === location.host);
    return entry ? entry.mode : "auto";
  }

  /* حالت نهایی این صفحه: 'full' | 'chat' | 'off'
   *   • کلید اصلی خاموش  → off
   *   • حالت انتخاب‌شدهٔ کاربر off → off
   *   • تنظیم همین سایت  → on/off بر حالت انتخابی اثر می‌گذارد
   *   • حالت auto        → فقط اگر صفحه DSH تشخیص داده شود */
  function resolveMode(s) {
    if (!s.enabled) return "off";
    if (s.mode === "off") return "off";
    const site = siteMode(s);
    if (site === "off") return "off";
    const chosen = s.mode === "chat" ? "chat" : "full";
    if (site === "on") return chosen;
    if (s.detectOnly && !(detected || looksLikeDsh())) return "off";
    return chosen;
  }

  /* ----------------------------------------------------------------- apply */

  function setUserCss(id, css) {
    let el = document.getElementById(id);
    if (!css) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = css;
  }

  function sanitizeSelectorList(text) {
    return String(text || "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s && !/[{}<>]/.test(s))
      .join(",\n");
  }

  /* @font-face را با URL مطلقِ chrome-extension:// هم تزریق می‌کنیم.
   * rtl.css همین قواعد را با مسیر نسبی دارد، اما resolve شدن مسیر نسبی در CSS
   * تزریق‌شده به content script به رفتار مرورگر وابسته است؛ این نسخه قطعی است.
   * هر دو به یک فایل اشاره می‌کنند، پس دانلود دوباره‌ای رخ نمی‌دهد. */
  function fontFaceCss() {
    const url = (file) => chrome.runtime.getURL("fonts/" + file);
    const face = (family, file, weight) =>
      `@font-face{font-family:"${family}";src:url("${url(file)}") format("woff2");` +
      `font-weight:${weight};font-style:normal;font-display:swap}`;
    return [
      face("Vazirmatn DSH", "Vazirmatn-Variable.woff2", "100 900"),
      face("Vazirmatn FD DSH", "Vazirmatn-FD-Regular.woff2", "400"),
      face("Vazirmatn FD DSH", "Vazirmatn-FD-Medium.woff2", "500"),
      face("Vazirmatn FD DSH", "Vazirmatn-FD-SemiBold.woff2", "600"),
      face("Vazirmatn FD DSH", "Vazirmatn-FD-Bold.woff2", "700")
    ].join("\n");
  }

  function apply() {
    const el = root();
    if (!el || !settingsReady) return;
    applying = true;
    try {
      const mode = resolveMode(settings);
      const isFull = mode === "full";
      const gate = 'html[data-dsh-rtl="full"][dir="rtl"][data-dsh-rtl-ltr="on"]';

      if (mode !== "off") {
        el.setAttribute(ROOT_ATTR, mode); // "full" یا "chat"
        el.setAttribute("data-dsh-rtl-chat", "on");
        el.setAttribute("data-dsh-rtl-font", settings.font);
        el.setAttribute("data-dsh-rtl-plaintext", settings.plaintext ? "on" : "off");
        el.setAttribute("data-dsh-rtl-ltr", settings.ltrIslands ? "on" : "off");

        // dir روی <html> فقط در حالت کامل: در حالت «فقط چت» پوسته باید دیفالت بماند
        if (isFull) {
          el.setAttribute("dir", "rtl");
          el.setAttribute("data-dsh-rtl-mirror", settings.mirrorIcons ? "on" : "off");
        } else {
          el.removeAttribute("dir");
          el.removeAttribute("data-dsh-rtl-mirror");
        }

        if (settings.lineHeight) {
          el.style.setProperty("--dsh-rtl-line-height", String(settings.lineHeight));
          el.setAttribute("data-dsh-rtl-lh", "on");
        } else {
          el.style.removeProperty("--dsh-rtl-line-height");
          el.removeAttribute("data-dsh-rtl-lh");
        }

        // lang فقط روی محدودهٔ محتوا در حالت «فقط چت»، و روی body در حالت کامل
        if (document.body) {
          if (isFull) document.body.setAttribute("lang", "fa");
          else document.body.removeAttribute("lang");
        }
        const chatScope = document.querySelector("[data-conversation-scroll]");
        if (chatScope) {
          if (settings.font !== "none") chatScope.setAttribute("lang", "fa");
          else chatScope.removeAttribute("lang");
        }

        setUserCss(FONT_CSS_ID, fontFaceCss());

        const extra = sanitizeSelectorList(settings.extraLtrSelectors);
        setUserCss(
          EXTRA_CSS_ID,
          extra
            ? `${gate} :is(${extra}) { direction: ltr; unicode-bidi: isolate; }`
            : ""
        );
        setUserCss(USER_CSS_ID, settings.customCss || "");
      } else {
        el.removeAttribute(ROOT_ATTR);
        el.removeAttribute("data-dsh-rtl-chat");
        el.removeAttribute("data-dsh-rtl-font");
        el.removeAttribute("data-dsh-rtl-plaintext");
        el.removeAttribute("data-dsh-rtl-ltr");
        el.removeAttribute("data-dsh-rtl-mirror");
        el.removeAttribute("data-dsh-rtl-lh");
        el.removeAttribute("dir");
        el.style.removeProperty("--dsh-rtl-line-height");
        if (document.body) document.body.removeAttribute("lang");
        const chatScope = document.querySelector("[data-conversation-scroll]");
        if (chatScope) chatScope.removeAttribute("lang");
        setUserCss(FONT_CSS_ID, "");
        setUserCss(EXTRA_CSS_ID, "");
        setUserCss(USER_CSS_ID, "");
      }

      syncDigits(mode !== "off");
      // دکمهٔ شناور روی صفحه‌های ناشناس ظاهر نمی‌شود
      syncWidget(
        mode !== "off" || detected || siteMode(settings) === "on" || siteMode(settings) === "off"
      );
      syncWidgetMode(mode);
    } finally {
      // اتریبیوت‌ها را خودمان عوض کردیم؛ آبزرور باید نادیده بگیرد
      setTimeout(() => {
        applying = false;
      }, 0);
    }
  }

  /* ------------------------------------------------------- digit conversion */

  function convertDigits(scope) {
    if (!scope || !scope.isConnected) return 0;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const value = node.nodeValue;
        if (!value || !HAS_ASCII_DIGIT.test(value)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(SKIP_DIGIT_SELECTOR)) return NodeFilter.FILTER_REJECT;
        if (TECH_TEXT_RE.test(value)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);
    for (const node of targets) {
      node.nodeValue = node.nodeValue.replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
    }
    return targets.length;
  }

  function runDigitPass() {
    if (!digitObserver || !settings.persianDigits) return;
    const scope = digitObserver.__scope;
    if (!scope || !scope.isConnected) return;
    // تبدیل، خودش mutation تولید می‌کند؛ موقتاً قطع می‌کنیم تا حلقه نشود
    digitObserver.disconnect();
    try {
      convertDigits(scope);
    } finally {
      observeDigits(scope);
    }
  }

  function scheduleDigitPass() {
    if (digitTimer) clearTimeout(digitTimer);
    digitTimer = setTimeout(runDigitPass, 250);
  }

  function observeDigits(scope) {
    if (!digitObserver) return;
    digitObserver.__scope = scope;
    digitObserver.observe(scope, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function syncDigits(on) {
    const wanted = on && settings.persianDigits;
    if (!wanted) {
      if (digitObserver) {
        digitObserver.disconnect();
        digitObserver = null;
      }
      if (digitTimer) {
        clearTimeout(digitTimer);
        digitTimer = null;
      }
      return;
    }
    if (!document.body) return;
    if (!digitObserver) {
      digitObserver = new MutationObserver(scheduleDigitPass);
    }
    observeDigits(document.body);
    scheduleDigitPass();
  }

  /* ------------------------------------------------------------ floating UI */

  const WIDGET_TEXT = {
    full: { label: "کامل", title: "راست‌چین کامل — کلیک: فقط چت" },
    chat: { label: "فقط چت", title: "فقط متن گفتگو — کلیک: خاموش" },
    off: { label: "خاموش", title: "خاموش — کلیک: راست‌چین کامل" }
  };

  function widgetCss() {
    return `
      :host { all: initial; }
      .wrap {
        position: fixed;
        z-index: 2147483000;
        display: flex;
        align-items: center;
        gap: 7px;
        height: 30px;
        padding: 0 11px 0 9px;
        border-radius: 999px;
        font: 600 11.5px/1 "Vazirmatn DSH", "Segoe UI", Tahoma, sans-serif;
        color: #eef1f6;
        background: linear-gradient(180deg, rgba(30,34,44,.92), rgba(18,20,27,.94));
        border: 1px solid rgba(255,255,255,.14);
        box-shadow: 0 1px 1px rgba(0,0,0,.24), 0 8px 22px -8px rgba(0,0,0,.55);
        cursor: grab;
        user-select: none;
        opacity: .58;
        transform: translateZ(0);
        transition: opacity .16s ease, transform .16s ease, box-shadow .16s ease,
                    background .2s ease, border-color .2s ease;
        backdrop-filter: blur(10px) saturate(140%);
        -webkit-backdrop-filter: blur(10px) saturate(140%);
      }
      .wrap:hover { opacity: 1; transform: translateY(-1px);
        box-shadow: 0 2px 2px rgba(0,0,0,.26), 0 12px 26px -8px rgba(0,0,0,.6); }
      .wrap[data-dragging="1"] { cursor: grabbing; transform: scale(1.03); }
      .wrap:focus-visible { outline: 2px solid #6ea8fe; outline-offset: 2px; opacity: 1; }

      .dot {
        width: 7px; height: 7px; border-radius: 50%; flex: none;
        background: #7c8595;
        box-shadow: 0 0 0 0 rgba(110,168,254,0);
        transition: background .2s ease, box-shadow .2s ease;
      }
      .txt { white-space: nowrap; letter-spacing: .01em; }

      .wrap[data-mode="full"] {
        background: linear-gradient(180deg, rgba(45,116,236,.96), rgba(24,74,190,.96));
        border-color: rgba(255,255,255,.26);
      }
      .wrap[data-mode="full"] .dot { background: #9ee7bd; box-shadow: 0 0 8px 1px rgba(158,231,189,.7); }

      .wrap[data-mode="chat"] {
        background: linear-gradient(180deg, rgba(21,140,133,.96), rgba(11,92,92,.96));
        border-color: rgba(255,255,255,.24);
      }
      .wrap[data-mode="chat"] .dot { background: #8ff0e2; box-shadow: 0 0 8px 1px rgba(143,240,226,.65); }

      .wrap[data-mode="off"] { opacity: .42; }
      .wrap[data-mode="off"]:hover { opacity: .95; }
      .wrap[data-mode="off"] .dot { background: #6b7280; }

      @media (prefers-color-scheme: light) {
        .wrap { color: #171a21; background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(244,246,250,.96));
          border-color: rgba(15,20,30,.12); box-shadow: 0 1px 1px rgba(15,20,30,.08), 0 10px 24px -10px rgba(15,20,30,.35); }
        .wrap[data-mode="full"] { color: #fff; }
        .wrap[data-mode="chat"] { color: #fff; }
        .wrap[data-mode="off"] .dot { background: #9aa1ad; }
      }
      @media (prefers-reduced-motion: reduce) {
        .wrap, .dot { transition: none; }
      }
    `;
  }

  function positionWidget(host) {
    const { x, y } = settings.widgetPos || {};
    const size = 30;
    if (typeof x === "number" && typeof y === "number") {
      const left = Math.min(Math.max(4, x), Math.max(4, window.innerWidth - size - 4));
      const top = Math.min(Math.max(4, y), Math.max(4, window.innerHeight - size - 4));
      host.style.left = left + "px";
      host.style.top = top + "px";
      host.style.bottom = "auto";
      host.style.right = "auto";
    } else {
      host.style.left = "14px";
      host.style.bottom = "14px";
      host.style.top = "auto";
      host.style.right = "auto";
    }
  }

  function mountWidget() {
    if (widgetHost || !document.body) return;
    widgetHost = document.createElement("div");
    widgetHost.id = WIDGET_ID;
    widgetHost.style.cssText = "position:fixed;z-index:2147483000;";
    const shadow = widgetHost.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = widgetCss();

    const wrap = document.createElement("div");
    wrap.className = "wrap";
    wrap.setAttribute("role", "button");
    wrap.setAttribute("tabindex", "0");
    wrap.setAttribute("data-mode", "full");
    wrap.innerHTML = '<span class="dot"></span><span class="txt">RTL</span>';

    shadow.append(style, wrap);
    document.body.appendChild(widgetHost);
    positionWidget(widgetHost);

    widgetRefs = { wrap };

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    wrap.addEventListener("pointerdown", (e) => {
      const rect = widgetHost.getBoundingClientRect();
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      originX = rect.left;
      originY = rect.top;
      wrap.setPointerCapture(e.pointerId);
      wrap.dataset.dragging = "1";
    });

    wrap.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true;
      widgetHost.style.left = originX + dx + "px";
      widgetHost.style.top = originY + dy + "px";
      widgetHost.style.bottom = "auto";
      widgetHost.style.right = "auto";
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      wrap.dataset.dragging = "0";
      if (moved) {
        const rect = widgetHost.getBoundingClientRect();
        settings.widgetPos = { x: Math.round(rect.left), y: Math.round(rect.top) };
        saveSettings({ widgetPos: settings.widgetPos });
      } else {
        cycleMode();
      }
    };
    wrap.addEventListener("pointerup", endDrag);
    wrap.addEventListener("pointercancel", endDrag);

    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cycleMode();
      }
    });

    window.addEventListener("resize", () => positionWidget(widgetHost));
  }

  function syncWidget(shouldShow) {
    if (!settings.floatingButton || !shouldShow) {
      if (widgetHost) {
        widgetHost.remove();
        widgetHost = null;
        widgetRefs = null;
      }
      return;
    }
    if (!document.body) return;
    mountWidget();
  }

  /* ظاهر دکمهٔ شناور بر اساس حالت جاری */
  function syncWidgetMode(mode) {
    if (!widgetRefs) return;
    const info = WIDGET_TEXT[mode] || WIDGET_TEXT.off;
    widgetRefs.wrap.dataset.mode = mode;
    widgetRefs.wrap.title = `DSH RTL — ${info.title}  ·  Alt+Shift+R`;
    const label = widgetRefs.wrap.querySelector(".txt");
    if (label && label.textContent !== info.label) label.textContent = info.label;
  }

  /* -------------------------------------------------------------- observers */

  let guardsStarted = false;
  let detectionStarted = false;

  /* تشخیص DSH همیشه اجرا می‌شود (سبک است) و در صورت موفقیت نگهبان‌ها را
   * روشن می‌کند. تا ۲۰ ثانیه اول با فاصلهٔ ۴۰۰ms تلاش می‌کند چون اپ SPA است
   * و در document_start هنوز هیچ نشانه‌ای در DOM وجود ندارد. */
  function startDetection() {
    if (detectionStarted) return;
    detectionStarted = true;

    const tryDetect = () => {
      if (detected) return true;
      if (looksLikeDsh()) {
        detected = true;
        startGuards();
        apply();
        return true;
      }
      return false;
    };

    if (tryDetect()) return;

    const headObserver = new MutationObserver(() => {
      if (tryDetect()) headObserver.disconnect();
    });
    if (document.head) {
      headObserver.observe(document.head, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    const timer = setInterval(() => {
      if (tryDetect()) {
        clearInterval(timer);
        headObserver.disconnect();
      }
    }, 400);
    setTimeout(() => {
      clearInterval(timer);
      headObserver.disconnect();
    }, 20000);

    document.addEventListener("DOMContentLoaded", tryDetect, { once: true });
    window.addEventListener("load", tryDetect, { once: true });
  }

  function startGuards() {
    if (guardsStarted) return;
    guardsStarted = true;

    // ۱) اگر اپ یا هر چیزی dir/اتریبیوت ما را برداشت، برگردانیم
    const attrObserver = new MutationObserver(() => {
      if (applying) return;
      const el = root();
      if (!el) return;
      const want = resolveMode(settings);
      const have = el.getAttribute(ROOT_ATTR) || "off";
      const hasDir = el.getAttribute("dir") === "rtl";
      const dirOk = want !== "full" || hasDir;
      if (want !== have || !dirOk) apply();
    });
    attrObserver.observe(root(), {
      attributes: true,
      attributeFilter: ["dir", ROOT_ATTR]
    });

    // ۲) کلید میان‌بر
    window.addEventListener(
      "keydown",
      (e) => {
        if (!e.altKey || !e.shiftKey) return;
        if (e.code === "KeyR") {
          e.preventDefault();
          e.stopPropagation();
          cycleMode();
        }
      },
      true
    );
  }

  /* ------------------------------------------------------------- mutate ops */

  function saveSettings(patch) {
    settings = normalize({ ...settings, ...patch });
    writeCache(settings);
    try {
      chrome.storage.sync.set({ [STORE_KEY]: settings });
    } catch (_) {
      try {
        chrome.storage.local.set({ [STORE_KEY]: settings });
      } catch (_) {}
    }
  }

  /* چرخهٔ حالت با دکمهٔ شناور و کلید میان‌بر: کامل → فقط چت → خاموش → کامل */
  function cycleMode() {
    const current = root().getAttribute(ROOT_ATTR) || "off";
    const next = current === "full" ? "chat" : current === "chat" ? "off" : "full";
    saveSettings({ mode: next, enabled: next === "off" ? settings.enabled : true });
    apply();
  }

  /* ------------------------------------------------------------------- boot */

  // ۱) تصمیم فوری از کش (پیش از رندر اپ)، ۲) همگام‌سازی با منبع اصلی
  const cached = readCache();
  if (cached) {
    settings = cached;
    settingsReady = true;
  }
  detected = looksLikeDsh();
  apply();

  window.__dshRtlReload = () => {
    loadSettings().then((fresh) => {
      settings = fresh;
      settingsReady = true;
      writeCache(settings);
      apply();
    });
  };

  loadSettings().then((fresh) => {
    settings = fresh;
    settingsReady = true;
    writeCache(settings);
    apply();
  });

  /* حالا که <body> وجود دارد: زبان، دکمهٔ شناور و تبدیل ارقام را هم بساز */
  function boot() {
    if (document.body && root().getAttribute(ROOT_ATTR) === "on") {
      document.body.setAttribute("lang", "fa");
    }
    apply();
    startDetection();
    if (detected || siteMode(settings) !== "auto") startGuards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (!(area === "sync" || area === "local")) return;
    if (!changes[STORE_KEY]) return;
    settings = normalize(changes[STORE_KEY].newValue);
    settingsReady = true;
    writeCache(settings);
    apply();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "dsh-rtl:status") {
      const el = root();
      sendResponse({
        ok: true,
        host: location.host,
        detected: detected || looksLikeDsh(),
        enabled: settings.enabled,
        mode: resolveMode(settings),
        applied: !!el.getAttribute(ROOT_ATTR),
        siteMode: siteMode(settings),
        settings
      });
      return;
    }
    if (msg.type === "dsh-rtl:cycle") {
      cycleMode();
      sendResponse({ ok: true, mode: root().getAttribute(ROOT_ATTR) || "off" });
      return;
    }
    if (msg.type === "dsh-rtl:refresh") {
      window.__dshRtlReload();
      sendResponse({ ok: true });
    }
  });
})();
