const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'html',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'python',
  rs: 'rust',
  go: 'go',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  xml: 'xml',
  svg: 'xml',
  toml: 'ini',
  env: 'ini',
  graphql: 'graphql'
}

export function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}
