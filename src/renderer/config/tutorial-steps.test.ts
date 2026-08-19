import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TUTORIAL_STEPS } from './tutorial-steps'

describe('tutorial-steps', () => {
  let events: CustomEvent[]
  let listener: (e: Event) => void

  beforeEach(() => {
    events = []
    listener = (e: Event) => events.push(e as CustomEvent)
    window.addEventListener('palette:open', listener)
  })

  afterEach(() => {
    window.removeEventListener('palette:open', listener)
    vi.restoreAllMocks()
  })

  it('points every target at a data-tour attribute that exists in the app', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')

    const defined = new Set<string>()
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.tsx')) {
          const src = fs.readFileSync(full, 'utf8')
          const re = /data-tour="([^"]+)"/g
          let m: RegExpExecArray | null
          while ((m = re.exec(src)) !== null) defined.add(m[1])
        }
      }
    }
    walk(path.resolve(__dirname, '..'))

    const referenced = TUTORIAL_STEPS.flatMap((step) =>
      (step.target ?? '')
        .split(',')
        .map((sel) => sel.trim().match(/data-tour="([^"]+)"/)?.[1])
        .filter((name): name is string => Boolean(name))
    )

    expect(referenced.length).toBeGreaterThan(0)
    for (const name of referenced) {
      expect(defined, `data-tour="${name}" is targeted but never rendered`).toContain(name)
    }
  })

  it('has unique step ids', () => {
    const ids = TUTORIAL_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every step a title and body', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.body.length).toBeGreaterThan(0)
    }
  })

  it('keeps a usable tour when no project is open', () => {
    const withoutProject = TUTORIAL_STEPS.filter((s) => !s.requiresProject)
    expect(withoutProject.length).toBeGreaterThan(5)
    expect(withoutProject.some((s) => s.id === 'no-project')).toBe(true)
    expect(withoutProject.some((s) => s.id === 'settings')).toBe(true)
  })

  it('hides the no-project notice once a project is open', () => {
    const withProject = TUTORIAL_STEPS.filter((s) => !s.onlyWithoutProject)
    expect(withProject.some((s) => s.id === 'no-project')).toBe(false)
    expect(withProject.some((s) => s.id === 'editor')).toBe(true)
  })

  it('marks every workspace step as needing a project', () => {
    const workspaceIds = [
      'workspace-tabs',
      'terminals',
      'terminal-tools',
      'editor',
      'filetree-tools',
      'diff',
      'git-panel',
      'commit',
      'project-claude',
      'project-skills',
      'open-folder'
    ]
    for (const id of workspaceIds) {
      const step = TUTORIAL_STEPS.find((s) => s.id === id)
      expect(step, `missing step ${id}`).toBeDefined()
      expect(step?.requiresProject, `${id} should require a project`).toBe(true)
    }
  })

  it('never marks a step as both requiring and forbidding a project', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.requiresProject && step.onlyWithoutProject).toBeFalsy()
    }
  })

  const paletteStep = TUTORIAL_STEPS.find((s) => s.id === 'palette')

  it('opens the palette when the palette step runs', () => {
    paletteStep?.action?.()
    expect(events).toHaveLength(1)
    expect(events[0].detail).toEqual({ mode: 'all', open: true })
  })

  it('closes the palette when the palette step is left', () => {
    paletteStep?.cleanup?.()
    expect(events).toHaveLength(1)
    expect(events[0].detail).toEqual({ mode: 'all', open: false })
  })
})
