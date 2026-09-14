# DSH RTL — right-to-left for DeepSeek Harness

[🇮🇷 فارسی](README.md) · **English**

A Manifest V3 Chrome extension that flips the **DeepSeek Harness** web UI to
right-to-left and applies the **Vazirmatn** Persian typeface — without patching
DSH itself and without breaking on every update.

Three modes, one click away:

- **Full** — the whole interface mirrors.
- **Chat-only** — only message text is right-aligned; the sidebar, header, tabs,
  composer and every other harness surface keep their stock appearance.
- **Off** — nothing is touched.

In every mode, code, terminals, diffs, the JSON tree, file paths and math stay
**left-to-right** so they remain readable.

![DSH RTL popup](docs/popup.png)

---

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Open the DSH GUI (`http://127.0.0.1:3080`) and reload the page once.

> The extension activates automatically on `127.0.0.1` and `localhost`, but only
> after it recognises the page as DSH (title, `manifest.webmanifest`,
> `favicon.svg` or `window.__DSH_BOOT__`).
>
> For other hosts (e.g. DSH on a LAN address): open the popup → **This site** →
> **Always**. Chrome will ask for permission for that origin.

---

## Modes

| Mode | `<html>` | Harness shell | Conversation content |
| --- | --- | --- | --- |
| **Full** | `data-dsh-rtl="full"` + `dir="rtl"` | mirrors | right-aligned |
| **Chat-only** | `data-dsh-rtl="chat"` (no `dir`) | **untouched** | right-aligned |
| **Off** | no attributes | untouched | untouched |

The split lives in CSS as **two independent gates**:

```css
/* shell: full mode only */
html[data-dsh-rtl="full"][dir="rtl"] { … }

/* content: both modes */
html[data-dsh-rtl][data-dsh-rtl-chat="on"] { … }
```

---

## What it does

| Scenario | Behaviour |
| --- | --- |
| **Three modes** | Full (whole UI), chat-only (conversation text), off (nothing) |
| **Full mirroring** | `dir="rtl"` on `<html>` → sidebar moves right, composer and tabs mirror, scrollbars move left |
| **Chat-only** | No `dir` and no shell rules at all; only the user bubble and assistant markdown flip, everything else stays at harness defaults |
| **Vazirmatn** | Rewrites the app's own font tokens (`--dsw-font-family`) so every component follows — one token, not hundreds of selectors |
| **Smart paragraph direction** | Each paragraph aligns by its first strong character: Persian right, English left |
| **LTR islands** | `pre/code/kbd`, code blocks, terminal, diff, Read/Search output, JSON tree, file paths, KaTeX |
| **Composer (Lexical)** | Direction is applied through CSS, not the `dir` attribute, so Lexical cannot override it |
| **Menus & buttons** | The app's scattered `text-align:left` becomes `start`; dropdowns and submenus anchor to the correct edge |
| **Markdown** | Bullet lists, blockquotes, tables and task-list checkboxes mirror |
| **Icon mirroring** | Disclosure chevrons, tab chrome and the float resize grip — using `scale`, so the app's internal `rotate` still composes |
| **Dock & float panes** | Drop zones, tab close buttons and the resize grip move to the correct side |
| **Persian digits** | Optional `123` → `۱۲۳`, only in conversation text; code, URLs, versions and paths are excluded |
| **On-page pill + shortcut** | Draggable three-state pill and `Alt + Shift + R` to cycle modes |

---

## Why it works this way

Three facts found by inspecting an installed DSH (`dsh-web-frontend` and the
`dsh-client-ui-*` packages) shaped the design:

1. **The app has no RTL support at all.** It never sets `dir` and has no
   `[dir=rtl]` rules, so the extension genuinely has to rotate the layout.
2. **Fonts come from CSS variables.** The `dsh-client-ui-theme` plugin defines
   `--dsw-font-family` and `--ds-font-family-code` on `:root` and every module
   inherits them — overriding two variables restyles the entire UI.
3. **The app exposes semantic hooks.** `data-terminal`, `data-diff`,
   `data-code-block-content`, `data-read`, `data-search`, `data-json-root-row`,
   `data-composer-input`, `data-lexical-editor` and `data-dockkit-*` are exactly
   what is needed to separate "code" from "prose".

One technical caveat: the app's classes are **build-hashed CSS Modules**
(`._markdown_kcgor_5`). The hash changes per build but the semantic name does
not, so selectors target `[class*="_markdown_"]` rather than a full hash.

The CSS gate is `html[data-dsh-rtl="full"][dir="rtl"]` — specificity `(0,2,1)`,
one notch above the app's own rules, so it wins without `!important`. Turning the
extension off just removes the attributes, which means no flicker and no
re-injection.

---

## Settings

The popup offers:

- Master on/off switch
- **Display mode**: full / chat-only / off (sliding segmented control)
- **Scope for this site**: auto / always / never
- **Font**: Vazirmatn, Vazirmatn with Farsi digits, system font, or no change —
  with a live Persian preview
