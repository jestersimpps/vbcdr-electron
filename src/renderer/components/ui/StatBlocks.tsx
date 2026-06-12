interface SectionProps {
  title: string
  children: React.ReactNode
}

export function Section({ title, children }: SectionProps): React.ReactElement {
  return (
    <section className="space-y-3">
      <h2 className="text-meta font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
      {children}
    </section>
  )
}

interface KpiProps {
  icon?: React.ReactNode
  label: string
  value: string
  sub?: string
}

export function Kpi({ icon, label, value, sub }: KpiProps): React.ReactElement {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-zinc-100 truncate" title={value}>{value}</div>
      {sub && <div className="mt-0.5 text-micro text-zinc-500">{sub}</div>}
    </div>
  )
}

interface CardProps {
  title: string
  children: React.ReactNode
  right?: React.ReactNode
}

export function Card({ title, children, right }: CardProps): React.ReactElement {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-zinc-400">{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}
