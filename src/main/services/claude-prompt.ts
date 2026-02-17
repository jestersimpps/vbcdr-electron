import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { app } from 'electron'

const CLAUDE_DIR = path.join(homedir(), '.claude')
const CLAUDE_MD = path.join(CLAUDE_DIR, 'CLAUDE.md')
const START_MARKER = '<!-- VBCDR_START -->'
const END_MARKER = '<!-- VBCDR_END -->'

async function getBrowserPrompt(): Promise<string> {
  try {
    const projectClaudeMd = path.join(app.getAppPath(), 'CLAUDE.md')
    const content = await readFile(projectClaudeMd, 'utf-8')
    return `${START_MARKER}\n${content}\n${END_MARKER}`
  } catch (err) {
    console.warn('Could not read project CLAUDE.md, using fallback')
    return `${START_MARKER}\n# vbcdr\n\nSee project CLAUDE.md for browser API documentation.\n${END_MARKER}`
  }
}

function stripVbcdrBlock(content: string): string {
  const startIdx = content.indexOf(START_MARKER)
  if (startIdx === -1) return content
  const endIdx = content.indexOf(END_MARKER)
  if (endIdx === -1) return content
  const before = content.substring(0, startIdx)
  const after = content.substring(endIdx + END_MARKER.length)
  return (before + after).replace(/\n{3,}/g, '\n\n').trim()
}

export async function injectBrowserPrompt(): Promise<void> {
  try {
    await mkdir(CLAUDE_DIR, { recursive: true })

    let existing = ''
    try {
      existing = await readFile(CLAUDE_MD, 'utf-8')
    } catch {
      // file doesn't exist yet
    }

    const cleaned = stripVbcdrBlock(existing)
    const browserPrompt = await getBrowserPrompt()
    const separator = cleaned.length > 0 ? '\n\n' : ''
    const result = cleaned + separator + browserPrompt + '\n'

    await writeFile(CLAUDE_MD, result, 'utf-8')
    console.log('Injected vbcdr browser prompt into ~/.claude/CLAUDE.md')
  } catch (err) {
    console.error('Failed to inject browser prompt:', err)
  }
}

export async function removeBrowserPrompt(): Promise<void> {
  try {
    const content = await readFile(CLAUDE_MD, 'utf-8')
    if (!content.includes(START_MARKER)) return

    const cleaned = stripVbcdrBlock(content)
    await writeFile(CLAUDE_MD, cleaned.length > 0 ? cleaned + '\n' : '', 'utf-8')
    console.log('Removed vbcdr browser prompt from ~/.claude/CLAUDE.md')
  } catch {
    // file doesn't exist or can't be read — nothing to remove
  }
}
