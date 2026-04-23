import type { GitFileStatus } from '@/models/types'

export const GIT_STATUS_COLORS: Record<GitFileStatus, string> = {
  modified: 'text-amber-300',
  added: 'text-emerald-400',
  untracked: 'text-emerald-400',
  deleted: 'text-red-400',
  renamed: 'text-emerald-400',
  conflict: 'text-red-500'
}

export const GIT_STATUS_LABELS: Record<GitFileStatus, string> = {
  modified: 'M',
  added: 'A',
  untracked: 'U',
  deleted: 'D',
  renamed: 'R',
  conflict: 'C'
}