- **Behaviour**: smart paragraph direction, keep code and terminals LTR, mirror
  directional icons (auto-disabled in chat-only mode), Persian digits, on-page pill
- **Advanced**: extra selectors to keep LTR, custom CSS, DSH auto-detection

### Two escape hatches

- **LTR selectors** — anything you list is added to the left-to-right island set.
  Example: `[data-testid="my-widget"]`
- **Custom CSS** — injected into the page as-is:

```css
html[dir="rtl"] .something { margin-inline-start: 12px; }
```

Settings live in `chrome.storage.sync` and apply **without a page reload**, on
every open DSH tab.

---

## Shortcuts

| Action | How |
| --- | --- |
| Cycle modes (full → chat-only → off) | `Alt + Shift + R` or click the on-page pill |
| Move the pill | Drag and drop (position is remembered) |
| Apply immediately to this tab | "Apply to this tab" in the popup |

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| I only want chat text RTL, everything else stock | Pick **Chat-only** in the popup or press `Alt+Shift+R` |
| I select "off" but nothing changes | The site scope is set to **Always**, which overrides the mode; set it back to **Auto** |
| Popup says "not DSH" | The page isn't DSH, or auto-detection found no signal; press **Always** |
| Popup says "not injected" | The extension was installed after the page loaded; reload or press **Apply to this tab** |
| The font didn't change | Reload once — the `@font-face` lives in the extension and must become reachable |
| Something is still LTR | Add its selector to the LTR list, or turn off smart paragraph direction |
| A new component looks broken | Patch it with custom CSS and add the selector to the LTR list |
| The pill is in the way | Turn it off in the popup |

---

## Project layout

```
manifest.json            MV3 — permissions, content script, web-accessible assets
src/rtl.css              all RTL logic and fonts (gated by the html attributes)
src/content.js           settings, DSH detection, guards, digits, on-page pill
src/popup.html/.css/.js  Persian settings UI
fonts/                   Vazirmatn (variable + Farsi-digits) + its OFL license
icons/                   16/32/48/128 icons
docs/                    popup screenshot
test/                    browser tests and the runner
```

---

## Tests

RTL rules are fragile against a real app's CSS (specificity, physical
properties, CSS variables), so there are three layers of automated browser tests:

```powershell
pwsh -File test/run-tests.ps1
```

| Test | What it checks |
| --- | --- |
| `test/selftest.html` | Builds a DSH-like DOM, injects the **app's own rules after** the extension stylesheet (worst-case cascade) and asserts **72** things across all three modes: real font loading, LTR islands, markdown mirroring, flipped physical properties, tool icons *not* mirrored, the shell staying untouched in chat-only mode, and a full revert when off |
| `test/popup-probe.html` | **21** popup layout assertions: fixed 384px width, no horizontal overflow, no clipped labels, RTL, LTR code textareas, font preview and segmented controls |
| `test/e2e.js` | **Loads the actual extension into Chrome** over CDP and runs **43 assertions in three phases** (full, chat-only, off), including a real `woff2` load and render from `chrome-extension://`, with the cache cleared between phases |

Current output on Chrome 152: `PASS=72 FAIL=0`, `PASS=21 FAIL=0`, E2E →
`ALL-PASS (43 checks)` — **136 assertions** in total.

> Chrome 137+ note: the branded build removed `--load-extension`
> ([Selenium](https://github.com/SeleniumHQ/selenium/issues/15788),
> [uBOL](https://github.com/uBlockOrigin/uBOL-home/discussions/342)), so the E2E
> test uses the DevTools Protocol `Extensions` domain instead
> (`--enable-unsafe-extension-debugging` + `Extensions.loadUnpacked`) and writes
> each phase's settings through the extension's own page into `chrome.storage`.
> If the browser refuses to load it, the script exits with code 3 and the other
> two suites remain valid.

---

## Notes

- **Minimal permissions**: `storage` for settings, `scripting` for opt-in hosts,
  `activeTab` to read the current tab's URL. Access to non-loopback origins is
  only granted through `optional_host_permissions` after your explicit consent.
- **Privacy**: nothing leaves your machine; the extension is fully local.
- **Font**: [Vazirmatn](https://github.com/rastikerdar/vazirmatn) by Saber
  Rastikerdar, licensed under the SIL Open Font License 1.1 — see
  [`fonts/LICENSE-Vazirmatn.txt`](fonts/LICENSE-Vazirmatn.txt).
- **No flash**: reading settings from `chrome.storage` is async, so the extension
  applies nothing until the answer arrives (unless a synchronous `localStorage`
  cache exists). Without that guard the page would briefly take the default mode.
- **`unicode-bidi` is not inherited**: smart paragraph direction has to be set on
  the markdown container *and* on each `p/li/td/…`, otherwise only the bubble text
  is affected.
- **Forward compatibility**: if DSH ever renames its CSS Modules the extension
  won't break — only some cosmetic repairs stop matching. The core (direction,
  font, code islands) rides on `data-*` attributes, which are far more stable.

## License

[MIT](LICENSE) for the code. The bundled Vazirmatn fonts remain under the SIL
Open Font License 1.1.
