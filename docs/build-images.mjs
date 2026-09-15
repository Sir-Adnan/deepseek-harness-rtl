/**
 * DSH RTL — تولید تصویرهای README
 * ---------------------------------------------------------------------------
 *   node docs/build-images.mjs
 *
 * چه می‌سازد؟
 *   docs/popup.png   نماي واقعی پاپ‌آپ (برش دقیق، بدون حاشیهٔ خالی، کیفیت ۲×)
 *   docs/demo.png    مقایسهٔ «پیش / پس» روی یک گفتگوی نمونه
 *   docs/hero.png    بنر بالای README
 *
 * پیش‌نیاز: Google Chrome (یا Edge). مسیر دلخواه با متغیر محیطی CHROME_PATH.
 *
 * روش کار: صفحه‌ها در ۲× رندر و شات می‌شوند، سپس تابع crop حاشیه‌های خالی را
 * پیکسل‌به‌پیکسل می‌بُرد؛ بنابراین هیچ فضای مرده‌ای در README نمی‌ماند.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TMP = join(HERE, ".tmp");

const CHROME =
  process.env.CHROME_PATH ||
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    (process.env.LOCALAPPDATA || "") + "\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((p) => p && existsSync(p));

if (!CHROME) {
  console.error("کروم/اِج پیدا نشد. مسیر را با CHROME_PATH بدهید.");
  process.exit(2);
}

/* --------------------------------------------------------------- فونت و توکن‌ها */

const fontB64 = readFileSync(join(ROOT, "fonts", "Vazirmatn-Variable.woff2")).toString("base64");

/** توکن‌های واقعی تم DSH (برگرفته از بستهٔ dsh-client-ui-theme) */
const TOKENS = `
  --bg-base:#ffffff;
  --bg-soft:#f9fafb;
  --label-1:#0f1115;
  --label-2:#61666b;
  --label-3:#81858c;
  --border-1:rgb(0 0 0 / 10%);
  --border-2:rgb(0 0 0 / 6%);
  --code-bg:#f9fafb;
  --code-banner:#f9fafb;
  --brand:#4176e6;
  --brand-450:#5686fe;
  --violet:#8b76f6;
`;

const BASE_CSS = `
  @font-face {
    font-family: "Vazirmatn";
    src: url(data:font/woff2;base64,${fontB64}) format("woff2");
    font-weight: 100 900;
    font-style: normal;
    font-display: block;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  html { ${TOKENS} }
  body {
    font-family: "Vazirmatn", -apple-system, "Segoe UI", Tahoma, system-ui, sans-serif;
    color: var(--label-1);
    background: var(--bg-base);
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  .mono {
    font-family: "Cascadia Mono", "SF Mono", Menlo, Consolas, ui-monospace, monospace;
    direction: ltr;
    unicode-bidi: isolate;
    text-align: left;
  }
  /* جزیره‌های چپ‌به‌راست: در متن راست‌چین هم چپ‌چین می‌مانند */
  .island { direction: ltr; unicode-bidi: isolate; text-align: left; }
`;

const langAttr = (fa) => (fa ? ' lang="fa" dir="rtl"' : ' lang="en" dir="ltr"');

/* ------------------------------------------------------------------- قالب‌ها */

function frame(title, bodyHtml, { fa = true, pill = "" } = {}) {
  return `
  <section class="frame"${langAttr(fa)}>
    <header class="frameBar">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <span class="frameTitle mono">${title}</span>
      ${pill}
    </header>
    <div class="frameBody">${bodyHtml}</div>
  </section>`;
}

const bubble = (side, html) => `<div class="row ${side}"><div class="bubble">${html}</div></div>`;
const answer = (html) => `<div class="row start"><div class="answer">${html}</div></div>`;

const codeBlock = (lang, code) => `
  <div class="code">
    <div class="codeBar"><span class="mono">${lang}</span><span class="codeHint">کپی</span></div>
    <pre class="mono">${code}</pre>
  </div>`;

/* ------------------------------------------------------------------ doc: demo */

