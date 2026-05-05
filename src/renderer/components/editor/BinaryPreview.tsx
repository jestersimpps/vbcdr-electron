import { useCallback, useEffect, useRef, useState } from 'react'
import { FileWarning } from 'lucide-react'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif'])

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif'
}

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  wma: 'audio/x-ms-wma',
  opus: 'audio/opus',
  webm: 'audio/webm',
  aiff: 'audio/aiff',
  aif: 'audio/aiff'
}

export interface BinaryFile {
  name: string
  content: string
}

function getFileExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return bytes.buffer
}

function PdfPreview({ file }: { file: BinaryFile }): React.ReactElement {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file.content) return
    const blob = new Blob([base64ToArrayBuffer(file.content)], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file.content])

  if (!blobUrl) return <DocLoading label="Loading PDF…" />

  return (
    <iframe
      src={blobUrl}
      title={file.name}
      className="h-full w-full border-0"
    />
  )
}

function DocxPreview({ file }: { file: BinaryFile }): React.ReactElement {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file.content) return
    let cancelled = false
    import('mammoth/mammoth.browser').then((mammoth) =>
      mammoth.convertToHtml({ arrayBuffer: base64ToArrayBuffer(file.content) })
    ).then((result) => {
      if (!cancelled) setHtml(result.value)
    }).catch((err: Error) => {
      if (!cancelled) setError(err.message)
    })
    return () => { cancelled = true }
  }, [file.content])

  if (error) return <DocError message={error} />
  if (!html) return <DocLoading label="Loading document…" />

  return (
    <div className="absolute inset-0 overflow-auto bg-white">
      <div className="mx-auto max-w-3xl px-12 py-10">
        <div
          className="docx-preview text-sm leading-relaxed text-zinc-900
            [&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-zinc-900
            [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-900
            [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-zinc-800
            [&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:text-base [&_h4]:font-medium [&_h4]:text-zinc-800
            [&_p]:mb-3 [&_p]:leading-relaxed
            [&_ul]:mb-3 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1
            [&_ol]:mb-3 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:space-y-1
            [&_li]:leading-relaxed
            [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse
            [&_td]:border [&_td]:border-zinc-300 [&_td]:px-3 [&_td]:py-2
            [&_th]:border [&_th]:border-zinc-300 [&_th]:bg-zinc-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium
            [&_a]:text-blue-600 [&_a]:underline
            [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-zinc-600
            [&_img]:my-4 [&_img]:max-w-full [&_img]:rounded
            [&_strong]:font-semibold
            [&_em]:italic"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

function SpreadsheetPreview({ file }: { file: BinaryFile }): React.ReactElement {
  const [html, setHtml] = useState<string | null>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const workbookRef = useRef<ReturnType<typeof import('xlsx').read> | null>(null)

  useEffect(() => {
    if (!file.content) return
    let cancelled = false
    import('xlsx').then((XLSX) => {
      const wb = XLSX.read(base64ToArrayBuffer(file.content), { type: 'array' })
      if (cancelled) return
      workbookRef.current = wb
      setSheets(wb.SheetNames)
      setActiveSheet(0)
      const ws = wb.Sheets[wb.SheetNames[0]]
      setHtml(XLSX.utils.sheet_to_html(ws))
    }).catch((err: Error) => {
      if (!cancelled) setError(err.message)
    })
    return () => { cancelled = true }
  }, [file.content])

  const switchSheet = useCallback((idx: number) => {
    if (!workbookRef.current) return
    import('xlsx').then((XLSX) => {
      const wb = workbookRef.current!
      const ws = wb.Sheets[wb.SheetNames[idx]]
      setHtml(XLSX.utils.sheet_to_html(ws))
      setActiveSheet(idx)
    })
  }, [])

  if (error) return <DocError message={error} />
  if (!html) return <DocLoading label="Loading spreadsheet…" />

  return (
    <div className="flex h-full flex-col bg-white">
      {sheets.length > 1 && (
        <div className="flex gap-0 border-b border-zinc-300 bg-zinc-100">
          {sheets.map((name, i) => (
            <button
              key={name}
              className={`px-3 py-1.5 text-xs ${
                i === activeSheet
                  ? 'bg-white text-zinc-900 border-b-2 border-blue-500'
                  : 'text-zinc-500 hover:bg-zinc-200'
              }`}
              onClick={() => switchSheet(i)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-2">
        <div
          className="spreadsheet-preview text-xs text-black [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-zinc-300 [&_th]:bg-zinc-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

function AudioPreview({ file }: { file: BinaryFile }): React.ReactElement {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const ext = getFileExt(file.name)
  const mime = AUDIO_MIME[ext] ?? 'audio/mpeg'

  useEffect(() => {
    if (!file.content) return
    const blob = new Blob([base64ToArrayBuffer(file.content)], { type: mime })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file.content, mime])

  if (!blobUrl) return <DocLoading label="Loading audio…" />

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-950 p-8">
      <span className="text-sm text-zinc-400">{file.name}</span>
      <audio controls src={blobUrl} className="w-full max-w-md" />
    </div>
  )
}

function DocLoading({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
      {label}
    </div>
  )
}

function DocError({ message }: { message: string }): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
      <FileWarning size={48} strokeWidth={1} />
      <span className="text-sm">Failed to load: {message}</span>
    </div>
  )
}

const OFFICE_PREVIEWS: Record<string, React.ComponentType<{ file: BinaryFile }>> = {
  pdf: PdfPreview,
  docx: DocxPreview,
  xlsx: SpreadsheetPreview,
  xls: SpreadsheetPreview
}

export function isPreviewableBinary(filename: string): boolean {
  const ext = getFileExt(filename)
  return (
    ext === 'svg' ||
    IMAGE_EXTS.has(ext) ||
    ext in OFFICE_PREVIEWS ||
    ext in AUDIO_MIME
  )
}

export function BinaryPreview({ file }: { file: BinaryFile }): React.ReactElement {
  const ext = getFileExt(file.name)

  if (ext === 'svg') {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 p-8">
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(file.content)}`}
          alt={file.name}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }

  if (IMAGE_EXTS.has(ext)) {
    const mime = MIME_MAP[ext] ?? 'image/png'
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 p-8">
        <img
          src={`data:${mime};base64,${file.content}`}
          alt={file.name}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }

  const OfficePreview = OFFICE_PREVIEWS[ext]
  if (OfficePreview && file.content) {
    return <OfficePreview file={file} />
  }

  if (AUDIO_MIME[ext] && file.content) {
    return <AudioPreview file={file} />
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
      <FileWarning size={48} strokeWidth={1} />
      <span className="text-sm">Binary file — cannot display</span>
    </div>
  )
}
