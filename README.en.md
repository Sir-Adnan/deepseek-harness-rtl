# 🪄 DSH RTL — right-to-left for DeepSeek Harness

<div align="center">

[فارسی](README.md) · **English**

[![Version](https://img.shields.io/badge/version-1.0.0-4176e6?style=flat-square)](manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-111%2B-6d4df0?style=flat-square&logo=googlechrome&logoColor=white)](manifest.json)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-0f8a63?style=flat-square)](manifest.json)
[![Tests](https://img.shields.io/badge/tests-136%20assertions%20·%20all%20passing-22c55e?style=flat-square)](test/run-tests.ps1)
[![License](https://img.shields.io/badge/license-MIT-000000?style=flat-square)](LICENSE)

</div>

**Turn the DeepSeek Harness web UI into a proper Persian workspace** — with a single
click, without patching DSH and without breaking on every update.

📐 Fully mirrored layout · ✍️ Vazirmatn typeface · 🧠 Smart paragraph direction
and, above all: 💻 code, terminals, diffs, JSON and math stay **left-to-right and readable**.

<a href="#install"><img src="docs/hero.png" alt="DSH RTL — right-to-left for DeepSeek Harness" width="100%" /></a>

<div align="center">

**[⬇️ Install in 30 seconds](#install)** · **[✨ Features](#features)** · **[🖼️ Before & after](#demo)** · **[🛠️ Troubleshooting](#faq)**

</div>

---

## ✨ Why DSH RTL?

|  |  |
| --- | --- |
| 🎯 **Three modes, one click** | **Full** for a completely Persian interface, **Chat-only** when only the conversation should flip, **Off** to return to stock DSH. |
| 🔤 **Vazirmatn everywhere** | Instead of patching hundreds of selectors, the app's own font tokens are overridden — every component follows. |
| 🧠 **Smart paragraph direction** | Persian paragraphs align right, English paragraphs align left, so mixed sentences still read correctly. |
| 🧩 **LTR islands** | Code, terminals, diffs, Read/Search output, the JSON tree, file paths and KaTeX never get flipped. |
| ⚡ **No page reload** | Settings live in Chrome sync storage and apply instantly across every open DSH tab. |
| 🚫 **No flash** | Nothing is applied until the settings arrive, so the page never briefly shows the wrong layout. |
| 🔐 **Fully local** | Nothing leaves your machine; permissions are minimal and non-loopback hosts are opt-in. |
| 🛡️ **Update-proof** | The core rides on the app's semantic attributes, not on build-hashed class names. |

---

<a id="demo"></a>

## 🖼️ Before & after

One conversation, before the extension and after it. Code islands stay
left-to-right in both panels — only direction and typography change:

<div align="center">

<img src="docs/demo.png" alt="DSH UI before and after installing DSH RTL" width="100%" />

<sub>Simulated chat surface — the extension's floating pill is visible in the frame bar.</sub>

</div>

---

<a id="install"></a>

## 🚀 Install in 30 seconds

### Before you start

- ✅ **Chrome 111 or newer** (or any Chromium browser with Manifest V3 support)
- ✅ **DeepSeek Harness** installed and running — by default on `http://127.0.0.1:3080`
- ✅ **Nothing else** — no Node.js, no build step, no dependencies

> The popup UI itself is in Persian; where it matters, the English name is followed by its on-screen label in parentheses.

### Step by step

**1) Get the code.**
Click the green **Code** button at the top of this page and pick **Download ZIP**, or
clone the repository if you have Git:

```bash
git clone https://github.com/Sir-Adnan/deepseek-harness-rtl.git deepseek-harness-rtl
```

Then extract the ZIP into a **permanent** location. ⚠️ Do not move or delete the folder
afterwards — Chrome runs the extension straight from it.

**2) Open Chrome's extension page.**
Type this address in the URL bar and press Enter:

```text
chrome://extensions
```

**3) Enable Developer mode.**
Turn on the **Developer mode** switch in the **top-right** corner. Three extra buttons
appear at the top of the page.

**4) Load the extension.**
Click **Load unpacked** and select the **project root** — the folder that contains
`manifest.json` — then click **Select Folder**.

✅ On success, a **DSH RTL** card shows up in the list with a blue icon and no error.

**5) Pin it to the toolbar.**
Click the puzzle-piece (Extensions) icon in Chrome's toolbar and hit the pin next to
**DSH RTL** so the popup is always one click away.

**6) Open the DSH GUI.**
Open `http://127.0.0.1:3080` in a tab — or reload it once with `Ctrl + R` if it was
already open. The page should flip to right-to-left immediately.

> 💡 **Did it work?** Open the popup. If you see a green status dot and the current
> host name at the top, everything is wired up. If it says **"not injected"**
> («اجرا نشده»), reload once with `Ctrl + R` or press **"Apply to this tab"**
> («اعمال فوری در این تب»).

### Where does the extension activate?

Out of the box it activates on `127.0.0.1` and `localhost`, and **only** when it
recognises the page as DSH (via `window.__DSH_BOOT__`, the page title,
`manifest.webmanifest`, `favicon.svg` or the app root).

For any other origin — for example DSH served from a LAN address or another port:

1. Open the extension popup and go to **"Scope for this site"** («دامنهٔ اثر روی این سایت»)
2. Pick **"Always"** («همیشه»)
3. Accept Chrome's permission prompt

Only that single origin is granted; every other site stays untouched.

---

## 🔄 The three modes

Cycle them from the popup, from the on-page pill, or with `Alt + Shift + R`:

| Mode | What changes | Best for |
| --- | --- | --- |
| 🟦 **Full** | The whole interface mirrors: sidebar to the right, composer and tabs flipped, scrollbars moved left | A complete, consistent Persian workspace |
| 🟪 **Chat-only** | Only your bubble and the assistant's markdown flip; sidebar, header, tabs, composer and every other harness surface stay **exactly stock** | When you like the original harness layout |
| ⬜ **Off** | Nothing is touched and the page reverts completely | Comparing, or temporarily disabling |

In all three modes, code and technical output stay left-to-right.

### Under the hood

| Mode | Page attributes | Harness shell | Conversation content |
| --- | --- | --- | --- |
| **Full** | `data-dsh-rtl="full"` plus `dir="rtl"` | mirrored | right-aligned |
| **Chat-only** | `data-dsh-rtl="chat"`, no `dir` | **untouched** | right-aligned |
| **Off** | no attributes | untouched | untouched |

The split lives in CSS as **two independent gates**, which is why chat-only mode
genuinely applies no shell rules at all:

```css
/* shell: full mode only */
html[data-dsh-rtl="full"][dir="rtl"] { … }

/* content: both modes */
html[data-dsh-rtl][data-dsh-rtl-chat="on"] { … }
```

---

<a id="features"></a>

## 🎛️ Features

| Feature | What it does |
| --- | --- |
| 🧭 **Full mirroring** | `dir="rtl"` on the root: the sidebar moves right, the composer and tabs flip, scrollbars move left |
| 🔤 **Persian typeface** | Rewrites the app's own font tokens (`--dsw-font-family`, `--ds-font-family-code`) so every component follows |
| 🧠 **Smart paragraph direction** | Each paragraph aligns by its first strong character: Persian right, English left |
| 🏝️ **LTR islands** | Code blocks, terminals, diffs, Read/Search output, the JSON tree, file paths and math |
| ✍️ **Lexical composer** | Direction is applied through CSS, not the `dir` attribute, so Lexical cannot override it; inline code stays LTR |
| 🔘 **Menus & buttons** | The app's scattered left-alignment becomes start-alignment, and dropdowns anchor to the correct edge |
| 📝 **Markdown** | Bullet lists, blockquotes, tables and task-list checkboxes mirror |
| 🪞 **Icon mirroring** | Disclosure chevrons, tab chrome and the float grip — using `scale`, so the app's own `rotate` still composes |
| 🪟 **Dock & float panes** | Drop zones, tab close buttons and the resize grip move to the correct side |
| 🔢 **Persian digits** | Optional: Latin digits in conversation text become Persian; code, URLs, versions and paths are excluded |
| 🟣 **Floating pill & shortcut** | A draggable three-state pill plus `Alt + Shift + R` to cycle modes |

---

<details>
<summary><b>🔬 Why it works this way (technical notes)</b></summary>

<br/>

Three facts found by inspecting an installed DSH (`dsh-web-frontend` and the
`dsh-client-ui-*` packages) shaped the design:

1. **The app has no RTL support at all.** It never sets `dir` and has no `[dir=rtl]`
   rules, so the extension genuinely has to rotate the layout.
2. **Fonts come from CSS variables.** The `dsh-client-ui-theme` plugin defines
   `--dsw-font-family` and `--ds-font-family-code` on the root and every module
   inherits them — overriding two variables restyles the entire UI.
3. **The app exposes semantic hooks.** `data-terminal`, `data-diff`,
   `data-code-block-content`, `data-read`, `data-search`, `data-json-root-row`,
   `data-composer-input`, `data-lexical-editor` and `data-dockkit-*` are exactly what
   is needed to separate "code" from "prose".

**Class names:** the app uses build-hashed CSS Modules. The hash changes per build but
the semantic name does not, so selectors target `[class*="_markdown_"]` instead of a
full hash.

**Winning without `!important`:** the extension's CSS gate has a specificity of
`(0,2,1)` — one notch above the app's own rules — so it wins outright. Turning the
extension off simply removes the attributes: no flicker, no re-injection.

**No flash:** reading settings is asynchronous, so nothing is applied until the answer
arrives (unless a synchronous cache exists). Without that guard the page would briefly
take the default layout.

**Bidi is not inherited:** smart paragraph direction has to be set on the markdown
container *and* on each paragraph, list item and table cell, otherwise only the bubble
text is affected.

</details>

---

## ⚙️ Settings

Everything lives in the extension popup (click the toolbar icon):

<div align="center">

<img src="docs/popup.png" alt="DSH RTL settings popup" width="280" />

<sub>The real popup — advanced options are collapsed at the bottom.</sub>

</div>

| Section | Controls |
| --- | --- |
| 🔌 **Header** | Master on/off switch plus live status for the current page |
| 🎚️ **Display mode** | Full / chat-only / off segmented control and **Apply to this tab** |
| 🌐 **Scope for this site** | Auto, always or never |
| 🔤 **Font** | Font family with a **live Persian preview**, plus line height |
| 🧠 **Behaviour** | Smart paragraph direction, keep code and terminals LTR, mirror directional icons, Persian digits, floating pill |
| 🧰 **Advanced** | Extra selectors to keep LTR, custom CSS, DSH auto-detection, reset to defaults |

> "Mirror directional icons" («آینه‌کردن آیکون‌های جهت‌دار») only applies in full mode; in
> chat-only mode it is automatically disabled and greyed out.

### Two escape hatches

- **LTR selectors** — anything you list joins the left-to-right island set.
  Example: `[data-testid="my-widget"]`
- **Custom CSS** — injected into the page as-is:

```css
html[dir="rtl"] .something { margin-inline-start: 12px; }
```

> 🔄 Settings live in Chrome sync storage and apply **without a page reload**, on every
> open DSH tab.

---

## ⌨️ Shortcuts & controls

| Action | How |
| --- | --- |
| 🔁 Cycle modes (full → chat-only → off) | `Alt + Shift + R` or click the on-page pill |
| 🖐️ Move the pill | Drag and drop; the position is remembered |
| ⚡ Apply immediately to this tab | "Apply to this tab" in the popup |

---

<a id="faq"></a>

## 🛠️ Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| 😐 I only want chat text RTL, everything else stock | Pick **Chat-only** in the popup or press `Alt + Shift + R` |
| 🤔 I select "off" but nothing changes | The site scope does not override the mode: turn the master switch on and set the mode to **Full**. A scope of **Never** («هرگز») keeps that site permanently off, so set it back to **Auto** |
| 🚫 The popup says "not DSH" | The page isn't DSH, or "DSH pages only" is on and detection found no signal; press **Always** |
| 🔌 The popup says "not injected" | The extension was installed after the page loaded; reload or press **Apply to this tab** |
| 🔤 The font didn't change | Reload once — the font ships inside the extension and must become reachable |
| ⬅️ Something is still LTR | Add its selector to the LTR list, or turn off smart paragraph direction |
| 🧩 A new component looks broken | Patch it with custom CSS and add the selector to the LTR list |
| 😵 The pill is in the way | Turn it off in the popup |
| 🧱 The extensions page shows an error card | Make sure you selected the folder containing `manifest.json` and that it has not been moved |

---

## 📁 Project layout

```text
manifest.json            MV3 — permissions, content script, web-accessible assets
src/rtl.css              all RTL logic and fonts (gated by the html attributes)
src/content.js           settings, DSH detection, guards, digits, on-page pill
src/popup.html/.css/.js  Persian settings UI
fonts/                   Vazirmatn (variable + Farsi-digits) — 310 KB
icons/                   16, 32, 48 and 128 px icons
docs/                    README images and the script that builds them
test/                    browser tests and the runner
```

---

## 🧪 Tests

RTL rules are fragile against a real app's CSS (specificity, physical properties,
CSS variables), so there are three layers of automated browser tests:

