import { SkillsPanel } from '@/components/skills/SkillsPanel'

export function SkillsPage(): React.ReactElement {
  return (
    <div className="h-full bg-zinc-950">
      <SkillsPanel scope="global" />
    </div>
  )
}
