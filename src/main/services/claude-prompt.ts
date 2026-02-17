import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { HTTP_API_PORT } from '@main/services/http-api'

const CLAUDE_DIR = path.join(homedir(), '.claude')
const CLAUDE_MD = path.join(CLAUDE_DIR, 'CLAUDE.md')
const START_MARKER = '<!-- VBCDR_START -->'
const END_MARKER = '<!-- VBCDR_END -->'

const BROWSER_PROMPT = `${START_MARKER}
# vbcdr — Built-in Browser Control

You are running inside **vbcdr**. The environment variable \`$VBCDR_API\` (e.g. \`http://127.0.0.1:${HTTP_API_PORT}\`) gives you HTTP access to the app's built-in Chromium browser.

All endpoints are **POST** with JSON body. Responses: \`{ ok: boolean, data?, error? }\`

## Interaction Pattern

Always follow this loop — never click or type blindly:

1. \`/tabs\` — get a \`tabId\`
2. \`/navigate\` — go to a URL (blocks until page loads, 30s timeout)
3. \`/querySelector\` or \`/screenshot\` — understand the page structure
4. \`/click\`, \`/type\`, or \`/execute\` — interact
5. \`/waitForSelector\` — wait for async results to appear
6. \`/text\` or \`/screenshot\` — verify the outcome

## Core Endpoints

**List browser tabs**
\`\`\`bash
curl -s -X POST $VBCDR_API/tabs
\`\`\`
Returns \`{ tabs: [{ id, url, title }] }\`

**Navigate**
\`\`\`bash
curl -s -X POST $VBCDR_API/navigate -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID","url":"https://example.com"}'
\`\`\`
Returns \`{ url, title }\` after page loads (30s timeout)

**Click element**
\`\`\`bash
curl -s -X POST $VBCDR_API/click -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID","selector":"button.submit"}'
\`\`\`

**Type into element**
\`\`\`bash
curl -s -X POST $VBCDR_API/type -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID","selector":"input#email","text":"hello","clear":true}'
\`\`\`
\`clear\` (optional) empties the field first

**Execute JavaScript**
\`\`\`bash
curl -s -X POST $VBCDR_API/execute -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID","script":"document.title"}'
\`\`\`
Returns \`{ result: <return value> }\`

## Query & Inspect Endpoints

**Query DOM elements** — structured inspection without pulling full HTML
\`\`\`bash
curl -s -X POST $VBCDR_API/querySelector -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID","selector":"a.nav-link","all":true,"attributes":["textContent","href","className"]}'
\`\`\`
Returns \`{ elements: [{ tagName, textContent, href, className }] }\` — capped at 50 elements, 500 chars per attribute. Use \`all: false\` (default) for a single match.

**Get text content** — lightweight alternative to \`/html\`
\`\`\`bash
curl -s -X POST $VBCDR_API/text -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID","selector":".article-body"}'
\`\`\`
Returns \`{ text: "..." }\` — omit \`selector\` to get full page text via \`document.body.innerText\`

**Get page HTML**
\`\`\`bash
curl -s -X POST $VBCDR_API/html -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID"}'
\`\`\`
Returns \`{ html: "<html>..." }\` — WARNING: can be 500KB+ on modern pages. Prefer \`/text\` or \`/querySelector\` when you only need specific content.

**Take screenshot**
\`\`\`bash
curl -s -X POST $VBCDR_API/screenshot -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID"}'
\`\`\`
Returns \`{ filePath: "/tmp/..." }\` — use Read tool to view the image

## Wait & Navigation Endpoints

**Wait for selector** — poll until an element appears
\`\`\`bash
curl -s -X POST $VBCDR_API/waitForSelector -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID","selector":".results-loaded","timeout":5000}'
\`\`\`
Returns \`{ found: true }\` or 408 on timeout. Default timeout: 5000ms.

**Scroll**
\`\`\`bash
curl -s -X POST $VBCDR_API/scroll -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID","direction":"down","amount":500}'
\`\`\`
\`direction\`: \`up\`, \`down\`, \`top\`, \`bottom\`. Default: \`down\`, 500px.

**Back / Forward**
\`\`\`bash
curl -s -X POST $VBCDR_API/back -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID"}'
curl -s -X POST $VBCDR_API/forward -H 'Content-Type: application/json' \\
  -d '{"tabId":"TAB_ID"}'
\`\`\`

## Common Recipes with /execute

\`\`\`js
[...document.querySelectorAll('a[href]')].map(a => ({ text: a.textContent.trim(), href: a.href }))

const s = document.querySelector('select#country'); s.value = 'US'; s.dispatchEvent(new Event('change', { bubbles: true }))

const cb = document.querySelector('input[type=checkbox]#agree'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }))

document.querySelector('.target').scrollIntoView({ behavior: 'smooth' })

getComputedStyle(document.querySelector('.box')).backgroundColor
\`\`\`

## Error Recovery

- **Element not found?** Use \`/querySelector\` with a broader selector or \`/screenshot\` to see the actual page. Try \`"selector": "*"\` with \`"all": true\` to list top-level elements.
- **Page not loaded yet?** Use \`/waitForSelector\` after \`/navigate\` or \`/click\` that triggers async loading.
- **Selector too complex?** Use \`/execute\` to run JS that finds elements by text content: \`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Submit'))\`
- **SPA navigation?** A \`/click\` on a link may not trigger a full page load. Use \`/waitForSelector\` for the new content instead of \`/navigate\`.

## Rules

- Always call \`/tabs\` first — never hardcode a \`tabId\`
- Prefer \`/text\` or \`/querySelector\` over \`/html\` — avoid pulling the full DOM unless necessary
- After any action that triggers loading (click, navigate), use \`/waitForSelector\` before inspecting results
- Use \`/screenshot\` + Read tool when visual layout matters
- Standard CSS selectors work: \`#id\`, \`.class\`, \`[attr=value]\`, \`div > span:nth-child(2)\`
${END_MARKER}`

function stripVbcdrBlock(content: string): string {
  const startIdx = content.indexOf(START_MARKER)
  if (startIdx === -1) return content
  const endIdx = content.indexOf(END_MARKER)
  if (endIdx === -1) return content
  const before = content.substring(0, startIdx)
  const after = content.substring(endIdx + END_MARKER.length)
  return (before + after).replace(/\n{3,}/g, '\n\n').trim()
}

export async function injectBrowserPrompt(): Promise<void> {
  try {
    await mkdir(CLAUDE_DIR, { recursive: true })

    let existing = ''
    try {
      existing = await readFile(CLAUDE_MD, 'utf-8')
    } catch {
      // file doesn't exist yet
    }

    const cleaned = stripVbcdrBlock(existing)
    const separator = cleaned.length > 0 ? '\n\n' : ''
    const result = cleaned + separator + BROWSER_PROMPT + '\n'

    await writeFile(CLAUDE_MD, result, 'utf-8')
    console.log('Injected vbcdr browser prompt into ~/.claude/CLAUDE.md')
  } catch (err) {
    console.error('Failed to inject browser prompt:', err)
  }
}

export async function removeBrowserPrompt(): Promise<void> {
  try {
    const content = await readFile(CLAUDE_MD, 'utf-8')
    if (!content.includes(START_MARKER)) return

    const cleaned = stripVbcdrBlock(content)
    await writeFile(CLAUDE_MD, cleaned.length > 0 ? cleaned + '\n' : '', 'utf-8')
    console.log('Removed vbcdr browser prompt from ~/.claude/CLAUDE.md')
  } catch {
    // file doesn't exist or can't be read — nothing to remove
  }
}
