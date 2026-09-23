import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SdlcFlowSection } from './SdlcFlowSection'
import { sdlcColumns, useSdlcFlowStore } from '@/stores/sdlc-flow-store'
import { useSdlcStore } from '@/stores/sdlc-store'
import { columnPrompt, type SdlcColumn } from '@/models/sdlc-flow'
import { threeStageFlowState } from '@/models/sdlc-flow.fixtures'

function columns(): SdlcColumn[] {
  return sdlcColumns('p1')
}

function selectColumn(label: string): void {
  fireEvent.click(within(screen.getByRole('tablist', { name: 'Flow columns' })).getByRole('tab', { name: label }))
}

beforeEach(() => {
  cleanup()
  useSdlcFlowStore.setState(threeStageFlowState())
  useSdlcStore.setState({ tickets: [] })
})

describe('SdlcFlowSection', () => {
  it('the plus tab adds a column before the last one and opens it for editing', () => {
    render(<SdlcFlowSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }))

    expect(columns().map((c) => c.id)).toEqual(['backlog', 'planning', 'implementing', 'review', 'new-column', 'done'])
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('New column')
  })

  it('renames a column without changing its id', () => {
    render(<SdlcFlowSection />)
    selectColumn('Planning')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Design' } })

    expect(columns()[1]).toMatchObject({ id: 'planning', label: 'Design' })
  })

  it('keeps the ends fixed: no delete, and only the last one runs a command', () => {
    render(<SdlcFlowSection />)
    expect(screen.queryByRole('button', { name: 'Delete column' })).toBeNull()
    expect(screen.queryByLabelText('Startup command')).toBeNull()

    selectColumn('Done')
    expect(screen.queryByRole('button', { name: 'Delete column' })).toBeNull()
    expect((screen.getByLabelText('Startup command') as HTMLInputElement).value).toBe(
      'claude --permission-mode bypassPermissions'
    )
    expect((screen.getByLabelText('Prompt for done') as HTMLTextAreaElement).value).toContain('gh pr create')
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

  it('edits the prompt on blur and resets it to the handover template for its place', () => {
    render(<SdlcFlowSection />)
    selectColumn('Planning')
    const prompt = screen.getByLabelText('Prompt for planning')
    fireEvent.change(prompt, { target: { value: 'plan differently' } })
    fireEvent.blur(prompt)
    expect(columns()[1].prompt).toBe('plan differently')

    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }))
    expect(columns()[1].prompt).toBe(columnPrompt([]))
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

  it('saves the flow as a new one and edits that copy from then on', () => {
    render(<SdlcFlowSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Save as a new flow' }))
    fireEvent.change(screen.getByLabelText('New flow name'), { target: { value: 'Careful' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save flow' }))

    selectColumn('Planning')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Think' } })

    expect(columns()[1].label).toBe('Planning')
    expect(useSdlcFlowStore.getState().flows.find((f) => f.id === 'careful')?.columns[1].label).toBe('Think')
  })

  it('offers no delete for the default flow', () => {
    render(<SdlcFlowSection />)
    expect(screen.queryByRole('button', { name: 'Delete flow' })).toBeNull()
  })
})
