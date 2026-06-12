import { useEffect, useState } from 'react'
import { Palette, Sliders, Code, Shield, type LucideIcon } from 'lucide-react'
import { PermissionPresetsSection } from '@/components/settings/PermissionPresetsSection'
import { LlmStartupCommandSection } from '@/components/settings/LlmStartupCommandSection'
import { TokenCapSection } from '@/components/settings/TokenCapSection'
import { SoundSection } from '@/components/settings/SoundSection'
import { EditorSection } from '@/components/settings/EditorSection'
import { ThemeSection } from '@/components/settings/ThemeSection'
import { Section, useAccent } from '@/components/settings/SettingsControls'
import { cn } from '@/lib/utils'

type SettingsTab = 'general' | 'editor' | 'theme' | 'permissions'

const TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'General', icon: Sliders },
  { id: 'editor', label: 'Editor', icon: Code },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'permissions', label: 'Permissions', icon: Shield }
]

const TAB_STORAGE_KEY = 'vbcdr-settings-tab'

function loadInitialTab(): SettingsTab {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY)
    if (stored && TABS.some((t) => t.id === stored)) return stored as SettingsTab
  } catch { /* ignore */ }
  return 'general'
}

export function Settings(): React.ReactElement {
  const [tab, setTab] = useState<SettingsTab>(loadInitialTab)
  const accent = useAccent()

  useEffect(() => {
    try { localStorage.setItem(TAB_STORAGE_KEY, tab) } catch { /* ignore */ }
  }, [tab])

  return (
    <div className="min-h-full w-full p-6 text-zinc-200">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-zinc-800">
          {TABS.map((t) => {
            const active = tab === t.id
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors -mb-px',
                  active
                    ? 'text-zinc-100'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                )}
                style={active ? { borderColor: accent, color: accent } : undefined}
              >
                <Icon size={13} />
                {t.label}
              </button>
            )
          })}
        </div>

        {tab === 'general' && (
          <>
            <Section title="LLM">
              <LlmStartupCommandSection />
            </Section>
            <Section title="Limits">
              <TokenCapSection />
            </Section>
            <Section title="Notifications">
              <SoundSection />
            </Section>
          </>
        )}

        {tab === 'editor' && (
          <Section title="Editor">
            <EditorSection />
          </Section>
        )}

        {tab === 'theme' && (
          <Section title="Theme">
            <ThemeSection />
          </Section>
        )}

        {tab === 'permissions' && (
          <Section title="Permissions">
            <PermissionPresetsSection />
          </Section>
        )}
      </div>
    </div>
  )
}
