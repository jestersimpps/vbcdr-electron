import { Component, type ReactNode } from 'react'

const RECOVERABLE_PATTERNS = [
  'InstantiationService has been disposed',
  'TextModel got disposed',
  'Cannot read properties of null',
  'WebGL context'
]

function isRecoverable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return RECOVERABLE_PATTERNS.some((p) => msg.includes(p))
}

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onRecover?: () => void
}

interface State {
  hasError: boolean
  remountKey: number
}

export class MonacoErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, remountKey: 0 }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    if (isRecoverable(error)) {
      return { hasError: true }
    }
    return {}
  }

  componentDidCatch(error: unknown): void {
    if (!isRecoverable(error)) return
    queueMicrotask(() => {
      this.setState((s) => ({ hasError: false, remountKey: s.remountKey + 1 }))
      this.props.onRecover?.()
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-600">
            Recovering editor…
          </div>
        )
      )
    }
    return <div key={this.state.remountKey} className="h-full w-full">{this.props.children}</div>
  }
}
