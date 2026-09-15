/* ============================================================================
 * DSH RTL — تست یکپارچهٔ واقعی (E2E) با CDP
 * ----------------------------------------------------------------------------
 * کروم ۱۳۷+ سوئیچ --load-extension را حذف کرده، پس افزونه از راه دامنهٔ
 * Extensions در DevTools Protocol بارگذاری می‌شود:
 *     --enable-unsafe-extension-debugging  +  Extensions.loadUnpacked
 *
 * سه فاز بررسی می‌شود:
 *   A) حالت «کامل»  → کل رابط می‌چرخد، فونت لود می‌شود، کد چپ می‌ماند
 *   B) حالت «فقط چت» → فقط حباب/مارک‌داون راست‌چین، پوسته دیفالت می‌ماند
 *   C) حالت «خاموش»  → هیچ اتریبیوتی روی <html> نمی‌ماند
 * تنظیمات فازها از خودِ صفحهٔ پاپ‌آپ افزونه (با دسترسی chrome.storage) نوشته
 * می‌شود — یعنی همان مسیری که کاربر واقعی طی می‌کند.
 *
 * استفاده:  node test/e2e.js
 * ========================================================================== */
"use strict";

const { execFile } = require("child_process");
const http = require("http");
const path = require("path");
const os = require("os");
const fs = require("fs");

function loadWs() {
  try {
    return require("ws");
  } catch (_) {}
  const roots = [
    path.join(os.homedir(), "AppData/Local/npm-cache/_npx"),
    path.join(process.env.LOCALAPPDATA || "", "npm-cache/_npx")
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      const candidate = path.join(root, dir, "node_modules", "ws");
      if (fs.existsSync(candidate)) return require(candidate);
    }
  }
  return null;
}

const WebSocket = loadWs();
if (!WebSocket) {
  console.error("ماژول ws پیدا نشد؛ تست E2E رد شد.");
  process.exit(2);
}

const CHROME =
  process.argv[2] ||
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EXT_DIR = path.resolve(__dirname, "..");
const PORT = 9600 + Math.floor(Math.random() * 300);
const PROBE_PORT = Number(process.env.PROBE_PORT || 8794);
const PAGE_URL = `http://127.0.0.1:${PROBE_PORT}/test/extension-probe.html`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(2500, () => req.destroy(new Error("timeout")));
  });
}

/* --------------------------------------------------------------- expressions */

/* اندازه‌گیری وضعیت صفحه (مشترک بین سه فاز) */
const SNAPSHOT = `(() => {
  const de = document.documentElement;
  const css = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el) : null;
  };
  const dirOf = (sel) => { const s = css(sel); return s ? s.direction : null; };
  return {
    gate: de.getAttribute('data-dsh-rtl'),
    chatAttr: de.getAttribute('data-dsh-rtl-chat'),
    dir: de.getAttribute('dir'),
    fontAttr: de.getAttribute('data-dsh-rtl-font'),
    mirrorAttr: de.getAttribute('data-dsh-rtl-mirror'),
    bodyDir: getComputedStyle(document.body).direction,
    bodyLang: document.body.getAttribute('lang'),
    chatLang: document.querySelector('[data-conversation-scroll]') ? document.querySelector('[data-conversation-scroll]').getAttribute('lang') : null,
    fontToken: getComputedStyle(de).getPropertyValue('--dsw-font-family'),
    codeToken: getComputedStyle(de).getPropertyValue('--ds-font-family-code'),
    bubbleDir: dirOf('#probe-bubble'),
    bubbleBidi: css('#probe-bubble') ? css('#probe-bubble').unicodeBidi : null,
    markdownDir: dirOf('#probe-md'),
    paraBidi: css('#probe-p') ? css('#probe-p').unicodeBidi : null,
    preDir: dirOf('#probe-pre'),
    terminalDir: dirOf('#probe-term'),
    editorDir: dirOf('#probe-editor'),
    menuAlign: css('#probe-menu') ? css('#probe-menu').textAlign : null,
    loadedFaces: [...document.fonts].filter(f => f.family.includes('Vazirmatn') && f.status === 'loaded').length,
    fontStyleInjected: !!document.getElementById('dsh-rtl-font-faces'),
    widget: !!document.getElementById('dsh-rtl-widget'),
    widgetMode: (() => { const w = document.getElementById('dsh-rtl-widget'); const r = w && w.shadowRoot; return r && r.querySelector('.wrap') ? r.querySelector('.wrap').dataset.mode : null; })(),
    widgetLabel: (() => { const w = document.getElementById('dsh-rtl-widget'); const r = w && w.shadowRoot; return r && r.querySelector('.txt') ? r.querySelector('.txt').textContent.trim() : null; })()
  };
})()`;

