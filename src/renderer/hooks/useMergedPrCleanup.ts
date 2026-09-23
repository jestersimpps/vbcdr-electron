import { useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/project-store'
import { cleanUpMergedWorktrees } from '@/lib/merged-pr-cleanup'

const CHECK_MS = 5 * 60_000

/** Asks GitHub about every tracked worktree's pull request now and then, and removes the ones that were merged. */
export function useMergedPrCleanup(): void {
  const inFlight = useRef(false)

  useEffect(() => {
    const tick = async (): Promise<void> => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        for (const project of useProjectStore.getState().projects) await cleanUpMergedWorktrees(project.id)
      } finally {
        inFlight.current = false
      }
    }
    const first = setTimeout(() => void tick(), 30_000)
    const timer = setInterval(() => void tick(), CHECK_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [])
}
