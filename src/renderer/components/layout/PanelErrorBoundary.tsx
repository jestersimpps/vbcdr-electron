import { Component, type ReactNode } from 'react'

interface Props {
  label: string
  children: ReactNode
}

interface State {
  error: Error | null
  remountKey: number
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null, remountKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    console.error(`[PanelErrorBoundary:${this.props.label}]`, error, info.componentStack)
  }

  private handleReload = (): void => {
    this.setState((s) => ({ error: null, remountKey: s.remountKey + 1 }))
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-sm font-medium text-zinc-300">{this.props.label} crashed</div>
          <div className="max-w-md text-xs text-zinc-500">{this.state.error.message}</div>
          <button
            onClick={this.handleReload}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Reload panel
          </button>
        </div>
      )
    }
    return <div key={this.state.remountKey} className="h-full w-full">{this.props.children}</div>
  }
}
