import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SdlcFlowSection } from './SdlcFlowSection'
import { useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { useSdlcStore } from '@/stores/sdlc-store'
import { DEFAULT_SDLC_STAGE_PROMPTS } from '@/models/sdlc-prompts'

function columns(): ReturnType<typeof useSdlcFlowStore.getState>['columns'] {
  return useSdlcFlowStore.getState().columns
}

function selectColumn(label: string): void {
  fireEvent.click(within(screen.getByRole('tablist', { name: 'Flow columns' })).getByRole('tab', { name: label }))
}

beforeEach(() => {
  cleanup()
  useSdlcFlowStore.getState().resetColumns()
  useSdlcStore.setState({ tickets: [], stageModels: {} })
  vi.mocked(window.api.providerModels.list)
    .mockReset()
    .mockResolvedValue([
      { provider: 'anthropic', models: [], error: null, source: 'catalogue' },
      { provider: 'openai', models: [], error: null, source: 'catalogue' }
    ])
})

describe('SdlcFlowSection', () => {
  it('adds a column before the last one and opens it for editing', () => {
    render(<SdlcFlowSection />)
    fireEvent.click(screen.getByRole('button', { name: /add column before done/i }))

    expect(columns().map((c) => c.id)).toEqual(['backlog', 'planning', 'implementing', 'review', 'new-column', 'done'])
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('New column')
  })

  it('renames a column without changing its id', () => {
    render(<SdlcFlowSection />)
    selectColumn('Planning')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Design' } })

    expect(columns()[1]).toMatchObject({ id: 'planning', label: 'Design' })
  })

  it('keeps the ends fixed: no kind picker, no reorder, no delete', () => {
    render(<SdlcFlowSection />)
    expect(screen.queryByLabelText('Worked by')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete column' })).toBeNull()

    selectColumn('Done')
    expect(screen.queryByLabelText('Worked by')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move column left' })).toBeNull()
  })

  it('turning a column human hides everything that only an agent needs', () => {
    render(<SdlcFlowSection />)
    selectColumn('Implementing')
    expect(screen.getByLabelText('Prompt for implementing')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Worked by'), { target: { value: 'human' } })

    expect(columns()[2].kind).toBe('human')
    expect(screen.queryByLabelText('Prompt for implementing')).toBeNull()
    expect(screen.queryByRole('switch', { name: /run unattended/i })).toBeNull()
  })

  it('edits the prompt on blur and resets it to the shipped text', () => {
    render(<SdlcFlowSection />)
    selectColumn('Planning')
    const prompt = screen.getByLabelText('Prompt for planning')
    fireEvent.change(prompt, { target: { value: 'plan differently' } })
    fireEvent.blur(prompt)
    expect(columns()[1].prompt).toBe('plan differently')

    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }))
    expect(columns()[1].prompt).toBe(DEFAULT_SDLC_STAGE_PROMPTS.planning)
  })

  it('lists the outputs a prompt can read: only the agent columns before it', () => {
    render(<SdlcFlowSection />)
    selectColumn('Review')
    expect(screen.getByText('{{output.planning}}')).toBeTruthy()
    expect(screen.getByText('{{output.implementing}}')).toBeTruthy()
    expect(screen.queryByText('{{output.review}}')).toBeNull()
  })

  it('adds, relabels and removes ticket-view panels', () => {
    render(<SdlcFlowSection />)
    selectColumn('Planning')

    fireEvent.click(screen.getByRole('button', { name: 'Changed files' }))
    expect(columns()[1].panels.map((p) => p.kind)).toEqual(['output', 'diff'])

    fireEvent.change(screen.getByLabelText('Heading for the Output panel'), { target: { value: 'The plan' } })
    expect(columns()[1].panels[0].label).toBe('The plan')

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove panel' })[0])
    expect(columns()[1].panels.map((p) => p.kind)).toEqual(['diff'])
  })

  it('asks where the tickets go before deleting a column', () => {
    const created = useSdlcStore.getState().createTicket({ projectId: 'p1', description: 'x', attachments: [] })
    useSdlcStore.getState().moveTicket(created.id, 'implementing')
    render(<SdlcFlowSection />)
    selectColumn('Implementing')

    fireEvent.click(screen.getByRole('button', { name: 'Delete column' }))
    fireEvent.change(screen.getByLabelText('Column to move the tickets to'), { target: { value: 'review' } })
    const confirm = screen.getAllByRole('button', { name: 'Delete column' }).at(-1)
    fireEvent.click(confirm!)

    expect(columns().map((c) => c.id)).not.toContain('implementing')
    expect(useSdlcStore.getState().tickets[0].stage).toBe('review')
  })

  it('will not delete a column an agent is running in', () => {
    const created = useSdlcStore.getState().createTicket({ projectId: 'p1', description: 'x', attachments: [] })
    useSdlcStore.getState().patchTicket(created.id, { stage: 'planning', status: 'running' })
    render(<SdlcFlowSection />)
    selectColumn('Planning')

    expect((screen.getByRole('button', { name: /an agent is running/i }) as HTMLButtonElement).disabled).toBe(true)
  })
})
