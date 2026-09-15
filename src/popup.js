/* ============================================================================
 * DSH RTL — popup logic
 * تنظیمات در chrome.storage.sync ذخیره می‌شود و content script با
 * chrome.storage.onChanged بلافاصله (بدون نوسازی صفحه) اعمال می‌کند.
 * ========================================================================= */
"use strict";

const STORE_KEY = "settings";
const REGISTRATION_ID = "dsh-rtl-sites";

const DEFAULTS = {
  enabled: true,
  mode: "full", // full | chat | off
  font: "vazir",
  plaintext: true,
  ltrIslands: true,
  mirrorIcons: true,
  persianDigits: false,
  lineHeight: 0,
  floatingButton: true,
  detectOnly: true,
  sites: [],
  customCss: "",
  extraLtrSelectors: ""
};

const MODE_TEXT = {
  full: {
    label: "راست‌چین کامل",
    hint: "کل رابط می‌چرخد: سایدبار، هدر، تب‌ها، کمپوزر و متن گفتگو."
  },
  chat: {
    label: "فقط متن گفتگو",
    hint: "تنها حباب پیام‌ها و مارک‌داون پاسخ راست‌چین می‌شود؛ بقیهٔ رابط دیفالت هارنس می‌ماند."
  },
  off: {
    label: "خاموش",
    hint: "هیچ تغییری روی صفحه اعمال نمی‌شود."
  }
};

const FONT_TEXT = {
  vazir: ["وزیرمتن", '"Vazirmatn DSH", "Segoe UI", Tahoma, sans-serif', "وزن ۴۰۰ و ۷۰۰"],
  fd: [
    "وزیرمتن با ارقام فارسی",
    '"Vazirmatn FD DSH", "Segoe UI", Tahoma, sans-serif',
    "ارقام لاتین به‌شکل فارسی"
  ],
  system: ["فونت سیستم", '"Segoe UI", Tahoma, sans-serif', "بدون فایل فونت"],
  none: ["بدون تغییر فونت", '"Vazirmatn DSH", system-ui, sans-serif', "فونت خودِ هارنس"]
};

const $ = (id) => document.getElementById(id);

let settings = { ...DEFAULTS };
let tab = null;

/* --------------------------------------------------------------- utilities */

function normalize(raw) {
  const out = { ...DEFAULTS, ...(raw || {}) };
  if (!["full", "chat", "off"].includes(out.mode)) out.mode = "full";
  if (!["vazir", "fd", "system", "none"].includes(out.font)) out.font = "vazir";
  out.lineHeight = Number(out.lineHeight) || 0;
  if (!Array.isArray(out.sites)) out.sites = [];
  out.sites = out.sites.filter(
    (s) => s && typeof s.host === "string" && (s.mode === "on" || s.mode === "off")
  );
  out.customCss = typeof out.customCss === "string" ? out.customCss : "";
  out.extraLtrSelectors =
    typeof out.extraLtrSelectors === "string" ? out.extraLtrSelectors : "";
  return out;
}

function isLoopbackHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function setSaved(text, tone) {
  const el = $("saveState");
  el.textContent = text;
  el.dataset.tone = tone || "";
  if (tone === "ok" || tone === "err") {
    clearTimeout(setSaved._t);
    setSaved._t = setTimeout(() => setSaved("آماده"), 1600);
  }
}

function getStored() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORE_KEY, (res) => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.get(STORE_KEY, (r2) =>
          resolve((r2 && r2[STORE_KEY]) || null)
        );
        return;
      }
      resolve((res && res[STORE_KEY]) || null);
    });
  });
}

function setStored(value) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORE_KEY]: value }, () => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.set({ [STORE_KEY]: value }, () => resolve());
        return;
      }
      resolve();
    });
  });
}

async function save(patch, note) {
  settings = normalize({ ...settings, ...patch });
  await setStored(settings);
  setSaved(note || "ذخیره شد", "ok");
}

/* -------------------------------------------------------- segmented control */

const segIndex = (seg, value) => {
  const values = [...seg.querySelectorAll("input")].map((i) => i.value);
  const i = values.indexOf(value);
  return i < 0 ? 0 : i;
};

function paintSeg(seg, value) {
  seg.dataset.value = value;
  seg.querySelectorAll("input").forEach((input) => {
    input.checked = input.value === value;
  });
  const thumb = seg.querySelector(".segThumb");
  if (thumb) thumb.style.transform = `translateX(${-segIndex(seg, value) * 100}%)`;
}

