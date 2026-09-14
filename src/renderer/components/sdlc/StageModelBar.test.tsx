import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { SdlcPage } from './SdlcPage'
import { SDLC_STAGES } from '@/models/sdlc'

beforeEach(() => {
  cleanup()
  vi.mocked(window.api.providerModels.list)
    .mockReset()
    .mockResolvedValue([
      { provider: 'anthropic', models: [], error: null, source: 'catalogue' },
      { provider: 'openai', models: [], error: null, source: 'catalogue' }
    ])
})

describe('StageModelBar', () => {
  it('offers a model picker only for the agent-driven stages', async () => {
    render(<SdlcPage />)
    await waitFor(() => expect(window.api.providerModels.list).toHaveBeenCalled())

    for (const stage of SDLC_STAGES) {
      const picker = screen.queryByLabelText(`Model for ${stage.id}`)
      if (stage.autonomous) {
        expect(picker, `${stage.id} should have a picker`).toBeTruthy()
      } else {
        expect(picker, `${stage.id} should not have a picker`).toBeNull()
      }
    }
  })

  it('does not offer a model for backlog', async () => {
    render(<SdlcPage />)
    await waitFor(() => expect(window.api.providerModels.list).toHaveBeenCalled())

    expect(screen.queryByLabelText('Model for backlog')).toBeNull()
    expect(screen.queryByLabelText('Provider for backlog')).toBeNull()
  })

  it('still renders the backlog column itself', async () => {
    render(<SdlcPage />)
    await waitFor(() => expect(window.api.providerModels.list).toHaveBeenCalled())

    expect(screen.getAllByText('Backlog').length).toBeGreaterThan(0)
  })

  /**
   * The row keeps a slot per stage so it lines up with the swimlane columns; the
   * non-agent stages hold an empty placeholder rather than collapsing the grid.
   */
  it('keeps a slot for every stage so the row aligns with the columns', async () => {
    const { container } = render(<SdlcPage />)
    await waitFor(() => expect(window.api.providerModels.list).toHaveBeenCalled())

    const row = container.querySelector('.flex.items-start')
    expect(row?.children.length).toBe(SDLC_STAGES.length)
  })

  it('renders one picker pair per agent stage', async () => {
    render(<SdlcPage />)
    await waitFor(() => expect(window.api.providerModels.list).toHaveBeenCalled())

    const agentStages = SDLC_STAGES.filter((s) => s.autonomous)
    expect(screen.getAllByLabelText(/^Model for /)).toHaveLength(agentStages.length)
    expect(screen.getAllByLabelText(/^Provider for /)).toHaveLength(agentStages.length)
  })
})
