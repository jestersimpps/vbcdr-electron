import { describe, it, expect } from 'vitest'
import { renderLine, ProjectVoice, RENAME_AFTER_QUIET_MS } from './companion-attribution'

const LINE = { bare: 'shelling out', named: 'I am shelling out in {project}' }

function fixedClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

describe('renderLine', () => {
  it('fills the slot with the project name', () => {
    expect(renderLine(LINE, 'vibecoder')).toBe('I am shelling out in vibecoder')
  })

  it('uses the bare sentence when there is no project', () => {
    expect(renderLine(LINE, null)).toBe('shelling out')
  })

  it('treats a blank name as no project', () => {
    expect(renderLine(LINE, '   ')).toBe('shelling out')
  })

  it('fills every occurrence of the slot', () => {
    const line = { bare: 'done', named: '{project} is done, and {project} is quiet' }
    expect(renderLine(line, 'vbcdr')).toBe('vbcdr is done, and vbcdr is quiet')
  })

  it('keeps a named sentence that carries no slot', () => {
    const line = { bare: 'all green', named: 'the suite is clean' }
    expect(renderLine(line, 'vibecoder')).toBe('the suite is clean')
  })
})

describe('ProjectVoice', () => {
  it('names the project the first time it speaks', () => {
    const voice = new ProjectVoice(fixedClock().now)
    expect(voice.nameFor('vibecoder')).toBe('vibecoder')
  })

  it('stays bare while the same project keeps talking', () => {
    const clock = fixedClock()
    const voice = new ProjectVoice(clock.now)
    voice.nameFor('vibecoder')
    clock.advance(1000)
    expect(voice.nameFor('vibecoder')).toBeNull()
  })

  it('names it again when a different project speaks', () => {
    const clock = fixedClock()
    const voice = new ProjectVoice(clock.now)
    voice.nameFor('vibecoder')
    clock.advance(1000)
    expect(voice.nameFor('vbcdr')).toBe('vbcdr')
  })

  it('names it again after a quiet gap', () => {
    const clock = fixedClock()
    const voice = new ProjectVoice(clock.now)
    voice.nameFor('vibecoder')
    clock.advance(RENAME_AFTER_QUIET_MS)
    expect(voice.nameFor('vibecoder')).toBe('vibecoder')
  })

  it('returns null when there is no project to name', () => {
    const voice = new ProjectVoice(fixedClock().now)
    expect(voice.nameFor(null)).toBeNull()
  })

  it('names the next project after an unattributed line', () => {
    const clock = fixedClock()
    const voice = new ProjectVoice(clock.now)
    voice.nameFor('vibecoder')
    clock.advance(100)
    voice.nameFor(null)
    clock.advance(100)
    expect(voice.nameFor('vibecoder')).toBe('vibecoder')
  })

  it('names it again after a reset', () => {
    const clock = fixedClock()
    const voice = new ProjectVoice(clock.now)
    voice.nameFor('vibecoder')
    voice.reset()
    expect(voice.nameFor('vibecoder')).toBe('vibecoder')
  })
})