/* صبر تا اعمال حالت مورد انتظار. خواندن تنظیمات از storage غیرهمگام است، پس
 * تا وقتی کش صفحه حالت مورد انتظار را نشان ندهد، اندازه‌گیری معنا ندارد. */
const waitForMode = (mode) => `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const read = () => document.documentElement.getAttribute('data-dsh-rtl');
  const cachedMode = () => {
    try { const c = JSON.parse(localStorage.getItem('dsh-rtl:cache:v1') || 'null'); return c && c.mode; }
    catch (_) { return null; }
  };
  const want = ${JSON.stringify(mode)};
  for (let i = 0; i < 120; i++) {
    const now = read();
    const applied = want === 'off' ? !now : now === want;
    const settled = cachedMode() === want;
    const dirOk = want !== 'full' || document.documentElement.getAttribute('dir') === 'rtl';
    if (applied && settled && dirOk) break;
    await sleep(120);
  }
  try { await Promise.race([document.fonts.ready, sleep(3000)]); } catch (_) {}
  await sleep(400);
  return read();
})()`;

/* -------------------------------------------------------------- CDP helper */

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
  let msgId = 0;
  const pending = new Map();
  const listeners = [];
  const ready = new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (_) {
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    listeners.forEach((fn) => fn(msg));
  });
  return {
    ready,
    send(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++msgId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    },
    on(fn) {
      listeners.push(fn);
    },
    close() {
      try {
        ws.close();
      } catch (_) {}
    }
  };
}

async function evaluate(session, expression) {
  const res = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (res && res.exceptionDetails) {
    throw new Error(
      "evaluate failed: " + (res.exceptionDetails.exception || {}).description
    );
  }
  return res && res.result ? res.result.value : undefined;
}

/* ---------------------------------------------------------------------- main */

