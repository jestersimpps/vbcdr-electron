import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { SdlcPage } from './SdlcPage'
import { SDLC_STAGES } from '@/models/sdlc'
import { isHandoffStage } from '@/models/sdlc-prompts'
import { useProjectStore } from '@/stores/project-store'
import { useSdlcStore } from '@/stores/sdlc-store'

const HANDOFF_STAGES = SDLC_STAGES.filter((s) => isHandoffStage(s.id))

beforeEach(() => {
  cleanup()
  useProjectStore.setState({
    projects: [{ id: 'p1', name: 'vbcdr', path: '/cwd', lastOpened: 0 }]
  })
  useSdlcStore.setState({ stageModels: {} })
  vi.mocked(window.api.providerModels.list)
    .mockReset()
    .mockResolvedValue([
      { provider: 'anthropic', models: [], error: null, source: 'catalogue' },
      { provider: 'openai', models: [], error: null, source: 'catalogue' }
    ])
})

describe('StageModelBar', () => {
  it('offers a model picker for every stage that hands off, and none for done', async () => {
    render(<SdlcPage />)
    await waitFor(() => expect(window.api.providerModels.list).toHaveBeenCalled())

    for (const stage of SDLC_STAGES) {
      const picker = screen.queryByLabelText(`Model for ${stage.id}`)
      if (isHandoffStage(stage.id)) {
        expect(picker, `${stage.id} should have a picker`).toBeTruthy()
      } else {
        expect(picker, `${stage.id} should not have a picker`).toBeNull()
      }
    }
  })

  it('still renders the backlog column itself', async () => {
    render(<SdlcPage />)
    await waitFor(() => expect(window.api.providerModels.list).toHaveBeenCalled())

    expect(screen.getAllByText('Backlog').length).toBeGreaterThan(0)
  })

  /**
   * The row keeps a slot per stage so it lines up with the swimlane columns; the
   * done stage holds an empty placeholder rather than collapsing the grid.
   */
  it('keeps a slot for every stage so the row aligns with the columns', async () => {
    const { container } = render(<SdlcPage />)
    await waitFor(() => expect(window.api.providerModels.list).toHaveBeenCalled())

    const row = container.querySelector('.flex.items-start')
    expect(row?.children.length).toBe(SDLC_STAGES.length)
  })

  it('renders one picker pair per handoff stage', async () => {
    render(<SdlcPage />)
    await waitFor(() => expect(window.api.providerModels.list).toHaveBeenCalled())

    expect(screen.getAllByLabelText(/^Model for /)).toHaveLength(HANDOFF_STAGES.length)
    expect(screen.getAllByLabelText(/^Provider for /)).toHaveLength(HANDOFF_STAGES.length)
  })

  it('defaults an unset stage to the first provider and prefers a sonnet over a smaller model', async () => {
    vi.mocked(window.api.providerModels.list).mockResolvedValue([
      {
        provider: 'anthropic',
        models: [
          { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },
          { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', provider: 'anthropic' }
        ],
        error: null,
        source: 'catalogue'
      },
      { provider: 'openai', models: [], error: null, source: 'catalogue' }
    ])
    render(<SdlcPage />)

    await waitFor(() =>
      expect(useSdlcStore.getState().stageModels.planning).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5' })
    )
    expect((screen.getByLabelText('Model for planning') as HTMLSelectElement).value).toBe('claude-sonnet-5')
  })

  it('leaves an explicit choice alone', async () => {
    useSdlcStore.setState({ stageModels: { planning: { provider: 'anthropic', model: 'claude-haiku-4-5' } } })
    vi.mocked(window.api.providerModels.list).mockResolvedValue([
      {
        provider: 'anthropic',
        models: [
          { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },
          { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', provider: 'anthropic' }
        ],
        error: null,
        source: 'catalogue'
      },
      { provider: 'openai', models: [], error: null, source: 'catalogue' }
    ])
    render(<SdlcPage />)
    await waitFor(() => expect(window.api.providerModels.list).toHaveBeenCalled())

    expect(useSdlcStore.getState().stageModels.planning?.model).toBe('claude-haiku-4-5')
  })
})