const demoCss = `
  .wrap { display: flex; gap: 22px; padding: 24px 26px 28px; background:
    radial-gradient(1100px 420px at 16% -14%, #eef2ff 0%, rgb(255 255 255 / 0%) 62%),
    radial-gradient(900px 380px at 90% 6%, #f5f1ff 0%, rgb(255 255 255 / 0%) 60%),
    var(--bg-base); }
  .col { flex: 1 1 0; min-width: 0; }
  .cap { display: flex; align-items: center; gap: 9px; margin: 0 4px 10px; direction: ltr; }
  .capEn { font-size: 16px; font-weight: 700; }
  .capFa { font-size: 16px; font-weight: 700; }
  .pill { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px;
    border: 1px solid var(--border-1); letter-spacing: 0.4px; }
  .pill.bad { color: #a23b2c; background: #fdf1ef; border-color: #f3cdc6; }
  .pill.good { color: #0f6b4d; background: #e9f8f1; border-color: #bfe8d8; }

  .frame { border: 1px solid var(--border-1); border-radius: 15px; overflow: hidden;
    background: var(--bg-base); box-shadow: 0 18px 40px -28px rgb(15 17 21 / 42%),
    0 2px 6px -2px rgb(15 17 21 / 8%); }
  .frameBar { position: relative; overflow: hidden;
    display: flex; align-items: center; gap: 5px; padding: 9px 13px;
    border-bottom: 1px solid var(--border-2); background: var(--bg-soft); }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: #dfe3ea; }
  .frameTitle { margin-inline-start: 10px; font-size: 11px; color: var(--label-3); }
  .frameBody { position: relative; padding: 15px 16px 16px;
    display: flex; flex-direction: column; gap: 11px; }

  .row { display: flex; }
  .row.end { justify-content: flex-end; }
  .row.start { justify-content: flex-start; }
  .bubble { max-width: 84%; padding: 9px 13px; border-radius: 13px; font-size: 14px;
    line-height: 1.8; background: #eef2fb; border: 1px solid #e0e6f5; }
  .row.end .bubble { border-end-end-radius: 4px; }
  .answer { font-size: 14px; line-height: 1.85; }
  .answer p { margin: 0 0 8px; }
  .answer p:last-child { margin-bottom: 0; }
  .answer .mix { color: var(--brand); font-size: 13px; }
  .aside { font-size: 12px; color: var(--label-2); }
  .path { font-size: 12px; color: var(--label-2); background: var(--code-bg);
    border: 1px solid var(--border-2); border-radius: 7px; padding: 4px 8px;
    display: inline-block; }

  .code { border: 1px solid var(--border-2); border-radius: 10px; overflow: hidden;
    background: var(--code-bg); }
  .codeBar { display: flex; align-items: center; justify-content: space-between;
    padding: 5px 10px; border-bottom: 1px solid var(--border-2); font-size: 10.5px;
    color: var(--label-3); background: var(--code-banner); }
  .codeHint { direction: rtl; }
  .code pre { margin: 0; padding: 10px 12px; font-size: 11.5px; line-height: 1.7;
    color: #2b2f38; white-space: pre; }

  .thead { display: flex; justify-content: space-between; padding-bottom: 6px;
    border-bottom: 1px solid var(--border-2); font-size: 11px; color: var(--label-3); }
  .tr { display: flex; justify-content: space-between; gap: 14px; font-size: 12.5px;
    padding: 5px 0; border-bottom: 1px dashed var(--border-2); }
  .tr:last-child { border-bottom: 0; }
  .tr .num { color: var(--brand); font-weight: 600; }

  .pillFloat { position: absolute; inset-inline-end: 10px; inset-block-start: 5px;
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px;
    border-radius: 999px; font-size: 10.5px; font-weight: 700; color: #fff;
    background: linear-gradient(135deg, #4176e6, #6d4df0);
    box-shadow: 0 8px 18px -9px rgb(65 118 230 / 80%); }
  .pillFloat .fa { font-size: 11px; }
`;

const DEMO_RESPONSE = {
  fa: `
    <p>برای حالت توسعه یک اسکریپت اضافه می‌کنیم. متغیر محیطی <span class="mix mono">NODE_ENV</span> را بخوانید:</p>
    <p class="path mono">src/config/env.ts</p>
    ${codeBlock(
      "ts",
      `const env = process.env.NODE_ENV ?? "development";\nexport const isDev = env !== "production";`,
    )}
    <div class="tbl">
      <div class="thead"><span>بازه</span><span>وضعیت</span></div>
      <div class="tr"><span class="num mono">8.4s</span><span>اجرای تست‌ها</span></div>
      <div class="tr"><span class="num mono">41/41</span><span>سنجهٔ موفق</span></div>
    </div>
    <p class="aside">جمع‌بندی: خروجی در حالت توسعه هم یکسان است.</p>`,
  en: `
    <p>We add one script for development mode. Read the <span class="mix mono">NODE_ENV</span> variable:</p>
    <p class="path mono">src/config/env.ts</p>
    ${codeBlock(
      "ts",
      `const env = process.env.NODE_ENV ?? "development";\nexport const isDev = env !== "production";`,
    )}
    <div class="tbl">
      <div class="thead"><span>Range</span><span>Status</span></div>
      <div class="tr"><span class="num mono">8.4s</span><span>test run</span></div>
      <div class="tr"><span class="num mono">41/41</span><span>checks passed</span></div>
    </div>
    <p class="aside">Summary: the output is identical in development mode too.</p>`,
};

