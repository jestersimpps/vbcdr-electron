/**
 * Maps a filename to a Monaco language id for syntax highlighting.
 *
 * Every id below is one Monaco actually registers, and extension lists follow
 * Monaco's own contribution metadata rather than being invented here.
 * `language-detect.test.ts` reads the installed monaco-editor's contribution
 * files and fails on any id this file names that Monaco does not register — so a
 * typo, or a language dropped by a Monaco upgrade, surfaces as a test failure
 * instead of silently falling back to unhighlighted plaintext.
 *
 * Deliberate approximations, where Monaco ships no dedicated language:
 *   .toml, ignore files, .npmrc  -> ini     (comments + key/value read correctly)
 *   .vue, .svelte, .astro        -> html    (template markup; script blocks suffer)
 *   .sass                        -> scss
 *   .ml, .mli                    -> fsharp  (Monaco's own mapping for OCaml)
 *   .s, .asm                     -> mips    (generic assembly)
 *
 * Known gaps, left as plaintext on purpose rather than mis-highlighted: Makefile,
 * Groovy/.gradle, Haskell, Erlang, Zig, Nix, Prisma, and diff/patch files.
 */

// Exact basename match, lowercased. Checked before extensions, so extensionless
// files (Dockerfile, Gemfile) and dotfiles (.gitignore) resolve at all.
export const LANG_BY_FILENAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',

  gemfile: 'ruby',
  rakefile: 'ruby',
  podfile: 'ruby',
  brewfile: 'ruby',
  vagrantfile: 'ruby',
  fastfile: 'ruby',
  appfile: 'ruby',
  guardfile: 'ruby',
  capfile: 'ruby',

  jakefile: 'javascript',
  gulpfile: 'javascript',
  gruntfile: 'javascript',

  '.babelrc': 'json',
  '.eslintrc': 'json',
  '.prettierrc': 'json',
  '.stylelintrc': 'json',
  '.swcrc': 'json',

  '.bashrc': 'shell',
  '.bash_profile': 'shell',
  '.bash_aliases': 'shell',
  '.zshrc': 'shell',
  '.zprofile': 'shell',
  '.zshenv': 'shell',
  '.kshrc': 'shell',
  '.profile': 'shell',

  config: 'ini',
  '.gitattributes': 'ini',
  '.gitconfig': 'ini',
  '.editorconfig': 'ini',
  '.npmrc': 'ini',
  '.yarnrc': 'ini',
  '.gitignore': 'ini',
  '.dockerignore': 'ini',
  '.npmignore': 'ini',
  '.eslintignore': 'ini',
  '.prettierignore': 'ini'
}

export const LANG_BY_EXTENSION: Record<string, string> = {
  // --- web / scripting ---
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  es6: 'javascript',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  shtml: 'html',
  vue: 'html',
  svelte: 'html',
  astro: 'html',
  liquid: 'liquid',
  hbs: 'handlebars',
  handlebars: 'handlebars',
  pug: 'pug',
  jade: 'pug',
  twig: 'twig',
  cshtml: 'razor',
  coffee: 'coffeescript',

  // --- docs / markup / data ---
  md: 'markdown',
  markdown: 'markdown',
  mdown: 'markdown',
  mkd: 'markdown',
  mkdn: 'markdown',
  mdx: 'mdx',
  rst: 'restructuredtext',
  xml: 'xml',
  xsd: 'xml',
  dtd: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  svg: 'xml',
  svgz: 'xml',
  xaml: 'xml',
  plist: 'xml',
  csproj: 'xml',
  props: 'xml',
  targets: 'xml',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'proto',

  // --- compiled / systems ---
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  ino: 'cpp',
  cs: 'csharp',
  csx: 'csharp',
  cake: 'csharp',
  java: 'java',
  jav: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  go: 'go',
  rs: 'rust',
  rlib: 'rust',
  dart: 'dart',
  scala: 'scala',
  sc: 'scala',
  sbt: 'scala',
  m: 'objective-c',
  mm: 'objective-c',
  vb: 'vb',
  pas: 'pascal',
  p: 'pascal',
  pp: 'pascal',
  sol: 'sol',
  wgsl: 'wgsl',
  sv: 'systemverilog',
  svh: 'systemverilog',
  v: 'verilog',
  vh: 'verilog',
  st: 'st',
  s: 'mips',
  asm: 'mips',

  // --- dynamic / functional ---
  py: 'python',
  pyw: 'python',
  pyi: 'python',
  rpy: 'python',
  gyp: 'python',
  gypi: 'python',
  rb: 'ruby',
  rbx: 'ruby',
  rjs: 'ruby',
  gemspec: 'ruby',
  php: 'php',
  php4: 'php',
  php5: 'php',
  phtml: 'php',
  ctp: 'php',
  pl: 'perl',
  pm: 'perl',
  lua: 'lua',
  r: 'r',
  rmd: 'r',
  rprofile: 'r',
  jl: 'julia',
  ex: 'elixir',
  exs: 'elixir',
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  edn: 'clojure',
  fs: 'fsharp',
  fsi: 'fsharp',
  fsx: 'fsharp',
  fsscript: 'fsharp',
  ml: 'fsharp',
  mli: 'fsharp',
  scm: 'scheme',
  ss: 'scheme',
  sch: 'scheme',
  rkt: 'scheme',
  tcl: 'tcl',
  qs: 'qsharp',

  // --- shell / config / infra ---
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ksh: 'shell',
  ash: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  psd1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  dockerfile: 'dockerfile',
  tf: 'hcl',
  tfvars: 'hcl',
  hcl: 'hcl',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  properties: 'ini',
  gitconfig: 'ini',
  editorconfig: 'ini',
  env: 'ini',
  sql: 'sql',
  azcli: 'azcli',
  redis: 'redis',

  // --- niche, but unambiguous and free (Monaco already ships the tokenizer) ---
  abap: 'abap',
  cls: 'apex',
  bicep: 'bicep',
  cypher: 'cypher',
  cyp: 'cypher',
  csp: 'csp',
  dax: 'msdax',
  msdax: 'msdax',
  ecl: 'ecl',
  flow: 'flow9',
  ftl: 'freemarker2',
  ftlh: 'freemarker2',
  ftlx: 'freemarker2',
  mligo: 'cameligo',
  ligo: 'pascaligo',
  lex: 'lexon',
  m3: 'm3',
  i3: 'm3',
  pq: 'powerquery',
  pqm: 'powerquery',
  dats: 'postiats',
  sats: 'postiats',
  hats: 'postiats',
  aes: 'aes',
  rq: 'sparql',
  tsp: 'typespec',
  pla: 'pla',
  sb: 'sb'
}

export function detectLanguage(filename: string): string {
  const basename = (filename.split('/').pop() ?? '').toLowerCase()
  if (!basename) return 'plaintext'

  const byName = LANG_BY_FILENAME[basename]
  if (byName) return byName

  // .env, .env.local, .env.production.local — the trailing segment is the
  // environment name, not an extension, so the generic lookup would miss it.
  if (basename === '.env' || basename.startsWith('.env.')) return 'ini'

  // A dotfile with no further dots ('.gitignore') has no extension to read.
  const lastDot = basename.lastIndexOf('.')
  if (lastDot <= 0) return 'plaintext'

  return LANG_BY_EXTENSION[basename.slice(lastDot + 1)] ?? 'plaintext'
}
