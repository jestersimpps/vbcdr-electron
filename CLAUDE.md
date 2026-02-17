# vbcdr

## Built-in Browser Control

When running inside vbcdr (`$VBCDR_API` is set), you can control the app's built-in browser via HTTP.

**Base URL:** `$VBCDR_API` (e.g. `http://127.0.0.1:7483`)

All endpoints are **POST** with JSON body. Responses: `{ ok: boolean, data?, error? }`

### Workflow

1. List tabs to get a `tabId`
2. Navigate to a URL
3. Interact (click, type, execute JS, capture HTML/screenshots)

### Endpoints

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

**Get page HTML**
```bash
curl -s -X POST $VBCDR_API/html -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID"}'
```
Returns `{ html: "<html>..." }`

**Take screenshot**
```bash
curl -s -X POST $VBCDR_API/screenshot -H 'Content-Type: application/json' \
  -d '{"tabId":"TAB_ID"}'
```
Returns `{ filePath: "/tmp/..." }` — use Read to view the image

### Tips

- Always list tabs first to discover the correct `tabId`
- Use `/html` or `/screenshot` to understand page state before interacting
- Use `/execute` for complex interactions that `/click` and `/type` can't handle
- The browser runs Chromium — standard DOM APIs and CSS selectors work