/* -------------------------------------------------------- site registration */

function sitePattern(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/*`;
  } catch (_) {
    return null;
  }
}

async function syncDynamicScripts() {
  const patterns = [
    ...new Set(
      settings.sites
        .filter((s) => s.pattern && !isLoopbackHost(s.host.split(":")[0]))
        .map((s) => s.pattern)
    )
  ];
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [REGISTRATION_ID] });
  } catch (_) {}
  if (!patterns.length) return;
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: REGISTRATION_ID,
        matches: patterns,
        js: ["src/content.js"],
        css: ["src/rtl.css"],
        runAt: "document_start",
        allFrames: false,
        persistAcrossSessions: true
      }
    ]);
  } catch (err) {
    console.warn("DSH RTL: registerContentScripts failed", err);
    setSaved("ثبت سایت ناموفق بود", "err");
  }
}

async function injectIntoActiveTab() {
  if (!tab || !tab.id) return false;
  if (!/^https?:/i.test(tab.url || "")) return false;
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["src/rtl.css"]
    });
  } catch (_) {}
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content.js"]
    });
    return true;
  } catch (err) {
    console.warn("DSH RTL: executeScript failed", err);
    return false;
  }
}

/* -------------------------------------------------------------- status view */

function renderStatus(state, detail, host) {
  $("statusBadge").textContent = state.text;
  $("statusPulse").dataset.tone = state.tone;
  $("statusDetail").textContent = detail || "";
  $("statusHost").textContent = host || "";
}

async function refreshStatus() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = tabs && tabs[0] ? tabs[0] : null;

  if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) {
    renderStatus(
      { text: "پشتیبانی نمی‌شود", tone: "warn" },
      "این نوع صفحه اجازهٔ تزریق ندارد.",
      ""
    );
    paintSeg($("siteSeg"), "auto");
    return;
  }

  let res = null;
  try {
    res = await chrome.tabs.sendMessage(tab.id, { type: "dsh-rtl:status" });
  } catch (_) {
    res = null;
  }

  const host = (() => {
    try {
      return new URL(tab.url).host;
    } catch (_) {
      return "";
    }
  })();

  if (!res || !res.ok) {
    renderStatus(
      { text: "اجرا نشده", tone: "warn" },
      "افزونه در این تب بارگذاری نشده؛ «اعمال فوری در این تب» را بزنید.",
      host
    );
    paintSeg($("siteSeg"), "auto");
    return;
  }

  const mode = res.mode || "off";
  if (res.applied && mode === "full") {
    renderStatus(
      { text: "راست‌چین کامل", tone: "ok" },
      `${host} — DSH شناسایی شد و کل رابط چرخیده است.`,
      host
    );
  } else if (res.applied && mode === "chat") {
    renderStatus(
      { text: "فقط متن گفتگو", tone: "chat" },
      `${host} — تنها محتوای چت راست‌چین است؛ پوسته دیفالت هارنس مانده.`,
      host
    );
  } else if (res.detected) {
    renderStatus(
      { text: "خاموش", tone: "warn" },
      `${host} — DSH شناسایی شد ولی افزونه روی این سایت اعمال نشده است.`,
      host
    );
  } else {
    renderStatus(
      { text: "DSH نیست", tone: "warn" },
      `${host} — نشانه‌ای از رابط DeepSeek Harness پیدا نشد.`,
      host
    );
  }
  paintSeg($("siteSeg"), res.siteMode || "auto");
}

/* ------------------------------------------------------------------ render */

function renderFontPreview() {
  const [name, stack, meta] = FONT_TEXT[settings.font] || FONT_TEXT.vazir;
  $("fontPreview").style.fontFamily =
    settings.font === "none" ? "inherit" : stack;
  $("previewMeta").textContent = `${name} · ${meta}`;
}

function updateModeUI() {
  paintSeg($("modeSeg"), settings.mode);
  const info = MODE_TEXT[settings.mode] || MODE_TEXT.off;
  $("modeHint").textContent = info.hint;

  const masterOff = !settings.enabled;
  $("modeSeg").style.opacity = masterOff ? "0.5" : "";
  $("modeSeg").style.pointerEvents = masterOff ? "none" : "";

  // آینه‌کردن آیکون فقط در حالت «کامل» اثر دارد
  const mirrorRow = $("mirrorRow");
  const inactive = settings.mode !== "full";
  mirrorRow.dataset.muted = inactive ? "1" : "0";
  $("mirrorIcons").disabled = inactive;

  renderFontPreview();
}

