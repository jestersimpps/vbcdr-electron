import { describe, expect, it } from 'vitest'
import {
  closeWorkflowInstruction,
  conflictResolutionInstruction,
  interpolatePrompt,
  promptSegments,
  prPromptValue,
  type SdlcPromptVariables
} from './llm-instructions'

const VARS: SdlcPromptVariables = {
  title: 'Add auth',
  description: 'Users need to log in',
  branch: 'llm/add-auth',
  worktreePath: '/repo/.worktrees/llm/add-auth',
  projectPath: '/repo',
  diff: '(none)',
  pr: 'open: https://github.com/o/r/pull/7',
  outputs: { planning: '1. do it', 'security-audit': 'no findings' }
}

describe('interpolatePrompt', () => {
  it('substitutes every known variable', () => {
    const out = interpolatePrompt('{{title}} on {{branch}} in {{worktreePath}} ({{projectPath}}): {{output.planning}} / {{diff}}', VARS)
    expect(out).toBe('Add auth on llm/add-auth in /repo/.worktrees/llm/add-auth (/repo): 1. do it / (none)')
  })

  it('substitutes the pull request status', () => {
    expect(interpolatePrompt('PR: {{pr}}', VARS)).toBe('PR: open: https://github.com/o/r/pull/7')
  })

  it('reads an earlier column by its id, dashes included', () => {
    expect(interpolatePrompt('{{output.security-audit}}', VARS)).toBe('no findings')
  })

  it('leaves the output of a column that does not exist verbatim', () => {
    expect(interpolatePrompt('{{output.gone}}', VARS)).toBe('{{output.gone}}')
  })

  it('leaves unknown tokens verbatim so typos stay visible', () => {
    expect(interpolatePrompt('{{title}} {{nope}}', VARS)).toBe('Add auth {{nope}}')
  })

  it('never re-expands a token that arrives inside a value', () => {
    const out = interpolatePrompt('{{description}}', { ...VARS, description: 'mentions {{branch}} literally' })
    expect(out).toBe('mentions {{branch}} literally')
  })

  it('does not touch the single-brace close-workflow syntax', () => {
    expect(interpolatePrompt('push {branch}', VARS)).toBe('push {branch}')
  })
})

describe('prPromptValue', () => {
  it('leads with the state and follows with the link', () => {
    expect(prPromptValue('open', 'https://x/pull/1')).toBe('open: https://x/pull/1')
    expect(prPromptValue('merged', 'https://x/pull/1')).toBe('merged: https://x/pull/1')
    expect(prPromptValue('closed', 'https://x/pull/1')).toBe('closed without merging: https://x/pull/1')
  })

  it('says plainly when there is no pull request or gh cannot tell', () => {
    expect(prPromptValue('none', null)).toMatch(/^none/)
    expect(prPromptValue('unknown', null)).toMatch(/^unknown/)
  })
})

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

describe('promptSegments', () => {
  it('splits known and unknown variables out of the surrounding text', () => {
    expect(promptSegments('Fix {{title}} on {{brnch}}\n{{output.planning}}', ['title', 'output.planning'])).toEqual([
      { text: 'Fix ' },
      { text: '{{title}}', variable: 'known' },
      { text: ' on ' },
      { text: '{{brnch}}', variable: 'unknown' },
      { text: '\n' },
      { text: '{{output.planning}}', variable: 'known' }
    ])
  })

  it('returns plain text untouched and nothing for an empty prompt', () => {
    expect(promptSegments('no tokens {here}', ['title'])).toEqual([{ text: 'no tokens {here}' }])
    expect(promptSegments('', ['title'])).toEqual([])
  })
})
