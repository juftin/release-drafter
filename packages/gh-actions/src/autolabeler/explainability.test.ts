import * as core from '@actions/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildExplainabilitySummary,
  getGitmojiSpec,
  isGitHubEnvironment,
  writeStepSummary,
} from './explainability.ts'

describe('explainability', () => {
  describe('getGitmojiSpec', () => {
    it('finds preset gitmoji specs by emoji, code, or name', () => {
      const byEmoji = getGitmojiSpec('✨')
      expect(byEmoji?.name).toBe('sparkles')
      expect(byEmoji?.description).toBe('Introduce new features.')
      expect(byEmoji?.semver).toBe('minor')

      const byCode = getGitmojiSpec(':boom:')
      expect(byCode?.name).toBe('boom')
      expect(byCode?.semver).toBe('major')

      const byName = getGitmojiSpec('memo')
      expect(byName?.emoji).toBe('📝')
    })

    it('returns undefined for non-gitmoji labels', () => {
      expect(getGitmojiSpec('minor')).toBeUndefined()
      expect(getGitmojiSpec('major')).toBeUndefined()
      expect(getGitmojiSpec('feat')).toBeUndefined()
      expect(getGitmojiSpec('custom')).toBeUndefined()
    })
  })

  describe('buildExplainabilitySummary', () => {
    it('formats a detailed markdown table with linked intentions only for preset gitmojis', () => {
      const summary = buildExplainabilitySummary({
        pullRequest: {
          number: 42,
          title: '✨ Add OAuth login',
          branch: 'feat/auth',
        },
        matches: [
          {
            label: '✨',
            matcher: 'title',
            pattern: '/^(:sparkles:|✨)/',
            matchedValue: '✨ Add OAuth login',
          },
          {
            label: 'minor',
            matcher: 'title',
            pattern: '/^(:sparkles:|✨)/',
            matchedValue: '✨ Add OAuth login',
          },
          {
            label: '👷',
            matcher: 'files',
            pattern: '.github/**',
            matchedValue: '.github/workflows/ci.yml',
          },
          {
            label: 'patch',
            matcher: 'files',
            pattern: '.github/**',
            matchedValue: '.github/workflows/ci.yml',
          },
        ],
        categories: [
          { title: '✨ Features & Improvements', labels: ['minor', '✨'] },
          { title: '👷 CI/CD', labels: ['patch', '👷'] },
        ],
      })

      // Matches callouts
      expect(summary).toContain('- **Matched Title:** `✨ Add OAuth login`')
      expect(summary).toContain('- **Matched Files:**')
      expect(summary).toContain('  - `.github/workflows/ci.yml`')

      // Header & PR info
      expect(summary).toContain('## 🏷️ Release Drafter Summary')
      expect(summary).toContain(
        'Applied **4** label(s) to PR **#42** (`feat/auth`) with **`minor`** version increment.',
      )

      // Collapsed details section
      expect(summary).toContain('<details>')
      expect(summary).toContain('<summary>🏷️ Label Decision Details</summary>')

      // Table headers
      expect(summary).toContain(
        '| Label | Gitmoji Intention | Semver Impact | Trigger | Matched Rule |',
      )

      // Preset gitmoji has linked intention
      expect(summary).toContain(
        '| `✨` | [Introduce new features.](https://gitmoji.dev/specification) | `minor` | Title | Title matched `/^(:sparkles:\\|✨)/` |',
      )
      expect(summary).toContain(
        '| `👷` | [Add or update CI build system.](https://gitmoji.dev/specification) | `patch` | Files | Files matched pattern `.github/**` |',
      )

      // Non-preset labels have no linked intention (marked with '-')
      expect(summary).toContain(
        '| `minor` | - | `minor` | Title | Title matched `/^(:sparkles:\\|✨)/` |',
      )
      expect(summary).toContain(
        '| `patch` | - | `patch` | Files | Files matched pattern `.github/**` |',
      )

      // Release Sections list
      expect(summary).toContain('- **Release Sections:**')
      expect(summary).toContain('  - ✨ Features & Improvements')
      expect(summary).toContain('  - 👷 CI/CD')
    })

    it('always outputs Matched Files: as a bulleted list even for a single file', () => {
      const summary = buildExplainabilitySummary({
        pullRequest: {
          number: 7,
          title: 'fix: single file fix',
          branch: 'fix/bug',
        },
        matches: [
          {
            label: 'patch',
            matcher: 'files',
            pattern: 'src/**',
            matchedValue: 'src/index.ts',
          },
        ],
      })
      expect(summary).toContain('- **Matched Files:**\n  - `src/index.ts`')
    })

    it('caps matched files to first 5 with overflow count when more than 5 files match', () => {
      const summary = buildExplainabilitySummary({
        pullRequest: {
          number: 5,
          title: 'docs: update all',
          branch: 'docs/all',
        },
        matches: [
          { label: 'docs', matcher: 'files', matchedValue: 'docs/a.md' },
          { label: 'docs', matcher: 'files', matchedValue: 'docs/b.md' },
          { label: 'docs', matcher: 'files', matchedValue: 'docs/c.md' },
          { label: 'docs', matcher: 'files', matchedValue: 'docs/d.md' },
          { label: 'docs', matcher: 'files', matchedValue: 'docs/e.md' },
          { label: 'docs', matcher: 'files', matchedValue: 'docs/f.md' },
          { label: 'docs', matcher: 'files', matchedValue: 'docs/g.md' },
        ],
      })
      expect(summary).toContain('- **Matched Files:**')
      expect(summary).toContain('  - `docs/a.md`')
      expect(summary).toContain('  - `docs/e.md`')
      expect(summary).toContain('  - *(and 2 more)*')
      expect(summary).not.toContain('  - `docs/f.md`')
    })

    it('handles empty matches gracefully', () => {
      const summary = buildExplainabilitySummary({
        pullRequest: {
          number: 10,
          title: 'chore: nothing',
          branch: 'chore/none',
        },
        matches: [],
      })
      expect(summary).toContain('## 🏷️ Release Drafter Summary')
      expect(summary).toContain('No autolabeler rules matched Pull Request')
    })

    it('omits superseded labels from the table and reflects highest bump', () => {
      const summary = buildExplainabilitySummary({
        pullRequest: {
          number: 1,
          title: '✨ docs and feature',
          branch: 'test/pr',
        },
        matches: [
          {
            label: '✨',
            matcher: 'title',
            pattern: '/^(:sparkles:|✨)/',
            matchedValue: '✨ docs and feature',
          },
          {
            label: 'minor',
            matcher: 'title',
            pattern: '/^(:sparkles:|✨)/',
            matchedValue: '✨ docs and feature',
          },
          {
            label: '📝',
            matcher: 'files',
            pattern: 'docs/**',
            matchedValue: 'docs/test.md',
          },
          {
            label: 'patch',
            matcher: 'files',
            pattern: 'docs/**',
            matchedValue: 'docs/test.md',
          },
        ],
        appliedLabels: ['✨', 'minor', '📝'],
        supersededLabels: ['patch'],
      })

      expect(summary).toContain(
        'Applied **3** label(s) to PR **#1** (`test/pr`) with **`minor`** version increment.',
      )
      expect(summary).not.toMatch(/^\| `patch` \|/m)
    })
  })

  describe('isGitHubEnvironment', () => {
    const originalEnv = { ...process.env }

    afterEach(() => {
      process.env = { ...originalEnv }
    })

    it('returns true when GITHUB_ACTIONS is true', () => {
      delete process.env.GITHUB_STEP_SUMMARY
      delete process.env.GITHUB_REPOSITORY
      process.env.GITHUB_ACTIONS = 'true'
      expect(isGitHubEnvironment()).toBe(true)
    })

    it('returns true when GITHUB_STEP_SUMMARY is set', () => {
      delete process.env.GITHUB_ACTIONS
      delete process.env.GITHUB_REPOSITORY
      process.env.GITHUB_STEP_SUMMARY = '/tmp/summary'
      expect(isGitHubEnvironment()).toBe(true)
    })

    it('returns false when no GitHub environment variables are set', () => {
      delete process.env.GITHUB_ACTIONS
      delete process.env.GITHUB_STEP_SUMMARY
      delete process.env.GITHUB_REPOSITORY
      expect(isGitHubEnvironment()).toBe(false)
    })
  })

  describe('writeStepSummary', () => {
    const originalEnv = { ...process.env }

    beforeEach(() => {
      process.env.GITHUB_ACTIONS = 'true'
    })

    afterEach(() => {
      process.env = { ...originalEnv }
    })

    it('writes markdown to core.summary when GitHub is detected', async () => {
      const addRawMock = vi.fn().mockReturnThis()
      const writeMock = vi.fn().mockResolvedValue(undefined)
      vi.spyOn(core.summary, 'addRaw').mockImplementation(addRawMock)
      vi.spyOn(core.summary, 'write').mockImplementation(writeMock)

      await writeStepSummary('## Test Summary')
      expect(addRawMock).toHaveBeenCalledWith('## Test Summary')
      expect(writeMock).toHaveBeenCalled()
    })

    it('skips writing when GitHub is not detected', async () => {
      delete process.env.GITHUB_ACTIONS
      delete process.env.GITHUB_STEP_SUMMARY
      delete process.env.GITHUB_REPOSITORY

      const addRawMock = vi.fn().mockReturnThis()
      vi.spyOn(core.summary, 'addRaw').mockImplementation(addRawMock)

      await writeStepSummary('## Test Summary')
      expect(addRawMock).not.toHaveBeenCalled()
    })
  })
})
