import { useEffect, useRef, useState } from 'react'
import { Copy, ExternalLink, FilePlus, Files, FolderPlus, Pencil, Trash2 } from 'lucide-react'

export interface ContextMenuTarget {
  x: number
  y: number
  path: string
  name: string
  isDirectory: boolean
}

export function FileContextMenu({
  menu,
  onClose,
  onDelete,
  onNewFile,
  onNewFolder,
  onRename,
  onDuplicate
}: {
  menu: ContextMenuTarget
  onClose: () => void
  onDelete: (path: string, name: string, isDirectory: boolean) => void
  onNewFile: (parentPath: string) => void
  onNewFolder: (parentPath: string) => void
  onRename: (path: string, name: string) => void
  onDuplicate: (path: string) => void
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const handleCopyPath = (): void => {
    navigator.clipboard.writeText(menu.path)
    onClose()
  }

  const handleShowInFinder = (): void => {
    window.api.fs.showInFolder(menu.path)
    onClose()
  }

  const parentPath = menu.isDirectory ? menu.path : menu.path.replace(/\/[^/]+$/, '')

  const btnClass = 'flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800'

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
      style={{ left: menu.x, top: menu.y }}
    >
      <button onClick={() => { onNewFile(parentPath); onClose() }} className={btnClass}>
        <FilePlus size={12} />
        New file
      </button>
      <button onClick={() => { onNewFolder(parentPath); onClose() }} className={btnClass}>
        <FolderPlus size={12} />
        New folder
      </button>
      <div className="my-1 border-t border-zinc-800" />
      <button onClick={() => { onRename(menu.path, menu.name); onClose() }} className={btnClass}>
        <Pencil size={12} />
        Rename
      </button>
      {!menu.isDirectory && (
        <button onClick={() => { onDuplicate(menu.path); onClose() }} className={btnClass}>
          <Files size={12} />
          Duplicate
        </button>
      )}
      <button onClick={handleCopyPath} className={btnClass}>
        <Copy size={12} />
        Copy path
      </button>
      <button onClick={handleShowInFinder} className={btnClass}>
        <ExternalLink size={12} />
        Show in Finder
      </button>
      <div className="my-1 border-t border-zinc-800" />
      <button
        onClick={() => { onDelete(menu.path, menu.name, menu.isDirectory); onClose() }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-800"
      >
        <Trash2 size={12} />
        Delete
      </button>
    </div>
  )
}

export function DeleteConfirm({
  name,
  isDirectory,
  onConfirm,
  onCancel
}: {
  name: string
  isDirectory: boolean
  onConfirm: () => void
  onCancel: () => void
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel, onConfirm])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div ref={ref} className="w-80 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
        <p className="text-sm text-zinc-200">
          Delete <span className="font-semibold">{name}</span>{isDirectory ? ' and all its contents' : ''}?
        </p>
        <p className="mt-1 text-xs text-zinc-500">This action cannot be undone</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-500"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export function NameDialog({
  title,
  initialValue,
  submitLabel,
  onSubmit,
  onCancel
}: {
  title: string
  initialValue?: string
  submitLabel: string
  onSubmit: (value: string) => void
  onCancel: () => void
}): React.ReactElement {
  const [value, setValue] = useState(initialValue ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (initialValue) {
      const dotIdx = initialValue.lastIndexOf('.')
      inputRef.current?.setSelectionRange(0, dotIdx > 0 ? dotIdx : initialValue.length)
    }
  }, [initialValue])

  const handleSubmit = (): void => {
    if (value.trim()) onSubmit(value.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
        <p className="mb-3 text-sm text-zinc-200">{title}</p>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
            if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          }}
          className="w-full rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none ring-1 ring-zinc-600 focus:ring-blue-500"
          spellCheck={false}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
