# vbcdr

## Built-in Browser Control

When running inside vbcdr (`$VBCDR_API` is set), you can control the app's built-in Chromium browser via HTTP.

**Base URL:** `$VBCDR_API` (e.g. `http://127.0.0.1:7483`)

All endpoints are **POST** with JSON body. Responses: `{ ok: boolean, data?, error? }`

### Interaction Pattern

Always follow this loop — never click or type blindly:

1. `/tabs` — get a `tabId`
2. `/navigate` — go to a URL (blocks until page loads, 30s timeout)
3. `/querySelector` or `/screenshot` — understand the page structure
4. `/click`, `/type`, or `/execute` — interact
5. `/waitForSelector` — wait for async results to appear
6. `/text` or `/screenshot` — verify the outcome

### Core Endpoints

**List browser tabs**
```bash
curl -s -X POST $VBCDR_API/tabs
```
Returns `{ tabs: [{ id, url, title }] }`

**Navigate**
```bash
curl -s -X POST $VBCDR_API/navigate -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID","url":"https://example.com"}'
```
Returns `{ url, title }` after page loads (30s timeout)

**Click element**
```bash
curl -s -X POST $VBCDR_API/click -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID","selector":"button.submit"}'
```

**Type into element**
```bash
curl -s -X POST $VBCDR_API/type -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID","selector":"input#email","text":"hello","clear":true}'
```
`clear` (optional) empties the field first

**Execute JavaScript**
```bash
curl -s -X POST $VBCDR_API/execute -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID","script":"document.title"}'
```
Returns `{ result: <return value> }`

### Query & Inspect Endpoints

**Query DOM elements** — structured inspection without pulling full HTML
```bash
curl -s -X POST $VBCDR_API/querySelector -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID","selector":"a.nav-link","all":true,"attributes":["textContent","href","className"]}'
```
Returns `{ elements: [{ tagName, textContent, href, className }] }` — capped at 50 elements, 500 chars per attribute. Use `all: false` (default) for a single match.

**Get text content** — lightweight alternative to `/html`
```bash
curl -s -X POST $VBCDR_API/text -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID","selector":".article-body"}'
```
Returns `{ text: "..." }` — omit `selector` to get full page text via `document.body.innerText`

**Get page HTML**
```bash
curl -s -X POST $VBCDR_API/html -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID"}'
```
Returns `{ html: "<html>..." }` — WARNING: can be 500KB+ on modern pages. Prefer `/text` or `/querySelector` when you only need specific content.

**Take screenshot**
```bash
curl -s -X POST $VBCDR_API/screenshot -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID"}'
```
Returns `{ filePath: "/tmp/..." }` — use Read tool to view the image

### Wait & Navigation Endpoints

**Wait for selector** — poll until an element appears
```bash
curl -s -X POST $VBCDR_API/waitForSelector -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID","selector":".results-loaded","timeout":5000}'
```
Returns `{ found: true }` or 408 on timeout. Default timeout: 5000ms.

**Scroll**
```bash
curl -s -X POST $VBCDR_API/scroll -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID","direction":"down","amount":500}'
```
`direction`: `up`, `down`, `top`, `bottom`. Default: `down`, 500px.

**Back / Forward**
```bash
curl -s -X POST $VBCDR_API/back -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID"}'
curl -s -X POST $VBCDR_API/forward -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID"}'
```

### Common Recipes with /execute

```js
// Get all links on page
[...document.querySelectorAll('a[href]')].map(a => ({ text: a.textContent.trim(), href: a.href }))

// Select a dropdown option
const s = document.querySelector('select#country'); s.value = 'US'; s.dispatchEvent(new Event('change', { bubbles: true }))

// Check a checkbox
const cb = document.querySelector('input[type=checkbox]#agree'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }))

// Scroll element into view
document.querySelector('.target').scrollIntoView({ behavior: 'smooth' })

// Get computed styles
getComputedStyle(document.querySelector('.box')).backgroundColor
```

### Error Recovery

- **Element not found?** Use `/querySelector` with a broader selector or `/screenshot` to see the actual page. Try `"selector": "*"` with `"all": true` to list top-level elements.
- **Page not loaded yet?** Use `/waitForSelector` after `/navigate` or `/click` that triggers async loading.
- **Selector too complex?** Use `/execute` to run JS that finds elements by text content: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Submit'))`
- **SPA navigation?** A `/click` on a link may not trigger a full page load. Use `/waitForSelector` for the new content instead of `/navigate`.

### Rules

- Always call `/tabs` first — never hardcode a `tabId`
- Prefer `/text` or `/querySelector` over `/html` — avoid pulling the full DOM unless necessary
- After any action that triggers loading (click, navigate), use `/waitForSelector` before inspecting results
- Use `/screenshot` + Read tool when visual layout matters
- Standard CSS selectors work: `#id`, `.class`, `[attr=value]`, `div > span:nth-child(2)`
