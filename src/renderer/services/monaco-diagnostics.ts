import type { Monaco } from '@monaco-editor/react'

// Kept so that re-enabling validation does not start from scratch: these are the
// codes that fired constantly under Monaco's single global program.
const diagnosticCodesToIgnore = [
  2306, 2503, 2580, 2611, 2683, 2686, 2792,
  6133, 6196, 7016, 7026, 7031, 8006
]

// Every Monaco language service that ships its own diagnostic provider. Unregistering
// the provider (rather than only setting `validate: false`) means the worker computes
// nothing at all, so this saves compute as well as hiding the squiggles.
const DIAGNOSTIC_PROVIDER_DEFAULTS = [
  ['json', 'jsonDefaults'],
  ['css', 'cssDefaults'],
  ['css', 'scssDefaults'],
  ['css', 'lessDefaults'],
  ['html', 'htmlDefaults'],
  ['html', 'handlebarDefaults'],
  ['html', 'razorDefaults']
] as const

interface ModeConfigurableDefaults {
  readonly modeConfiguration?: Record<string, unknown>
  setModeConfiguration?(config: Record<string, unknown>): void
}

/**
 * All error visualization is off: no squiggles, no overview-ruler marks, no marker
 * hovers, in any language.
 *
 * Three layers, because markers reach the screen by three different routes:
 *  1. TS/JS diagnostics are silenced at the worker, so nothing is computed.
 *  2. The JSON/CSS/HTML services each own a separate diagnostic provider (the TS
 *     options above do not reach them), unregistered below.
 *  3. The editors set `renderValidationDecorations: 'off'`, so a marker from any
 *     source not covered above still renders nothing.
 *
 * Idempotent, and called from both MonacoAnchor and every editor's `beforeMount`,
 * because whichever of them wins the `loader.init()` race must get there before
 * the first model is created.
 */
export function applyDiagnosticsOptions(monaco: Monaco): void {
  const diagnosticsOptions = {
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
    diagnosticCodesToIgnore
  }
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)

  // Guarded: these contributions ship with the full Monaco bundle but are absent from
  // leaner builds, and a throw here would leave the editor unmounted.
  const languages = monaco.languages as unknown as
    Record<string, Record<string, ModeConfigurableDefaults | undefined> | undefined>
  for (const [namespace, defaultsKey] of DIAGNOSTIC_PROVIDER_DEFAULTS) {
    const defaults = languages[namespace]?.[defaultsKey]
    if (!defaults?.setModeConfiguration) continue
    if (defaults.modeConfiguration?.diagnostics === false) continue
    defaults.setModeConfiguration({ ...defaults.modeConfiguration, diagnostics: false })
  }
}
