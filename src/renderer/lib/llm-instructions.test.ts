import { describe, expect, it } from 'vitest'
import { closeWorkflowInstruction, conflictResolutionInstruction } from './llm-instructions'

describe('llm-instructions', () => {
  it('lists every conflicted file in the resolution instruction', () => {
    const text = conflictResolutionInstruction(['a.ts', 'b/c.ts'])
    expect(text).toContain('a.ts, b/c.ts')
    expect(text).toContain('git add')
  })

  it('substitutes every {branch} placeholder', () => {
    expect(closeWorkflowInstruction('push {branch}, then PR {branch}', 'llm/x')).toBe('push llm/x, then PR llm/x')
  })
})
