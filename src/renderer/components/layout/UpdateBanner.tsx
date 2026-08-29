import { useEffect } from 'react'
import { useUpdaterStore } from '@/stores/updater-store'
import { X } from 'lucide-react'

export function UpdateBanner(): React.ReactElement | null {
  const state = useUpdaterStore((s) => s.state)
  const percent = useUpdaterStore((s) => s.percent)
  const version = useUpdaterStore((s) => s.version)
  const dismissed = useUpdaterStore((s) => s.dismissed)
  const install = useUpdaterStore((s) => s.install)
  const dismiss = useUpdaterStore((s) => s.dismiss)

  useEffect(() => {
    if (state === 'not-available' || state === 'error') {
      const timer = setTimeout(() => dismiss(), 4000)
      return () => clearTimeout(timer)
    }
  }, [state, dismiss])

  if (dismissed) return null

  if (state === 'checking') {
    return (
      <div className="flex h-7 items-center justify-center gap-2 bg-zinc-700 text-xs text-white">
        <span>Checking for updates...</span>
      </div>
    )
  }

  if (state === 'not-available') {
    return (
      <div className="flex h-7 items-center justify-center gap-2 bg-zinc-700 text-xs text-white">
        <span>You're on the latest version</span>
      </div>
    )
  }

  if (state === 'downloading') {
    return (
      <div className="flex h-7 items-center justify-center gap-2 bg-blue-600 text-xs text-white">
        <span>Downloading update{version ? ` v${version}` : ''}... {percent ?? 0}%</span>
      </div>
    )
  }

  if (state === 'downloaded') {
    return (
      <div className="flex h-7 items-center justify-center gap-2 bg-green-600 text-xs text-white">
        <span>Update{version ? ` v${version}` : ''} ready</span>
        <button
          onClick={install}
          className="rounded bg-white/20 px-2 py-0.5 text-xs font-medium hover:bg-white/30"
        >
          Restart & Update
        </button>
        <button onClick={dismiss} aria-label="Dismiss update notification" title="Dismiss" className="ml-1 hover:bg-white/20 rounded p-0.5">
          <X size={12} />
        </button>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex h-7 items-center justify-center gap-2 bg-red-600 text-xs text-white">
        <span>Update check failed</span>
      </div>
    )
  }

  return null
}
