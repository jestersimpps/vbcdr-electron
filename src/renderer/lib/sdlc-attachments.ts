import type { SdlcAttachment } from '@/models/sdlc'
import { SDLC_SENTINEL_DIR } from '@/models/sdlc-prompts'

/** Bytes are kept for any file up to this size so non-image attachments can reach the agent too. */
const MAX_INLINE_BYTES = 5 * 1024 * 1024

export const ATTACHMENTS_DIR = `${SDLC_SENTINEL_DIR}/attachments`

export function attachmentFromFile(file: File): Promise<SdlcAttachment> {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${file.name}`
    const kind = file.type.startsWith('image/') ? 'image' : 'file'
    if (file.size > MAX_INLINE_BYTES) {
      resolve({ id, name: file.name, kind, dataUrl: null })
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve({ id, name: file.name, kind, dataUrl: String(reader.result) })
    reader.onerror = () => resolve({ id, name: file.name, kind, dataUrl: null })
    reader.readAsDataURL(file)
  })
}

export async function attachmentsFromFiles(
  files: FileList | File[]
): Promise<SdlcAttachment[]> {
  return Promise.all(Array.from(files).map(attachmentFromFile))
}

function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  return base.replace(/[^\w.\-]+/g, '_') || 'attachment'
}

function attachmentRelativePath(attachment: SdlcAttachment): string {
  return `${ATTACHMENTS_DIR}/${safeFileName(attachment.name)}`
}

export function attachmentPathInWorktree(worktreePath: string, attachment: SdlcAttachment): string {
  return `${worktreePath}/${attachmentRelativePath(attachment)}`
}

/** Writes every attachment that still has bytes into the worktree; returns their worktree-relative paths. */
export async function writeAttachmentsToWorktree(
  worktreePath: string,
  attachments: SdlcAttachment[]
): Promise<string[]> {
  const written: string[] = []
  for (const attachment of attachments) {
    if (!attachment.dataUrl) continue
    const relative = attachmentRelativePath(attachment)
    await window.api.fs.writeDataUrl(`${worktreePath}/${relative}`, attachment.dataUrl)
    written.push(relative)
  }
  return written
}

export function attachmentsInstruction(paths: string[]): string {
  if (paths.length === 0) return ''
  const list = paths.map((p) => `- ${p}`).join('\n')
  return `Attachments for this ticket (read them from the worktree before you start):\n${list}`
}
