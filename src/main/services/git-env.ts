/**
 * Git invoked from the app must never block on an interactive credential prompt —
 * there is no terminal attached to answer it, so the child would hang until timeout.
 * Disabling the prompt and clearing `credential.helper` keeps every read-only git
 * call non-interactive.
 */
export const GIT_NON_INTERACTIVE_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'credential.helper',
  GIT_CONFIG_VALUE_0: ''
} as const

export function gitEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ...GIT_NON_INTERACTIVE_ENV }
}
