import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { detectLanguage, LANG_BY_EXTENSION, LANG_BY_FILENAME } from './language-detect'

// Monaco registers these outside basic-languages (advanced modes with their own
// workers), plus the built-in fallback that needs no contribution.
const ADVANCED_MODE_IDS = ['typescript', 'javascript', 'json', 'css', 'html', 'plaintext']

/**
 * The installed monaco-editor's real language registry, read from its contribution
 * files. Mapping a file to an id Monaco does not register is silent — the editor
 * just renders unhighlighted text — so this is the guard that makes the maps
 * trustworthy, and it re-checks itself against whatever Monaco version is installed.
 */
function monacoLanguageIds(): Set<string> {
  const base = path.join(process.cwd(), 'node_modules/monaco-editor/esm/vs/basic-languages')
  const ids = new Set(ADVANCED_MODE_IDS)
  for (const dir of fs.readdirSync(base)) {
    const file = path.join(base, dir, `${dir}.contribution.js`)
    if (!fs.existsSync(file)) continue
    const src = fs.readFileSync(file, 'utf-8')
    for (const match of src.matchAll(/id:\s*["']([^"']+)["']/g)) ids.add(match[1])
  }
  return ids
}

describe('language-detect', () => {
  it('reads a non-trivial registry out of the installed Monaco', () => {
    // Guards the guard: a broken extraction would make every assertion below vacuous.
    const ids = monacoLanguageIds()

    expect(ids.size).toBeGreaterThan(50)
    expect(ids).toContain('rust')
  })

  it('maps every extension to a language Monaco actually registers', () => {
    const ids = monacoLanguageIds()
    const unknown = Object.entries(LANG_BY_EXTENSION)
      .filter(([, id]) => !ids.has(id))
      .map(([ext, id]) => `.${ext} -> ${id}`)

    expect(unknown).toEqual([])
  })

  it('maps every filename to a language Monaco actually registers', () => {
    const ids = monacoLanguageIds()
    const unknown = Object.entries(LANG_BY_FILENAME)
      .filter(([, id]) => !ids.has(id))
      .map(([name, id]) => `${name} -> ${id}`)

    expect(unknown).toEqual([])
  })

  it('keeps the languages that were mapped before the expansion', () => {
    // Regression guard: the original 25-entry map, which must not have shifted.
    expect(detectLanguage('a.ts')).toBe('typescript')
    expect(detectLanguage('a.tsx')).toBe('typescript')
    expect(detectLanguage('a.js')).toBe('javascript')
    expect(detectLanguage('a.jsx')).toBe('javascript')
    expect(detectLanguage('a.mjs')).toBe('javascript')
    expect(detectLanguage('a.cjs')).toBe('javascript')
    expect(detectLanguage('a.json')).toBe('json')
    expect(detectLanguage('a.css')).toBe('css')
    expect(detectLanguage('a.scss')).toBe('scss')
    expect(detectLanguage('a.html')).toBe('html')
    expect(detectLanguage('a.md')).toBe('markdown')
    expect(detectLanguage('a.yaml')).toBe('yaml')
    expect(detectLanguage('a.yml')).toBe('yaml')
    expect(detectLanguage('a.py')).toBe('python')
    expect(detectLanguage('a.rs')).toBe('rust')
    expect(detectLanguage('a.go')).toBe('go')
    expect(detectLanguage('a.sql')).toBe('sql')
    expect(detectLanguage('a.sh')).toBe('shell')
    expect(detectLanguage('a.bash')).toBe('shell')
    expect(detectLanguage('a.xml')).toBe('xml')
    expect(detectLanguage('a.svg')).toBe('xml')
    expect(detectLanguage('a.toml')).toBe('ini')
    expect(detectLanguage('a.env')).toBe('ini')
    expect(detectLanguage('a.graphql')).toBe('graphql')
  })

  it('covers the mainstream languages that were missing', () => {
    expect(detectLanguage('main.c')).toBe('c')
    expect(detectLanguage('main.cpp')).toBe('cpp')
    expect(detectLanguage('Program.cs')).toBe('csharp')
    expect(detectLanguage('Main.java')).toBe('java')
    expect(detectLanguage('main.kt')).toBe('kotlin')
    expect(detectLanguage('App.swift')).toBe('swift')
    expect(detectLanguage('app.rb')).toBe('ruby')
    expect(detectLanguage('index.php')).toBe('php')
    expect(detectLanguage('init.lua')).toBe('lua')
    expect(detectLanguage('main.dart')).toBe('dart')
    expect(detectLanguage('Main.scala')).toBe('scala')
    expect(detectLanguage('core.clj')).toBe('clojure')
    expect(detectLanguage('app.ex')).toBe('elixir')
    expect(detectLanguage('script.pl')).toBe('perl')
    expect(detectLanguage('analysis.jl')).toBe('julia')
    expect(detectLanguage('deploy.ps1')).toBe('powershell')
    expect(detectLanguage('main.tf')).toBe('hcl')
    expect(detectLanguage('schema.proto')).toBe('proto')
    expect(detectLanguage('theme.less')).toBe('less')
    expect(detectLanguage('notes.rst')).toBe('restructuredtext')
    expect(detectLanguage('Doc.mdx')).toBe('mdx')
  })

  it('resolves extensionless files by name', () => {
    expect(detectLanguage('Dockerfile')).toBe('dockerfile')
    expect(detectLanguage('dockerfile')).toBe('dockerfile')
    expect(detectLanguage('Gemfile')).toBe('ruby')
    expect(detectLanguage('Rakefile')).toBe('ruby')
    expect(detectLanguage('Vagrantfile')).toBe('ruby')
  })

  it('resolves dotfiles, which have no extension to read', () => {
    expect(detectLanguage('.gitignore')).toBe('ini')
    expect(detectLanguage('.dockerignore')).toBe('ini')
    expect(detectLanguage('.editorconfig')).toBe('ini')
    expect(detectLanguage('.bashrc')).toBe('shell')
    expect(detectLanguage('.zshrc')).toBe('shell')
    expect(detectLanguage('.prettierrc')).toBe('json')
  })

  it('treats a trailing .env segment as the environment, not an extension', () => {
    expect(detectLanguage('.env')).toBe('ini')
    expect(detectLanguage('.env.local')).toBe('ini')
    expect(detectLanguage('.env.production.local')).toBe('ini')
  })

  it('prefers a real extension over the filename table', () => {
    expect(detectLanguage('.eslintrc.json')).toBe('json')
    expect(detectLanguage('gulpfile.ts')).toBe('typescript')
    expect(detectLanguage('Dockerfile.dev')).toBe('plaintext')
  })

  it('reads only the last extension', () => {
    expect(detectLanguage('types.d.ts')).toBe('typescript')
    expect(detectLanguage('docker-compose.prod.yml')).toBe('yaml')
    expect(detectLanguage('page.html.liquid')).toBe('liquid')
  })

  it('ignores directories in a path and is case-insensitive', () => {
    expect(detectLanguage('/Users/x/src/main.RS')).toBe('rust')
    expect(detectLanguage('src/components/App.TSX')).toBe('typescript')
    expect(detectLanguage('/etc/Dockerfile')).toBe('dockerfile')
  })

  it('falls back to plaintext for anything unrecognized', () => {
    expect(detectLanguage('notes.xyz')).toBe('plaintext')
    expect(detectLanguage('README')).toBe('plaintext')
    expect(detectLanguage('archive.tar.gz')).toBe('plaintext')
    expect(detectLanguage('')).toBe('plaintext')
  })
})
