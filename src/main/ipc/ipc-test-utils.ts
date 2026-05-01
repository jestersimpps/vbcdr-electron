import { vi } from 'vitest'

export type IpcHandler = (event: unknown, ...args: unknown[]) => unknown
export type IpcRegistry = Map<string, IpcHandler>

export function makeIpcRegistry(): IpcRegistry {
  return new Map<string, IpcHandler>()
}

export function makeIpcMainMock(registry: IpcRegistry): { handle: (channel: string, fn: IpcHandler) => void } {
  return {
    handle: vi.fn((channel: string, fn: IpcHandler) => {
      registry.set(channel, fn)
    })
  }
}

export async function invoke<T = unknown>(
  registry: IpcRegistry,
  channel: string,
  ...args: unknown[]
): Promise<T> {
  const handler = registry.get(channel)
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
  return (await handler({ sender: { id: 1 } }, ...args)) as T
}
