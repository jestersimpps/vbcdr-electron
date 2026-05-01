import { describe, it, expect, beforeEach, vi } from 'vitest'

const stores = new Map<string, Record<string, unknown>>()

vi.mock('electron-store', () => {
  return {
    default: class MockStore<T extends Record<string, unknown>> {
      private name: string
      constructor(opts: { name?: string; defaults: T }) {
        this.name = opts.name ?? 'default'
        if (!stores.has(this.name)) {
          stores.set(this.name, { ...opts.defaults })
        }
      }
      get(key: string): unknown {
        return stores.get(this.name)![key]
      }
      set(key: string, val: unknown): void {
        stores.get(this.name)![key] = val
      }
    }
  }
})

vi.mock('electron', () => ({
  safeStorage: {
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString('utf-8').replace(/^enc:/, '')
  }
}))

const reset = (): void => {
  stores.clear()
  vi.resetModules()
}

describe('credential-store service', () => {
  beforeEach(reset)

  it('saves a new credential with id, encrypted password, timestamps', async () => {
    const { saveCredential, listCredentials } = await import('./credential-store')
    const cred = saveCredential('p1', 'example.com', 'alice', 'hunter2')
    expect(cred.id).toBeTruthy()
    expect(cred.domain).toBe('example.com')
    expect(cred.username).toBe('alice')
    expect(cred.encryptedPassword).not.toContain('hunter2')
    expect(typeof cred.createdAt).toBe('number')
    expect(typeof cred.updatedAt).toBe('number')
    expect(listCredentials('p1')).toHaveLength(1)
  })

  it('updates encrypted password on duplicate (domain, username)', async () => {
    const { saveCredential, listCredentials, decryptPassword } = await import('./credential-store')
    const first = saveCredential('p1', 'example.com', 'alice', 'old')
    const firstId = first.id
    const firstEncrypted = first.encryptedPassword
    expect(decryptPassword('p1', firstId)).toBe('old')
    const second = saveCredential('p1', 'example.com', 'alice', 'new')
    expect(second.id).toBe(firstId)
    expect(second.encryptedPassword).not.toBe(firstEncrypted)
    expect(decryptPassword('p1', firstId)).toBe('new')
    expect(listCredentials('p1')).toHaveLength(1)
  })

  it('keeps separate creds for same domain different usernames', async () => {
    const { saveCredential, listCredentials } = await import('./credential-store')
    saveCredential('p1', 'example.com', 'alice', 'a')
    saveCredential('p1', 'example.com', 'bob', 'b')
    expect(listCredentials('p1')).toHaveLength(2)
  })

  it('decryptPassword roundtrips, returns null for unknown id', async () => {
    const { saveCredential, decryptPassword } = await import('./credential-store')
    const cred = saveCredential('p1', 'example.com', 'alice', 'hunter2')
    expect(decryptPassword('p1', cred.id)).toBe('hunter2')
    expect(decryptPassword('p1', 'nope')).toBeNull()
    expect(decryptPassword('other-project', cred.id)).toBeNull()
  })

  it('getCredentialsForDomain filters by domain', async () => {
    const { saveCredential, getCredentialsForDomain } = await import('./credential-store')
    saveCredential('p1', 'a.com', 'alice', 'x')
    saveCredential('p1', 'a.com', 'bob', 'y')
    saveCredential('p1', 'b.com', 'alice', 'z')
    const aOnly = getCredentialsForDomain('p1', 'a.com')
    expect(aOnly).toHaveLength(2)
    expect(aOnly.every((c) => c.domain === 'a.com')).toBe(true)
  })

  it('deleteCredential returns true when removed, false otherwise', async () => {
    const { saveCredential, deleteCredential, listCredentials } = await import('./credential-store')
    const cred = saveCredential('p1', 'a.com', 'alice', 'x')
    expect(deleteCredential('p1', cred.id)).toBe(true)
    expect(listCredentials('p1')).toEqual([])
    expect(deleteCredential('p1', cred.id)).toBe(false)
  })

  it('updateCredential changes username and password, returns false on miss', async () => {
    const { saveCredential, updateCredential, listCredentials, decryptPassword } = await import('./credential-store')
    const cred = saveCredential('p1', 'a.com', 'alice', 'old')
    expect(updateCredential('p1', cred.id, 'alice2', 'new')).toBe(true)
    const list = listCredentials('p1')
    expect(list[0].username).toBe('alice2')
    expect(decryptPassword('p1', cred.id)).toBe('new')
    expect(updateCredential('p1', 'unknown', 'x', 'y')).toBe(false)
  })

  it('clearProjectCredentials removes only that project', async () => {
    const { saveCredential, clearProjectCredentials, listCredentials } = await import('./credential-store')
    saveCredential('p1', 'a.com', 'alice', 'x')
    saveCredential('p2', 'b.com', 'bob', 'y')
    clearProjectCredentials('p1')
    expect(listCredentials('p1')).toEqual([])
    expect(listCredentials('p2')).toHaveLength(1)
  })
})
