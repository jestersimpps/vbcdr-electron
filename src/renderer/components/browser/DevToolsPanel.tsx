import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useBrowserStore } from '@/stores/browser-store'
import { ConsolePanel } from './ConsolePanel'
import { NetworkPanel } from './NetworkPanel'
import { PasswordsPanel } from './PasswordsPanel'
import { DevTerminalsPanel } from './DevTerminalsPanel'
import { cn } from '@/lib/utils'

export function DevToolsPanel(): React.ReactElement {
  const devToolsTab = useBrowserStore((s) => s.devToolsTab)
  const setDevToolsTab = useBrowserStore((s) => s.setDevToolsTab)

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <PanelGroup direction="vertical">
        <Panel defaultSize={50} minSize={20}>
          <div className="flex h-full flex-col">
            <div className="flex border-b border-zinc-800">
              <button
                onClick={() => setDevToolsTab('console')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  devToolsTab === 'console'
                    ? 'border-b-2 border-zinc-400 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-400'
                )}
              >
                Console
              </button>
              <button
                onClick={() => setDevToolsTab('network')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  devToolsTab === 'network'
                    ? 'border-b-2 border-zinc-400 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-400'
                )}
              >
                Network
              </button>
              <button
                onClick={() => setDevToolsTab('passwords')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  devToolsTab === 'passwords'
                    ? 'border-b-2 border-zinc-400 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-400'
                )}
              >
                Passwords
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {devToolsTab === 'console' && <ConsolePanel />}
              {devToolsTab === 'network' && <NetworkPanel />}
              {devToolsTab === 'passwords' && <PasswordsPanel />}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="h-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
        <Panel defaultSize={50} minSize={20}>
          <DevTerminalsPanel />
        </Panel>
      </PanelGroup>
    </div>
  )
}
