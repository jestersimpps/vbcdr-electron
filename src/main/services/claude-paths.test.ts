import { describe, it, expect } from 'vitest'
import path from 'path'
import os from 'os'
import { claudeProjectSlug, claudeProjectsDir, claudeProjectDir } from './claude-paths'

describe('claudeProjectSlug', () => {
  it('replaces path separators with dashes', () => {
    expect(claudeProjectSlug('/Users/me/Sites/vibecoder')).toBe('-Users-me-Sites-vibecoder')
  })

  it('sanitizes dots and underscores, matching how Claude Code names the directory', () => {
    expect(claudeProjectSlug('/Users/me/Sites/my_app.v2')).toBe('-Users-me-Sites-my-app-v2')
  })

  it('sanitizes a leading dot directory', () => {
    expect(claudeProjectSlug('/Users/me/.claude')).toBe('-Users-me--claude')
  })

  it('resolves relative paths before slugifying', () => {
    const expected = path.resolve('.').replace(/[^a-zA-Z0-9]/g, '-')
    expect(claudeProjectSlug('.')).toBe(expected)
  })
})

describe('claudeProjectDir', () => {
  it('joins the projects dir with the slug', () => {
    expect(claudeProjectDir('/Users/me/Sites/my_app')).toBe(
      path.join(os.homedir(), '.claude', 'projects', '-Users-me-Sites-my-app')
    )
  })

  it('points at the shared projects directory', () => {
    expect(claudeProjectsDir()).toBe(path.join(os.homedir(), '.claude', 'projects'))
  })
})