function docDemo() {
  const panel = (fa) =>
    frame(
      fa ? "app.dsh — گفتگو با متن فارسی" : "app.dsh — chat with Persian text",
      [
        bubble("end", fa ? "این پروژه چطور اجرا می‌شود؟" : "How do I run this project?"),
        answer(DEMO_RESPONSE[fa ? "fa" : "en"]),
      ].join("\n"),
      {
        fa,
        pill: fa
          ? '<span class="pillFloat"><span class="fa">ف</span><span>DSH RTL · کامل</span></span>'
          : "",
      },
    );

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><style>${BASE_CSS}${demoCss}</style></head>
<body>
  <div class="wrap">
    <div class="col">
      <div class="cap"><span class="capEn">Without DSH RTL</span><span class="pill bad">LTR</span></div>
      ${panel(false)}
    </div>
    <div class="col">
      <div class="cap"><span class="capFa">با DSH RTL</span><span class="pill good">RTL</span></div>
      ${panel(true)}
    </div>
  </div>
</body>
</html>`;
}

/* ------------------------------------------------------------------ doc: hero */

const heroCss = `
  .hero { display: flex; align-items: center; gap: 40px; padding: 0 54px; height: 520px;
    direction: rtl; position: relative; overflow: hidden;
    background:
      radial-gradient(760px 460px at 94% -4%, #e8efff 0%, rgb(255 255 255 / 0%) 64%),
      radial-gradient(720px 420px at 6% 104%, #f1ecff 0%, rgb(255 255 255 / 0%) 62%),
      linear-gradient(180deg, #ffffff, #fbfcff);
  }
  .hero::after { content: ""; position: absolute; inset-inline: 0; inset-block-end: 0;
    height: 2px; background: linear-gradient(90deg, #4176e6, #6d4df0, #4176e6); opacity: 0.85; }
  .right { flex: 1 1 auto; min-width: 0; }
  .badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 13px;
    border-radius: 999px; background: #eaf1fe; color: #2d5fd0; font-size: 13px;
    font-weight: 600; border: 1px solid #d6e2fb; white-space: nowrap; }
  h1 { margin: 17px 0 0; font-size: 54px; line-height: 1.15; font-weight: 800;
    letter-spacing: -1px; white-space: nowrap; }
  h1 .l2 { display: block; margin-top: 10px; }
  h1 .g { background: linear-gradient(120deg, #4176e6 8%, #6d4df0 92%);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  p.sub { margin: 18px 0 0; font-size: 19.5px; line-height: 1.85; color: var(--label-2);
    max-width: 830px; }
  .stats { display: flex; gap: 10px; margin-top: 22px; }
  .stat { padding: 8px 15px; border-radius: 12px; background: #fff;
    border: 1px solid var(--border-1); box-shadow: 0 12px 24px -22px rgb(15 17 21 / 60%); }
  .stat b { display: block; font-size: 17.5px; white-space: nowrap; }
  .stat span { font-size: 11px; color: var(--label-3); white-space: nowrap; }

  .card { width: 560px; flex: 0 0 auto; border-radius: 20px; padding: 16px 18px;
    background: #fff; border: 1px solid var(--border-1);
    box-shadow: 0 34px 60px -36px rgb(15 17 21 / 45%), 0 2px 8px -4px rgb(15 17 21 / 10%); }
  .cardHead { display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 11px; border-bottom: 1px solid var(--border-2); }
  .brand { display: flex; align-items: center; gap: 10px; }
  .mark { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
    color: #fff; font-size: 17px; font-weight: 700;
    background: linear-gradient(135deg, #4176e6, #6d4df0); }
  .brand b { font-size: 15px; }
  .brand small { display: block; font-size: 10.5px; color: var(--label-3); }
  .sw { width: 42px; height: 24px; border-radius: 999px; position: relative;
    background: linear-gradient(135deg, #4176e6, #6d4df0); }
  .sw i { position: absolute; inset-block-start: 3px; inset-inline-start: 3px;
    width: 18px; height: 18px; border-radius: 999px; background: #fff; }
  .seg { display: flex; gap: 4px; margin-top: 13px; padding: 4px; border-radius: 11px;
    background: #edeff4; }
  .seg span { flex: 1; text-align: center; font-size: 12px; padding: 6px 0;
    border-radius: 8px; color: var(--label-2); }
  .seg .on { background: #fff; color: var(--label-1); font-weight: 700;
    box-shadow: 0 1px 3px rgb(16 24 40 / 12%); }
  .prev { margin-top: 11px; border: 1px solid var(--border-2); border-radius: 12px;
    padding: 10px 12px; background: #fbfcfe; }
  .prev p { margin: 0; font-size: 16px; line-height: 1.85; }
  .prev small { display: block; margin-top: 2px; font-size: 10.5px; color: var(--label-3);
    direction: ltr; text-align: left; }
  .rows { margin-top: 11px; display: grid; gap: 7px; }
  .r { display: flex; align-items: center; justify-content: space-between; font-size: 12px;
    color: var(--label-2); }
  .sw2 { width: 33px; height: 18px; border-radius: 999px; background: #dfe3ea; position: relative; }
  .sw2 i { position: absolute; inset-block-start: 2.5px; inset-inline-start: 2.5px;
    width: 13px; height: 13px; border-radius: 999px; background: #fff; }
  .sw2.on { background: linear-gradient(135deg, #4176e6, #6d4df0); }
  .sw2.on i { inset-inline-start: auto; inset-inline-end: 2.5px; }
`;

const WHALE = `<svg viewBox="0 0 50 50" width="21" height="21" aria-hidden="true"><path fill="#fff" d="M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z"/></svg>`;

function docHero() {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8" /><style>${BASE_CSS}${heroCss}</style></head>
<body>
  <div class="hero">
    <div class="right">
      <span class="badge">✨ افزونهٔ کروم · Manifest V3 · بدون دست‌زدن به DSH</span>
      <h1>رابط DeepSeek Harness<span class="l2 g">فارسی، راست‌چین، خوانا</span></h1>
      <p class="sub">با یک کلیک، هارنس را به یک محیط کار فارسی تبدیل کنید: چیدمان آینه‌ای، فونت وزیرمتن و جهت هوشمند پاراگراف — در حالی که کد، ترمینال، دیف و مسیرها چپ‌به‌راست و سالم می‌مانند.</p>
      <div class="stats">
        <div class="stat"><b>۳ حالت</b><span>کامل / فقط چت / خاموش</span></div>
        <div class="stat"><b>۱۳۶ سنجه</b><span>تست خودکار در کروم واقعی</span></div>
        <div class="stat"><b>۰ نوسازی</b><span>اعمال زندهٔ تنظیمات</span></div>
      </div>
    </div>
    <div class="card">
      <div class="cardHead">
        <div class="brand">
          <span class="mark">${WHALE}</span>
          <span><b>DSH RTL</b><small>راست‌چین‌ساز DeepSeek Harness</small></span>
        </div>
        <span class="sw"><i></i></span>
      </div>
      <div class="seg"><span>کامل</span><span class="on">فقط چت</span><span>خاموش</span></div>
      <div class="prev">
        <p>سلام، این یک نمونهٔ متن فارسی است ۱۲۳۴۵۶۷۸۹</p>
        <small>Vazirmatn · 400 &amp; 700</small>
      </div>
      <div class="rows">
        <div class="r"><span>جهت هوشمند پاراگراف</span><span class="sw2 on"><i></i></span></div>
        <div class="r"><span>کد و ترمینال چپ‌به‌راست بماند</span><span class="sw2 on"><i></i></span></div>
        <div class="r"><span>تبدیل ارقام متن به فارسی</span><span class="sw2 on"><i></i></span></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* ----------------------------------------------------------------- doc: popup */

/** پاپ‌آپ واقعی افزونه؛ CSS و فونت‌ها درون فایل جمع می‌شوند تا رندر بی‌نقص باشد */
function docPopup() {
  const css = readFileSync(join(ROOT, "src", "popup.css"), "utf8").replace(
    /url\("\.\.\/fonts\//g,
    'url("file:///' + join(ROOT, "fonts").replace(/\\/g, "/") + "/",
  );
  return readFileSync(join(ROOT, "src", "popup.html"), "utf8")
    .replace('<link rel="stylesheet" href="popup.css" />', `<style>${css}</style>`)
    .replace('<script src="popup.js"></script>', "")
    /* کلید اصلی و کلیدهای «رفتار» در نماي واقعی روشن‌اند؛ در عکس هم روشن نشان داده می‌شوند */
    .replace('<input type="checkbox" id="enabled" />', '<input type="checkbox" id="enabled" checked />')
    .replace(/<input type="checkbox" id="(plaintext|ltrIslands|mirrorIcons|persianDigits|floatingButton)" \/>/g,
      '<input type="checkbox" id="$1" checked />');
}

/* ---------------------------------------------------------- خواندن/نوشتن PNG */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

/** PNG سادهٔ ۸بیتی RGB/RGBA (خروجی کروم) را می‌خواند */
function readPng(file) {
  const buf = readFileSync(file);
  let pos = 8;
  let w = 0;
  let h = 0;
  let colorType = 6;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8) throw new Error("فقط PNG ۸بیتی پشتیبانی می‌شود");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const out = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 0xff;
    }
  }
  return { w, h, bpp, px };
}

function writePng(file, img) {
  const { w, h, bpp, px } = img;
  const stride = w * bpp;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; /* فیلتر None */
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = bpp === 4 ? 6 : 2;
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

/** حاشیه‌های خالی اطراف تصویر را می‌بُرد (پیکسل‌های نزدیک به سفید) */
function crop(file, { pad = 0, threshold = 250 } = {}) {
  const img = readPng(file);
  const { w, h, bpp, px } = img;
  const nearWhite = (x, y) => {
    const i = y * w * bpp + x * bpp;
    return px[i] >= threshold && px[i + 1] >= threshold && px[i + 2] >= threshold;
  };
  const rowEmpty = (y) => {
    for (let x = 0; x < w; x++) if (!nearWhite(x, y)) return false;
    return true;
  };
  const colEmpty = (x) => {
    for (let y = 0; y < h; y++) if (!nearWhite(x, y)) return false;
    return true;
  };
  let top = 0;
  let bottom = h - 1;
  let left = 0;
  let right = w - 1;
  while (top < bottom && rowEmpty(top)) top++;
  while (bottom > top && rowEmpty(bottom)) bottom--;
  while (left < right && colEmpty(left)) left++;
  while (right > left && colEmpty(right)) right--;

  top = Math.max(0, top - pad);
  left = Math.max(0, left - pad);
  bottom = Math.min(h - 1, bottom + pad);
  right = Math.min(w - 1, right + pad);

  const nw = right - left + 1;
  const nh = bottom - top + 1;
  if (nw === w && nh === h) return { w, h };
  const out = Buffer.alloc(nw * nh * bpp);
  for (let y = 0; y < nh; y++) {
    px.copy(
      out,
      y * nw * bpp,
      ((y + top) * w + left) * bpp,
      ((y + top) * w + left + nw) * bpp,
    );
  }
  writePng(file, { w: nw, h: nh, bpp, px: out });
  return { w: nw, h: nh };
}

/* --------------------------------------------------------------------- runner */

function shoot(name, html, { width, height }) {
  mkdirSync(TMP, { recursive: true });
  const page = join(TMP, `${name}.html`);
  const out = join(HERE, `${name}.png`);
  writeFileSync(page, html, "utf8");

  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      "--force-device-scale-factor=2",
      `--user-data-dir=${join(TMP, `profile-${name}`)}`,
      `--window-size=${width},${height}`,
      `--screenshot=${out}`,
      "file:///" + page.replace(/\\/g, "/"),
    ],
    { stdio: "ignore", timeout: 120000 },
  );
  return out;
}

function report(name, box) {
  const kb = (statSync(join(HERE, `${name}.png`)).size / 1024).toFixed(1);
  console.log(`${name.padEnd(6)} → docs/${name}.png  ${box.w}×${box.h}px  ${kb} KB`);
}

/* ----------------------------------------------------------------------- main */

mkdirSync(TMP, { recursive: true });

/* ۱) پاپ‌آپ واقعی — عرض واقعی ۳۸۴px، شات ۲×، برش دقیق */
{
  const out = shoot("popup", docPopup(), { width: 500, height: 1500 });
  report("popup", crop(out, { pad: 2, threshold: 252 }));
}

/* ۲) دموی پیش/پس */
{
  const out = shoot("demo", docDemo(), { width: 1200, height: 640 });
  report("demo", crop(out, { pad: 6, threshold: 250 }));
}

/* ۳) بنر */
{
  const out = shoot("hero", docHero(), { width: 1560, height: 1240 });
  report("hero", crop(out, { pad: 0, threshold: 250 }));
}

rmSync(TMP, { recursive: true, force: true });
console.log("تمام.");
