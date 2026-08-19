import { describe, it, expect, beforeEach } from 'vitest'
import { useTutorialStore, hasSeenTutorial } from './tutorial-store'

describe('tutorial-store', () => {
  beforeEach(() => {
    localStorage.clear()
    useTutorialStore.setState({ open: false, stepIndex: 0 })
  })

  it('opens at the first step', () => {
    useTutorialStore.getState().startTutorial()
    expect(useTutorialStore.getState().open).toBe(true)
    expect(useTutorialStore.getState().stepIndex).toBe(0)
  })

  it('restarts from the first step when reopened later', () => {
    useTutorialStore.getState().startTutorial()
    useTutorialStore.getState().nextStep(5)
    useTutorialStore.getState().closeTutorial()
    useTutorialStore.getState().startTutorial()
    expect(useTutorialStore.getState().stepIndex).toBe(0)
  })

  it('advances and goes back within bounds', () => {
    useTutorialStore.getState().startTutorial()
    useTutorialStore.getState().nextStep(3)
    expect(useTutorialStore.getState().stepIndex).toBe(1)
    useTutorialStore.getState().prevStep()
    expect(useTutorialStore.getState().stepIndex).toBe(0)
    useTutorialStore.getState().prevStep()
    expect(useTutorialStore.getState().stepIndex).toBe(0)
  })

  it('closes when advancing past the last step', () => {
    useTutorialStore.getState().startTutorial()
    useTutorialStore.getState().nextStep(2)
    useTutorialStore.getState().nextStep(2)
    expect(useTutorialStore.getState().open).toBe(false)
  })

  it('marks the tutorial seen once closed', () => {
    expect(hasSeenTutorial()).toBe(false)
    useTutorialStore.getState().startTutorial()
    useTutorialStore.getState().closeTutorial()
    expect(hasSeenTutorial()).toBe(true)
  })

  it('never lets goToStep go negative', () => {
    useTutorialStore.getState().goToStep(-3)
    expect(useTutorialStore.getState().stepIndex).toBe(0)
  })
})
