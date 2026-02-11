import { useEffect } from 'react'
import { AppLayoutGrid } from '@/components/layout/AppLayoutGrid'
import { useThemeStore } from '@/stores/theme-store'
import { applyThemeToAll } from '@/components/terminal/TerminalInstance'

export function App(): React.ReactElement {
  const themeName = useThemeStore((s) => s.themeName)
  const variant = useThemeStore((s) => s.variant)

  useEffect(() => {
    const classes = Array.from(document.documentElement.classList)
    classes.forEach((cls) => {
      if (cls.endsWith('-dark') || cls.endsWith('-light') || ['dark', 'light', 'psychedelic'].includes(cls)) {
        document.documentElement.classList.remove(cls)
      }
    })

    const fullThemeId = `${themeName}-${variant}`
    document.documentElement.classList.add(fullThemeId)
    document.documentElement.classList.add(variant)

    applyThemeToAll(fullThemeId)
  }, [themeName, variant])

  return <AppLayoutGrid />
}