(async () => {
  const profile = path.join(os.tmpdir(), "dsh-rtl-e2e-" + Date.now());
  const child = execFile(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--enable-unsafe-extension-debugging",
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--remote-debugging-port=" + PORT,
      "--user-data-dir=" + profile,
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  let version = null;
  for (let i = 0; i < 60; i++) {
    try {
      version = await httpJson(`http://127.0.0.1:${PORT}/json/version`);
      if (version && version.webSocketDebuggerUrl) break;
    } catch (_) {}
    await sleep(250);
  }
  if (!version || !version.webSocketDebuggerUrl) {
    console.error("CDP در دسترس نشد.");
    child.kill();
    process.exit(2);
  }
  console.log("INFO | browser: " + version.Browser);

  /* ۱) بارگذاری افزونه */
  let browser = null;
  let extId = null;
  try {
    browser = connect(version.webSocketDebuggerUrl);
    await browser.ready;
    const res = await browser.send("Extensions.loadUnpacked", { path: EXT_DIR });
    extId = res && res.id;
    console.log("INFO | extension id: " + extId);
  } catch (err) {
    console.log("INFO | Extensions.loadUnpacked unavailable: " + err.message);
  }
  await sleep(1500);

  if (browser && extId) {
    console.log("INFO | extension loaded from " + EXT_DIR);
  }

  const targetWs = async (targetId) => {
    const list = await httpJson(`http://127.0.0.1:${PORT}/json/list`);
    const t = (list || []).find((x) => x.id === targetId);
    return t ? t.webSocketDebuggerUrl : null;
  };

  const targetInfo = async (targetId) => {
    const list = await httpJson(`http://127.0.0.1:${PORT}/json/list`);
    return (list || []).find((x) => x.id === targetId) || null;
  };

  /* ۲) صفحهٔ خود افزونه (پاپ‌آپ) — تنها جایی که chrome.storage در دسترس است.
   * بارگذاری صفحهٔ افزونه بلافاصله بعد از loadUnpacked گاهی به
   * chrome-error می‌خورد، پس با انتظار و تلاش دوباره انجام می‌شود. */
  let extSession = null;
  for (let attempt = 1; attempt <= 4 && !extSession; attempt++) {
    let created = null;
    try {
      created = await browser.send("Target.createTarget", {
        url: `chrome-extension://${extId}/src/popup.html`
      });
    } catch (err) {
      console.log(`INFO | popup open attempt ${attempt} failed: ${err.message}`);
      await sleep(1200);
      continue;
    }
    for (let i = 0; i < 12; i++) {
      await sleep(400);
      const info = await targetInfo(created.targetId);
      if (!info || !/^chrome-extension:/.test(info.url || "")) continue;
      const wsUrl = await targetWs(created.targetId);
      if (!wsUrl) continue;
      const session = connect(wsUrl);
      try {
        await session.ready;
        await session.send("Runtime.enable");
        const ready = await evaluate(
          session,
          "!!(window.chrome && chrome.storage && chrome.storage.sync) ? document.title : ''"
        );
        if (ready) {
          extSession = session;
          console.log(`INFO | extension page ready: ${ready}`);
          break;
        }
      } catch (_) {}
      session.close();
    }
    if (!extSession) console.log(`INFO | popup not ready yet (attempt ${attempt})`);
  }

  if (!extSession) {
    console.error("صفحهٔ افزونه بارگذاری نشد؛ تست E2E رد شد.");
    if (browser) browser.close();
    child.kill();
    process.exit(3);
  }

  /* ۳) نوشتن تنظیمات در chrome.storage.sync از همان صفحه */
  const SETTINGS_TEMPLATE = {
    enabled: true,
    font: "vazir",
    plaintext: true,
    ltrIslands: true,
    mirrorIcons: true,
    persianDigits: false,
    lineHeight: 0,
    floatingButton: true,
    detectOnly: true,
    sites: []
  };

  const setMode = async (mode) => {
    const expr = `new Promise((resolve) => {
      chrome.storage.sync.set({ settings: ${JSON.stringify({
        ...SETTINGS_TEMPLATE,
        mode
      })} }, () => {
        chrome.storage.sync.get('settings', (r) => resolve(r && r.settings ? r.settings.mode : null));
      });
    })`;
    const stored = await evaluate(extSession, expr);
    await sleep(250);
    return stored;
  };

  /* ۴) تب آزمایش: ساخت، نوشتن تنظیمات، ناوبری و اندازه‌گیری */
  let tabSession = null;
  const loadProbe = async (mode) => {
    const applied = await setMode(mode);
    if (applied !== mode) console.log(`INFO | storage write returned mode=${applied}`);
    let targetId = null;
    if (browser) {
      try {
        const created = await browser.send("Target.createTarget", { url: "about:blank" });
        targetId = created && created.targetId;
      } catch (_) {}
    }
    if (!targetId) throw new Error("ساخت تب آزمایش ناموفق بود");
    await sleep(350);
    const wsUrl = await targetWs(targetId);
    if (!wsUrl) throw new Error("اتصال به تب آزمایش ناموفق بود");
    const session = connect(wsUrl);
    await session.ready;
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    // کش همگام افزونه در localStorage است؛ برای اندازه‌گیری تمیز پاکش می‌کنیم
    await session.send("Page.navigate", { url: PAGE_URL });
    await evaluate(session, "document.readyState");
    await evaluate(session, "localStorage.clear()");
    await session.send("Page.reload");
    const settled = await evaluate(session, waitForMode(mode));
    if (settled !== (mode === "off" ? null : mode)) {
      console.log(`INFO | mode settle returned ${settled} (wanted ${mode})`);
    }
    return session;
  };

  const closeSession = async (session) => {
    if (session) session.close();
  };

  const results = [];
  const check = (phase, name, got, want) => {
    const ok = String(got) === String(want);
    results.push({ phase, ok, name, got, want });
  };

  /* ---------------- فاز A: حالت کامل ---------------- */
  tabSession = await loadProbe("full");
  let s = await evaluate(tabSession, SNAPSHOT);

  check("A", "html gate = full", s.gate, "full");
  check("A", "html dir = rtl", s.dir, "rtl");
  check("A", "chat gate present", s.chatAttr, "on");
  check("A", "font attribute", s.fontAttr, "vazir");
  check("A", "body direction rtl", s.bodyDir, "rtl");
  check("A", "body lang = fa", s.bodyLang, "fa");
  check("A", "font token overridden", s.fontToken.includes("Vazirmatn DSH"), true);
  check("A", "code token keeps mono + vazir", s.codeToken.includes("Vazirmatn DSH"), true);
  check("A", "vazirmatn face loaded", s.loadedFaces > 0, true);
  check("A", "runtime @font-face injected", s.fontStyleInjected, true);
  check("A", "bubble rtl", s.bubbleDir, "rtl");
  check("A", "markdown rtl", s.markdownDir, "rtl");
  check("A", "code block stays ltr", s.preDir, "ltr");
  check("A", "terminal stays ltr", s.terminalDir, "ltr");
  check("A", "composer rtl in full mode", s.editorDir, "rtl");
  check("A", "floating widget mounted", s.widget, true);
  check("A", "widget shows full state", s.widgetMode, "full");
  await closeSession(tabSession);

  /* ---------------- فاز B: فقط چت ---------------- */
  tabSession = await loadProbe("chat");
  s = await evaluate(tabSession, SNAPSHOT);

  check("B", "html gate = chat", s.gate, "chat");
  check("B", "html has no dir (shell untouched)", s.dir, null);
  check("B", "chat gate present", s.chatAttr, "on");
  check("B", "no mirror attribute in chat mode", s.mirrorAttr, null);
  check("B", "body stays ltr", s.bodyDir, "ltr");
  check("B", "body lang untouched", s.bodyLang, null);
  check("B", "chat scope lang = fa", s.chatLang, "fa");
  check("B", "font token still overridden", s.fontToken.includes("Vazirmatn DSH"), true);
  check("B", "bubble rtl", s.bubbleDir, "rtl");
  check("B", "bubble plaintext", s.bubbleBidi, "plaintext");
  check("B", "markdown rtl", s.markdownDir, "rtl");
  check("B", "paragraph plaintext", s.paraBidi, "plaintext");
  check("B", "code block still ltr", s.preDir, "ltr");
  check("B", "terminal still ltr", s.terminalDir, "ltr");
  check("B", "composer stays default ltr", s.editorDir, "ltr");
  check("B", "menu button keeps app alignment", s.menuAlign, "left");
  check("B", "widget shows chat state", s.widgetMode, "chat");
  await closeSession(tabSession);

  /* ---------------- فاز C: خاموش ---------------- */
  tabSession = await loadProbe("off");
  s = await evaluate(tabSession, SNAPSHOT);

  check("C", "no gate attribute", s.gate, null);
  check("C", "no dir", s.dir, null);
  check("C", "no chat attribute", s.chatAttr, null);
  check("C", "body ltr", s.bodyDir, "ltr");
  check("C", "bubble ltr", s.bubbleDir, "ltr");
  check("C", "markdown ltr", s.markdownDir, "ltr");
  check("C", "font token released", s.fontToken.includes("Vazirmatn DSH"), false);
  check("C", "no injected font style", s.fontStyleInjected, false);
  check("C", "widget shows off state", s.widgetMode, "off");
  await closeSession(tabSession);

  if (extSession) extSession.close();
  if (browser) browser.close();
  child.kill();

  let failed = 0;
  let phase = "";
  for (const r of results) {
    if (r.phase !== phase) {
      phase = r.phase;
      console.log(`--- phase ${phase} ---`);
    }
    if (!r.ok) failed++;
    console.log(
      `${r.ok ? "PASS" : "FAIL"} | [${r.phase}] ${r.name} | got=${r.got} | want=${r.want}`
    );
  }
  console.log(
    `SUMMARY ${failed === 0 ? "ALL-PASS" : failed + " FAILED"} (${results.length} checks)`
  );
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error("E2E error:", err && err.message ? err.message : err);
  process.exit(2);
});