```powershell
pwsh -File test/run-tests.ps1
```

| Test | What it checks |
| --- | --- |
| `test/selftest.html` | Builds a DSH-like DOM, injects the **app's own rules after** the extension stylesheet (worst-case cascade) and asserts **72** things across all three modes: real font loading, LTR islands, markdown mirroring, flipped physical properties, tool icons *not* mirrored, the shell staying untouched in chat-only mode, and a full revert when off |
| `test/popup-probe.html` | **21** popup layout assertions: fixed 384 px width, no horizontal overflow, no clipped labels, RTL, LTR code textareas, font preview and segmented controls |
| `test/e2e.js` | **Loads the actual extension into Chrome** over CDP and runs **43 assertions in three phases** (full, chat-only, off), including a real `woff2` load and render from the extension origin, with the cache cleared between phases |

Current output on Chrome 152: `PASS=72 FAIL=0`, `PASS=21 FAIL=0`, E2E →
`ALL-PASS (43 checks)` — **136 assertions** in total.

> **Chrome 137+ note:** the branded build removed `--load-extension`
> ([Selenium](https://github.com/SeleniumHQ/selenium/issues/15788),
> [uBOL](https://github.com/uBlockOrigin/uBOL-home/discussions/342)), so the E2E test
> uses the DevTools Protocol `Extensions` domain instead
> (`--enable-unsafe-extension-debugging` + `Extensions.loadUnpacked`) and writes each
> phase's settings through the extension's own page into `chrome.storage.sync`. If the
> browser refuses to load it, the script exits with code 3 and the other two suites
> remain valid.

### Rebuilding the README images

```bash
node docs/build-images.mjs
```

The script renders `docs/popup.png`, `docs/demo.png` and `docs/hero.png` with headless
Chrome and trims blank margins pixel by pixel. Point `CHROME_PATH` at a custom browser
binary if needed.

---

## 🔐 Privacy & license

- **Minimal permissions:** `storage` for settings, `scripting` for opt-in hosts and
  `activeTab` to read the current tab's URL. Non-loopback origins are only granted
  through `optional_host_permissions` after your explicit consent.
- **Nothing leaves your machine:** the extension is fully local and makes no tracking
  or analytics requests.
- **Font:** [Vazirmatn](https://github.com/rastikerdar/vazirmatn) by Saber Rastikerdar,
  licensed under the SIL Open Font License 1.1 — see
  [`fonts/LICENSE-Vazirmatn.txt`](fonts/LICENSE-Vazirmatn.txt).
- **Code license:** [MIT](LICENSE). The bundled Vazirmatn fonts remain under the SIL
  Open Font License 1.1.
- **Forward compatibility:** if DSH ever renames its CSS Modules the extension won't
  break — only some cosmetic repairs stop matching. The core (direction, font, code
  islands) rides on `data-*` attributes, which are far more stable.

---

## 💬 Ideas or requests?

If you would rather have this as a **DSH plugin of its own** (using the
`dsh-client-ui-*` packages with custom CSS) instead of a Chrome extension, say the word
and I'll build that too: the upside is no Chrome and support for every client, the
downside is that it must be installed inside the DSH environment.

**If DSH RTL made your daily workflow better, support the project with a star.** ⭐
