import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import {
  getTabWebContents,
  listTrackedTabs,
  capturePageHtml,
  capturePageScreenshot
} from '@main/services/browser-view'
import type {
  ApiResponse,
  NavigateRequest,
  ClickRequest,
  TypeRequest,
  ExecuteJsRequest,
  TabIdRequest,
  WaitForSelectorRequest,
  TextRequest,
  ScrollRequest,
  QuerySelectorRequest,
  ScrapeRequest,
  ClickAndWaitRequest,
  ScreenshotRequest,
  StateRequest,
  StateResponse,
  ClickByIndexRequest,
  TypeByIndexRequest
} from '@main/models/api-types'

export const HTTP_API_PORT = 7483
let server: http.Server | null = null

const elementIndexCache = new Map<string, Map<number, string>>()

function clearElementIndexCache(tabId: string): void {
  elementIndexCache.delete(tabId)
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString()
        resolve(raw.length > 0 ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function send<T>(res: ServerResponse, data: ApiResponse<T>): void {
  const json = JSON.stringify(data)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(json)
}

function ok<T>(res: ServerResponse, data?: T): void {
  send(res, { ok: true, data })
}

function fail(res: ServerResponse, error: string, status = 400): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error }))
}

type RouteHandler = (body: Record<string, unknown>, res: ServerResponse) => Promise<void>

