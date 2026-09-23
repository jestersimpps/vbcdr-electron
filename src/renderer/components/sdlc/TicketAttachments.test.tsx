import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TicketAttachments } from './TicketAttachments'
import { EMPTY_ARTIFACTS, type SdlcAttachment, type SdlcTicket } from '@/models/sdlc'

function ticketWith(attachments: SdlcAttachment[], worktreePath = '/repo/.worktrees/llm/x'): SdlcTicket {
  return {
    id: 't1',
    projectId: 'p1',
    title: 'Fix it',
    description: 'Fix it',
    stage: 'implementing',
    status: 'running',
    branch: 'llm/x',
    worktreePath,
    worktreeId: 'wt1',
    tabId: null,
    agent: 'claude',
    createdAt: 0,
    updatedAt: 0,
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    checks: [],
    attachments,
    comments: [],
    artifacts: EMPTY_ARTIFACTS,
    prUrl: null,
    blockedReason: null
  }
}

const screenshot: SdlcAttachment = { id: 'a1', name: 'Screen shot 1.png', kind: 'image', dataUrl: null }

beforeEach(() => {
  cleanup()
  vi.mocked(window.api.fs.openFolder).mockClear()
  vi.mocked(window.api.fs.readImageAsDataUrl).mockReset().mockResolvedValue(null)
})

describe('TicketAttachments', () => {
  it('opens the copy written into the worktree when clicked', () => {
    render(<TicketAttachments ticket={ticketWith([screenshot])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Screen shot 1.png' }))
    expect(window.api.fs.openFolder).toHaveBeenCalledWith(
      '/repo/.worktrees/llm/x/.vbcdr/attachments/Screen_shot_1.png'
    )
  })

  it('loads the thumbnail from the worktree once the image bytes are no longer in memory', async () => {
    vi.mocked(window.api.fs.readImageAsDataUrl).mockResolvedValue('data:image/png;base64,AAAA')
    const { container } = render(<TicketAttachments ticket={ticketWith([screenshot])} />)
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA'))
  })

  it('cannot open anything before the ticket has a worktree', () => {
    render(<TicketAttachments ticket={ticketWith([screenshot], '—')} />)
    const chip = screen.getByRole('button', { name: 'Open Screen shot 1.png' }) as HTMLButtonElement
    expect(chip.disabled).toBe(true)
    expect(window.api.fs.readImageAsDataUrl).not.toHaveBeenCalled()
  })

  it('renders nothing without attachments', () => {
    const { container } = render(<TicketAttachments ticket={ticketWith([])} />)
    expect(container.firstChild).toBeNull()
  })
})
