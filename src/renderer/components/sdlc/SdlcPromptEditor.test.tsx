import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StagePromptField } from './SdlcPromptEditor'
import { threeStageFlow } from '@/models/sdlc-flow.fixtures'

const COLUMNS = threeStageFlow()
const REVIEW = COLUMNS.find((c) => c.id === 'review')!

function renderField(text: string, mode: 'global' | 'project' = 'global', overridden = true): void {
  render(
    <StagePromptField
      column={REVIEW}
      columns={COLUMNS}
      resolution={{ text, overridden }}
      mode={mode}
      onChange={vi.fn()}
      onReset={vi.fn()}
      accent="#60a5fa"
    />
  )
}

function marks(kind: 'known' | 'unknown'): string[] {
  return Array.from(screen.getByTestId('prompt-highlight').querySelectorAll(`[data-variable="${kind}"]`)).map(
    (el) => el.textContent ?? ''
  )
}

afterEach(cleanup)

describe('StagePromptField', () => {
  it('highlights the variables the column can read and flags the rest', () => {
    renderField('Review {{branch}} after {{output.planning}}, not {{output.review}} or {{brnch}}')
    expect(marks('known')).toEqual(['{{branch}}', '{{output.planning}}'])
    expect(marks('unknown')).toEqual(['{{output.review}}', '{{brnch}}'])
  })

  it('re-highlights as the prompt is edited', () => {
    renderField('plain')
    fireEvent.change(screen.getByLabelText('Prompt for review'), { target: { value: 'see {{diff}}' } })
    expect(marks('known')).toEqual(['{{diff}}'])
  })

  it('highlights the inherited prompt shown while the field is empty', () => {
    renderField('Global {{title}}', 'project', false)
    expect((screen.getByLabelText('Prompt for review') as HTMLTextAreaElement).value).toBe('')
    expect(marks('known')).toEqual(['{{title}}'])
  })
})
