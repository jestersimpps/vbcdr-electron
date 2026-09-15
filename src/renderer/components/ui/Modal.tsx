import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-6xl'
}

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: ModalSize
  closeOnBackdropClick?: boolean
  closeOnEscape?: boolean
  preventClose?: boolean
  /** Set when the content manages its own internal scroll regions instead of scrolling as one block. */
  bodyScroll?: boolean
  /** Extra content in the header, between the title and the close button. */
  headerExtra?: React.ReactNode
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdropClick = true,
  closeOnEscape = true,
  preventClose = false,
  bodyScroll = true,
  headerExtra
}: ModalProps): React.ReactElement | null {
  const canClose = !preventClose

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && canClose) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return (): void => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, closeOnEscape, canClose, onClose])

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (closeOnBackdropClick && canClose && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'mx-4 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl',
          SIZE_CLASS[size],
          !bodyScroll && 'h-[85vh]'
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">{title}</span>
          {headerExtra}
          <button
            onClick={onClose}
            disabled={!canClose}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className={cn('min-h-0 flex-1 px-4 py-3', bodyScroll ? 'overflow-y-auto' : 'overflow-hidden')}>
          {children}
        </div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
