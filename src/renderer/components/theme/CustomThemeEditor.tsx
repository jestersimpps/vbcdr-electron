import { useState, useRef, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { useThemeStore } from '@/stores/theme-store'
import type { CustomThemeColors, CustomThemeUI } from '@/models/custom-theme'
import type { ITheme } from '@xterm/xterm'

type Variant = 'dark' | 'light'

interface ColorSwatchProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
}

function ColorSwatch({ label, value, onChange }: ColorSwatchProps): React.ReactElement {
  const [inputVal, setInputVal] = useState(value)
  const colorRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInputVal(value)
  }, [value])

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const v = e.target.value
    setInputVal(v)
    if (isValidHex(v)) onChange(v)
  }

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const v = e.target.value
    setInputVal(v)
    onChange(v)
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="relative w-6 h-6 rounded cursor-pointer shrink-0 border border-zinc-700"
        style={{ backgroundColor: isValidHex(value) ? value : '#888' }}
        onClick={() => colorRef.current?.click()}
      >
        <input
          ref={colorRef}
          type="color"
          value={isValidHex(value) ? value : '#888888'}
          onChange={handleColorChange}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </div>
      <input
        type="text"
        value={inputVal}
        onChange={handleTextChange}
        maxLength={7}
        className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300 font-mono"
      />
      <span className="text-xs text-zinc-500 w-28 shrink-0">{label}</span>
    </div>
  )
}

const UI_FIELDS: Array<{ key: keyof CustomThemeUI; label: string }> = [
  { key: 'bgPrimary', label: 'Background Primary' },
  { key: 'bgSecondary', label: 'Background Secondary' },
  { key: 'bgElevated', label: 'Background Elevated' },
  { key: 'bgSubtle', label: 'Background Subtle' },
  { key: 'text1', label: 'Text Primary' },
  { key: 'text2', label: 'Text Secondary' },
  { key: 'text3', label: 'Text Muted' },
  { key: 'border1', label: 'Border Primary' },
  { key: 'border2', label: 'Border Secondary' },
]

const TERMINAL_FIELDS: Array<{ key: keyof ITheme; label: string }> = [
  { key: 'background', label: 'Background' },
  { key: 'foreground', label: 'Foreground' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'cursorAccent', label: 'Cursor Accent' },
  { key: 'selectionBackground', label: 'Selection' },
  { key: 'black', label: 'Black' },
  { key: 'red', label: 'Red' },
  { key: 'green', label: 'Green' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'blue', label: 'Blue' },
  { key: 'magenta', label: 'Magenta' },
  { key: 'cyan', label: 'Cyan' },
  { key: 'white', label: 'White' },
  { key: 'brightBlack', label: 'Bright Black' },
  { key: 'brightRed', label: 'Bright Red' },
  { key: 'brightGreen', label: 'Bright Green' },
  { key: 'brightYellow', label: 'Bright Yellow' },
  { key: 'brightBlue', label: 'Bright Blue' },
  { key: 'brightMagenta', label: 'Bright Magenta' },
  { key: 'brightCyan', label: 'Bright Cyan' },
  { key: 'brightWhite', label: 'Bright White' },
]

interface CustomThemeEditorProps {
  onClose: () => void
}

export function CustomThemeEditor({ onClose }: CustomThemeEditorProps): React.ReactElement {
  const customDark = useThemeStore((s) => s.customDark)
  const customLight = useThemeStore((s) => s.customLight)
  const setCustomTheme = useThemeStore((s) => s.setCustomTheme)
  const currentVariant = useThemeStore((s) => s.variant)

  const [editorVariant, setEditorVariant] = useState<Variant>(currentVariant)

  const colors: CustomThemeColors = editorVariant === 'dark' ? customDark : customLight

  const updateUI = useCallback(
    (key: keyof CustomThemeUI, value: string) => {
      setCustomTheme(editorVariant, {
        ...colors,
        ui: { ...colors.ui, [key]: value },
      })
    },
    [colors, editorVariant, setCustomTheme]
  )

  const updateTerminal = useCallback(
    (key: keyof ITheme, value: string) => {
      setCustomTheme(editorVariant, {
        ...colors,
        terminal: { ...colors.terminal, [key]: value },
      })
    },
    [colors, editorVariant, setCustomTheme]
  )

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-[420px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-sm font-medium text-zinc-200">Custom Theme</span>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex border-b border-zinc-800">
          {(['dark', 'light'] as Variant[]).map((v) => (
            <button
              key={v}
              onClick={() => setEditorVariant(v)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                editorVariant === v
                  ? 'text-zinc-200 border-b-2 border-blue-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {v === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-5">
          <section>
            <div className="text-xs font-medium text-zinc-400 mb-3">UI Colors</div>
            <div className="space-y-2">
              {UI_FIELDS.map(({ key, label }) => (
                <ColorSwatch
                  key={key}
                  label={label}
                  value={colors.ui[key]}
                  onChange={(v) => updateUI(key, v)}
                />
              ))}
            </div>
          </section>

          <section>
            <div className="text-xs font-medium text-zinc-400 mb-3">Terminal Colors</div>
            <div className="space-y-2">
              {TERMINAL_FIELDS.map(({ key, label }) => (
                <ColorSwatch
                  key={key}
                  label={label}
                  value={(colors.terminal[key] as string) ?? '#000000'}
                  onChange={(v) => updateTerminal(key, v)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
