import type { SdlcAttachment } from '@/models/sdlc'

export function attachmentFromFile(file: File): Promise<SdlcAttachment> {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${file.name}`
    if (!file.type.startsWith('image/')) {
      resolve({ id, name: file.name, kind: 'file', dataUrl: null })
      return
    }
    const reader = new FileReader()
    reader.onload = () =>
      resolve({ id, name: file.name, kind: 'image', dataUrl: String(reader.result) })
    reader.onerror = () => resolve({ id, name: file.name, kind: 'image', dataUrl: null })
    reader.readAsDataURL(file)
  })
}

export async function attachmentsFromFiles(
  files: FileList | File[]
): Promise<SdlcAttachment[]> {
  return Promise.all(Array.from(files).map(attachmentFromFile))
}
