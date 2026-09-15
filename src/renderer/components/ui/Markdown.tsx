import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  content: string
  className?: string
}

const components: Components = {
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-sm font-semibold text-zinc-100 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-200 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-xs font-semibold text-zinc-200 first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  input: ({ checked }) => (
    <input type="checkbox" checked={!!checked} readOnly className="mr-1.5 align-middle accent-indigo-500" />
  ),
  code: ({ className, children }) =>
    className?.includes('language-') ? (
      <code className={cn('font-mono text-micro', className)}>{children}</code>
    ) : (
      <code className="rounded bg-zinc-800 px-1 py-px font-mono text-micro text-zinc-200">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-micro leading-relaxed text-zinc-300 last:mb-0">
      {children}
    </pre>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-sky-400 underline decoration-sky-400/40 hover:decoration-sky-400">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-zinc-700 pl-3 text-zinc-400 last:mb-0">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-zinc-800" />,
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-micro">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-800 bg-zinc-900 px-2 py-1 text-left font-semibold text-zinc-200">{children}</th>
  ),
  td: ({ children }) => <td className="border border-zinc-800 px-2 py-1 align-top">{children}</td>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>
}

export function Markdown({ content, className }: MarkdownProps): React.ReactElement {
  return (
    <div className={cn('text-xs leading-relaxed text-zinc-300', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
