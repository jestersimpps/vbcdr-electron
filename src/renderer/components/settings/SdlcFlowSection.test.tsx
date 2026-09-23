import { beforeEach, describe, expect, it } from 'vitest'
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
  useSdlcStore.setState({ tickets: [] })
})

describe('SdlcFlowSection', () => {
  it('the plus tab adds a column before the last one and opens it for editing', () => {
    render(<SdlcFlowSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }))

    expect(columns().map((c) => c.id)).toEqual(['backlog', 'planning', 'implementing', 'review', 'pull-request', 'new-column', 'done'])
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('New column')
  })

  it('renames a column without changing its id', () => {
    render(<SdlcFlowSection />)
    selectColumn('Planning')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Design' } })

    expect(columns()[1]).toMatchObject({ id: 'planning', label: 'Design' })
  })

  it('keeps the ends fixed: no delete, no command, no prompt', () => {
    render(<SdlcFlowSection />)
    expect(screen.queryByRole('button', { name: 'Delete column' })).toBeNull()
    expect(screen.queryByLabelText('Startup command')).toBeNull()

    selectColumn('Done')
    expect(screen.queryByRole('button', { name: 'Delete column' })).toBeNull()
    expect(screen.queryByLabelText('Prompt for done')).toBeNull()
  })

  it('edits the startup command an agent column starts with', () => {
    render(<SdlcFlowSection />)
    selectColumn('Implementing')
    const command = screen.getByLabelText('Startup command') as HTMLInputElement
    expect(command.value).toBe('claude --permission-mode bypassPermissions')

    fireEvent.change(command, { target: { value: 'claude --model opus' } })

    expect(columns()[2].command).toBe('claude --model opus')
  })

  it('shows no model picker or per-column switches any more', () => {
    render(<SdlcFlowSection />)
    selectColumn('Review')
    expect(screen.queryByLabelText(/model/i)).toBeNull()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(screen.queryByLabelText('Description')).toBeNull()
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
