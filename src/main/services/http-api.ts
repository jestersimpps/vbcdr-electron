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
  TabIdRequest
} from '@main/models/api-types'

export const HTTP_API_PORT = 7483
let server: http.Server | null = null

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
    const { tabId, selector } = body as unknown as ClickRequest
    if (!tabId || !selector) return fail(res, 'tabId and selector required')
    const wc = getTabWebContents(tabId)
    if (!wc) return fail(res, 'Tab not found', 404)

    await wc.executeJavaScript(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Element not found'); el.click(); })()`
    )
    ok(res)
  },

  '/type': async (body, res) => {
    const { tabId, selector, text, clear } = body as unknown as TypeRequest
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
    ok(res)
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
    const { tabId } = body as unknown as TabIdRequest
    if (!tabId) return fail(res, 'tabId required')

    const filePath = await capturePageScreenshot(tabId)
    ok(res, { filePath })
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
