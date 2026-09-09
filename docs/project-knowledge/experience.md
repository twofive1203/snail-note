# Experience

## Symptom

Paste from the web or Typora into the CodeMirror editor dropped headings, bold, lists, and links.

## How it failed

CodeMirror 6 only inserts `text/plain`. Browser copy also has `text/html`; using the default paste looked like “no format”. `EditorView.clipboardInputFilter` cannot see HTML.

## What worked

Intercept `paste` with `EditorView.domEventHandlers`, read `text/html`, convert with Turndown (ATX, fenced code), insert Markdown. `Ctrl/Cmd+Shift+V` (`shiftKey` or a short-lived keydown flag) stays plain text. Skip conversion when the fragment has no semantic tags so CodeMirror-internal copy (plain Markdown) is not round-tripped through HTML.

## What not to do next time

Do not switch to a WYSIWYG engine to “keep format”. Do not prefer HTML for every paste. Google Docs wraps content in `<b style="font-weight:normal">`; ancestor-bold checks must ignore that dummy wrapper.

---

## Symptom

`![](https://…)` did not show as an image in the default live editor. Copying only the image sometimes showed; pasting a full Jianshu article did not.

## How it failed

Live preview hid `LinkMark` and `URL` and never built an `<img>` widget, so empty-alt images vanished. Preview/live then loaded `https://` on an `http://localhost` page while `//host/path` followed the page protocol and worked. Jianshu/Qiniu query strings contain `|`; raw `](https://…|…)` is fragile Markdown. Clipboard *files* upload locally; article paste only has remote URLs. Server-side fetch of those URLs was 403/SSL/DNS, and failures were swallowed so source stayed `https://`. Existing notes are not rewritten on load.

## What worked

Render http(s) and protocol-relative images as live-preview widgets. Display network images with `//` so HTTP pages can hit HTTP CDNs. Wrap destinations that contain `|` `()` or spaces in `<>`. On paste: screenshot/files → `{note}.assets/` + relative path; article URLs → try browser download then server fetch (browser UA, no-referrer first, `|` → `%7C`, http/https retry). Serve files at `GET /api/notebooks/:id/asset`. Re-paste is required to localize old URLs. Production: rebuild `apps/web/dist`, restart `pnpm start` on 61666, hard-refresh.

## What not to do next time

Do not store images as base64 in `.md`. Do not assume live preview equals Markdown preview. Do not treat “full URL in source” as proof the image renderer is broken. Do not silently ignore asset download errors if the user is staring at source. Do not put vertical `margin` on live-preview block chrome (CodeMirror height map skips those lines; use padding and `margin: 0`). jsdom does not persist `img.referrerPolicy` as an attribute; tests must `setAttribute("referrerpolicy", …)`.