function render() {
  $("enabled").checked = settings.enabled;
  $("font").value = settings.font;
  const lh = $("lineHeight");
  lh.value = String(settings.lineHeight || 0);
  if (!lh.value) lh.value = "0";
  $("plaintext").checked = settings.plaintext;
  $("ltrIslands").checked = settings.ltrIslands;
  $("mirrorIcons").checked = settings.mirrorIcons;
  $("persianDigits").checked = settings.persianDigits;
  $("floatingButton").checked = settings.floatingButton;
  $("detectOnly").checked = settings.detectOnly;
  $("customCss").value = settings.customCss;
  $("extraLtrSelectors").value = settings.extraLtrSelectors;
  updateModeUI();
}

/* ------------------------------------------------------------------- sites */

async function onSiteModeChange(mode) {
  paintSeg($("siteSeg"), mode);

  if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) {
    renderStatus({ text: "پشتیبانی نمی‌شود", tone: "warn" }, "نشانی این تب خوانده نشد.", "");
    return;
  }

  const url = new URL(tab.url);
  const host = url.host;
  const pattern = sitePattern(tab.url);
  const sites = settings.sites.filter((s) => s.host !== host);

  if (mode !== "auto") {
    if (!isLoopbackHost(url.hostname)) {
      let granted = false;
      try {
        granted = await chrome.permissions.request({ origins: [pattern] });
      } catch (_) {
        granted = false;
      }
      if (!granted) {
        setSaved("مجوز این سایت داده نشد", "err");
        paintSeg($("siteSeg"), settings.sites.find((s) => s.host === host)?.mode || "auto");
        return;
      }
      await save({ sites: [...sites, { host, mode, pattern }] });
      await syncDynamicScripts();
    } else {
      await save({ sites: [...sites, { host, mode }] });
    }
  } else {
    await save({ sites });
    await syncDynamicScripts();
  }

  await injectIntoActiveTab();
  setTimeout(refreshStatus, 280);
}

/* -------------------------------------------------------------------- bind */

function bind() {
  const simple = [
    ["enabled", "enabled"],
    ["plaintext", "plaintext"],
    ["ltrIslands", "ltrIslands"],
    ["mirrorIcons", "mirrorIcons"],
    ["persianDigits", "persianDigits"],
    ["floatingButton", "floatingButton"],
    ["detectOnly", "detectOnly"]
  ];
  for (const [id, key] of simple) {
    $(id).addEventListener("change", async (e) => {
      await save({ [key]: e.target.checked });
      updateModeUI();
      setTimeout(refreshStatus, 220);
    });
  }

  $("modeSeg")
    .querySelectorAll("input")
    .forEach((input) =>
      input.addEventListener("change", async () => {
        await save({ mode: input.value });
        updateModeUI();
        await injectIntoActiveTab();
        setTimeout(refreshStatus, 260);
      })
    );

  $("siteSeg")
    .querySelectorAll("input")
    .forEach((input) =>
      input.addEventListener("change", () => onSiteModeChange(input.value))
    );

  $("font").addEventListener("change", async (e) => {
    await save({ font: e.target.value });
    renderFontPreview();
  });

  $("lineHeight").addEventListener("change", (e) =>
    save({ lineHeight: Number(e.target.value) || 0 })
  );

  $("customCss").addEventListener("change", (e) => save({ customCss: e.target.value }));
  $("extraLtrSelectors").addEventListener("change", (e) =>
    save({ extraLtrSelectors: e.target.value })
  );

  $("applyNow").addEventListener("click", async () => {
    const ok = await injectIntoActiveTab();
    setSaved(ok ? "اعمال شد" : "اعمال نشد", ok ? "ok" : "err");
    setTimeout(refreshStatus, 300);
  });

  $("reset").addEventListener("click", async () => {
    await save({ ...DEFAULTS }, "بازنشانی شد");
    render();
    await syncDynamicScripts();
    await injectIntoActiveTab();
    setTimeout(refreshStatus, 260);
  });
}

(async function init() {
  settings = normalize(await getStored());
  render();
  bind();
  await refreshStatus();
  if (settings.sites.some((s) => s.pattern)) syncDynamicScripts();
})();