const routes: Record<string, RouteHandler> = {
  '/status': async (_body, res) => {
    ok(res)
  },

  '/tabs': async (_body, res) => {
    ok(res, { tabs: listTrackedTabs() })
  },

  '/navigate': async (body, res) => {
    const { tabId, url } = body as unknown as NavigateRequest
    if (!tabId || !url) return fail(res, 'tabId and url required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    await Promise.race([
      new Promise<void>((resolve) => {
        wc.once('did-finish-load', () => resolve())
        wc.loadURL(url)
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Navigation timed out')), 30000)
      )
    ])

    ok(res, { url: wc.getURL(), title: wc.getTitle() })
  },

  '/click': async (body, res) => {
    const { tabId, selector, silent } = body as unknown as ClickRequest
    if (!tabId || !selector) return fail(res, 'tabId and selector required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    await wc.executeJavaScript(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Element not found'); el.click(); })()`
    )
    ok(res, silent ? {} : { success: true })
  },

  '/type': async (body, res) => {
    const { tabId, selector, text, clear, silent } = body as unknown as TypeRequest
    if (!tabId || !selector || text === undefined) return fail(res, 'tabId, selector, and text required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    await wc.executeJavaScript(
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found');
        el.focus();
        ${clear ? 'el.value = "";' : ''}
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })()`
    )
    ok(res, silent ? {} : { success: true })
  },

  '/execute': async (body, res) => {
    const { tabId, script } = body as unknown as ExecuteJsRequest
    if (!tabId || !script) return fail(res, 'tabId and script required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    const result = await wc.executeJavaScript(script)
    ok(res, { result })
  },

  '/html': async (body, res) => {
    const { tabId } = body as unknown as TabIdRequest
    if (!tabId) return fail(res, 'tabId required')

    const html = await capturePageHtml(tabId)
    ok(res, { html })
  },

  '/screenshot': async (body, res) => {
    const { tabId, width, height, quality, format } = body as unknown as ScreenshotRequest
    if (!tabId) return fail(res, 'tabId required')

    const filePath = await capturePageScreenshot(tabId, {
      width,
      height,
      quality,
      format
    })
    ok(res, { filePath })
  },

  '/waitForSelector': async (body, res) => {
    const { tabId, selector, timeout = 5000 } = body as unknown as WaitForSelectorRequest
    if (!tabId || !selector) return fail(res, 'tabId and selector required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    const interval = 200
    const maxAttempts = Math.ceil(timeout / interval)
    for (let i = 0; i < maxAttempts; i++) {
      const found = await wc.executeJavaScript(
        `!!document.querySelector(${JSON.stringify(selector)})`
      )
      if (found) return ok(res, { found: true })
      await new Promise((r) => setTimeout(r, interval))
    }
    fail(res, `Selector "${selector}" not found within ${timeout}ms`, 408)
  },

  '/text': async (body, res) => {
    const { tabId, selector } = body as unknown as TextRequest
    if (!tabId) return fail(res, 'tabId required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    const script = selector
      ? `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Element not found'); return el.innerText; })()`
      : `document.body.innerText`
    const text = await wc.executeJavaScript(script)
    ok(res, { text })
  },

  '/back': async (body, res) => {
    const { tabId, silent } = body as unknown as TabIdRequest & { silent?: boolean }
    if (!tabId) return fail(res, 'tabId required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    if (wc.navigationHistory.canGoBack()) {
      wc.navigationHistory.goBack()
      ok(res, silent ? {} : { success: true })
    } else {
      fail(res, 'No history to go back to')
    }
  },

  '/forward': async (body, res) => {
    const { tabId, silent } = body as unknown as TabIdRequest & { silent?: boolean }
    if (!tabId) return fail(res, 'tabId required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    if (wc.navigationHistory.canGoForward()) {
      wc.navigationHistory.goForward()
      ok(res, silent ? {} : { success: true })
    } else {
      fail(res, 'No history to go forward to')
    }
  },

  '/scroll': async (body, res) => {
    const { tabId, direction = 'down', amount = 500, silent } = body as unknown as ScrollRequest
    if (!tabId) return fail(res, 'tabId required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    const scrollScript: Record<string, string> = {
      down: `window.scrollBy(0, ${amount})`,
      up: `window.scrollBy(0, -${amount})`,
      top: `window.scrollTo(0, 0)`,
      bottom: `window.scrollTo(0, document.body.scrollHeight)`
    }
    const script = scrollScript[direction]
    if (!script) return fail(res, 'direction must be up, down, top, or bottom')
    await wc.executeJavaScript(script)
    ok(res, silent ? {} : { success: true })
  },

  '/querySelector': async (body, res) => {
    const { tabId, selector, attributes = ['textContent', 'href', 'className'], all = false, limit = 50 } = body as unknown as QuerySelectorRequest
    if (!tabId || !selector) return fail(res, 'tabId and selector required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    const attrs = JSON.stringify(attributes)
    const script = all
      ? `[...document.querySelectorAll(${JSON.stringify(selector)})].slice(0, ${limit}).map(el => {
          const obj = { tagName: el.tagName.toLowerCase() };
          for (const a of ${attrs}) { if (el[a] !== undefined && el[a] !== null && el[a] !== '') obj[a] = typeof el[a] === 'string' ? el[a].substring(0, 500) : el[a]; }
          return obj;
        })`
      : `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const obj = { tagName: el.tagName.toLowerCase() };
          for (const a of ${attrs}) { if (el[a] !== undefined && el[a] !== null && el[a] !== '') obj[a] = typeof el[a] === 'string' ? el[a].substring(0, 500) : el[a]; }
          return obj;
        })()`
    const result = await wc.executeJavaScript(script)
    ok(res, { elements: all ? result : (result ? [result] : []) })
  },

  '/scrape': async (body, res) => {
    const { url } = body as unknown as ScrapeRequest
    if (!url) return fail(res, 'url required')

    try {
      const jinaUrl = url.startsWith('http') ? url : `https://${url}`
      const response = await fetch(`https://r.jina.ai/${encodeURIComponent(jinaUrl)}`, {
        signal: AbortSignal.timeout(30000)
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const markdown = await response.text()
      ok(res, { markdown, url: jinaUrl })
    } catch (error) {
      fail(res, error instanceof Error ? error.message : 'Scrape failed', 500)
    }
  },

  '/clickAndWait': async (body, res) => {
    const { tabId, clickSelector, waitSelector, extractText, timeout = 5000 } = body as unknown as ClickAndWaitRequest
    if (!tabId || !clickSelector || !waitSelector) {
      return fail(res, 'tabId, clickSelector, and waitSelector required')
    }

    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    try {
      await wc.executeJavaScript(
        `(() => { const el = document.querySelector(${JSON.stringify(clickSelector)}); if (!el) throw new Error('Click element not found'); el.click(); })()`
      )

      const interval = 200
      const maxAttempts = Math.ceil(timeout / interval)
      let found = false
      for (let i = 0; i < maxAttempts; i++) {
        found = await wc.executeJavaScript(`!!document.querySelector(${JSON.stringify(waitSelector)})`)
        if (found) break
        await new Promise((r) => setTimeout(r, interval))
      }
      if (!found) return fail(res, `Selector "${waitSelector}" not found within ${timeout}ms`, 408)

      let text: string | undefined
      if (extractText) {
        text = await wc.executeJavaScript(
          `(() => { const el = document.querySelector(${JSON.stringify(waitSelector)}); if (!el) throw new Error('Element not found'); return el.innerText; })()`
        )
      }

      ok(res, { success: true, ...(text && { text }) })
    } catch (error) {
      fail(res, error instanceof Error ? error.message : 'Operation failed', 500)
    }
  },

  '/state': async (body, res) => {
    const { tabId, viewportThreshold = 1000 } = body as unknown as StateRequest
    if (!tabId) return fail(res, 'tabId required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    const script = `(() => {
      const INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL']);
      const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'menuitem', 'tab', 'searchbox']);

      function isInteractive(el) {
        if (INTERACTIVE_TAGS.has(el.tagName)) return true;
        const role = el.getAttribute('role');
        if (role && INTERACTIVE_ROLES.has(role)) return true;
        const onclick = el.getAttribute('onclick');
        if (onclick) return true;
        const style = window.getComputedStyle(el);
        if (style.cursor === 'pointer') return true;
        return false;
      }

      function isVisible(el, viewportHeight) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const threshold = ${viewportThreshold};
        return rect.top < viewportHeight + threshold && rect.bottom > -threshold;
      }

      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollY: window.scrollY,
        scrollX: window.scrollX
      };

      const elements = [];
      const allElements = document.querySelectorAll('*');
      let hiddenCount = 0;

      for (const el of allElements) {
        const interactive = isInteractive(el);
        const visible = isVisible(el, viewport.height);

        if (!interactive && !visible) continue;

        const rect = el.getBoundingClientRect();
        const text = (el.innerText || el.textContent || '').trim().substring(0, 100);
        const ariaLabel = el.getAttribute('aria-label');
        const role = el.getAttribute('role');

        const attributes = {};
        for (const attr of el.attributes) {
          if (['id', 'name', 'class', 'type', 'placeholder', 'value', 'href', 'aria-label'].includes(attr.name)) {
            attributes[attr.name] = attr.value;
          }
        }

        if (!visible) {
          hiddenCount++;
        } else {
          elements.push({
            tag: el.tagName.toLowerCase(),
            text,
            role,
            ariaLabel,
            bounds: {
              x: rect.x + window.scrollX,
              y: rect.y + window.scrollY,
              width: rect.width,
              height: rect.height
            },
            attributes,
            isVisible: visible,
            isInteractive: interactive
          });
        }
      }

      return { elements, viewport, hiddenElementsCount: hiddenCount };
    })()`

    const result = await wc.executeJavaScript(script) as Omit<StateResponse, 'elements'> & { elements: Omit<StateResponse['elements'][0], 'index'>[] }

    const indexMap = new Map<number, string>()
    const indexedElements = result.elements.map((el, index) => {
      const selector =
        el.attributes.id ? `#${el.attributes.id}` :
        el.attributes.name ? `[name="${el.attributes.name}"]` :
        `${el.tag}`
      indexMap.set(index, selector)
      return { ...el, index }
    })

    elementIndexCache.set(tabId, indexMap)

    ok(res, {
      elements: indexedElements,
      viewport: result.viewport,
      hiddenElementsCount: result.hiddenElementsCount
    } as StateResponse)
  },

  '/clickByIndex': async (body, res) => {
    const { tabId, index, silent } = body as unknown as ClickByIndexRequest
    if (!tabId || index === undefined) return fail(res, 'tabId and index required')

    const indexMap = elementIndexCache.get(tabId)
    if (!indexMap) return fail(res, 'No element index cache found. Call /state first', 400)

    const selector = indexMap.get(index)
    if (!selector) return fail(res, `Element index ${index} not found`, 404)

    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    await wc.executeJavaScript(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Element not found'); el.click(); })()`
    )
    ok(res, silent ? {} : { success: true })
  },

  '/typeByIndex': async (body, res) => {
    const { tabId, index, text, clear, silent } = body as unknown as TypeByIndexRequest
    if (!tabId || index === undefined || text === undefined) {
      return fail(res, 'tabId, index, and text required')
    }

    const indexMap = elementIndexCache.get(tabId)
    if (!indexMap) return fail(res, 'No element index cache found. Call /state first', 400)

    const selector = indexMap.get(index)
    if (!selector) return fail(res, `Element index ${index} not found`, 404)

    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    await wc.executeJavaScript(
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found');
        el.focus();
        ${clear ? 'el.value = "";' : ''}
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })()`
    )
    ok(res, silent ? {} : { success: true })
  }
}

export function startHttpApi(): void {
  server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
      return fail(res, 'POST only', 405)
    }

    const handler = routes[req.url ?? '']
    if (!handler) {
      return fail(res, 'Not found', 404)
    }

    try {
      const body = await readBody(req)
      await handler(body, res)
    } catch (err) {
      fail(res, err instanceof Error ? err.message : String(err), 500)
    }
  })

  server.listen(HTTP_API_PORT, '127.0.0.1', () => {
    console.log(`HTTP API listening on 127.0.0.1:${HTTP_API_PORT}`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`HTTP API port ${HTTP_API_PORT} already in use, skipping`)
      server = null
    } else {
      console.error('HTTP API error:', err)
    }
  })
}

export function stopHttpApi(): void {
  if (server) {
    server.close()
    server = null
  }
}
