import * as core from '@actions/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildExplainabilitySummary,
  isGitHubEnvironment,
  writeStepSummary,
} from './explainability.ts'

describe('explainability', () => {
  describe('buildExplainabilitySummary', () => {
    it('formats a detailed markdown table with labels, semver impact, and triggers', () => {
      const summary = buildExplainabilitySummary({
        pullRequest: {
          number: 42,
          title: 'feat: add OAuth login',
          branch: 'feat/auth',
        },
        matches: [
          {
            label: 'minor',
            matcher: 'title',
            pattern: '/^feat:/',
            matchedValue: 'feat: add OAuth login',
          },
          {
            label: 'patch',
            matcher: 'files',
            pattern: '.github/**',
            matchedValue: '.github/workflows/ci.yml',
          },
        ],
        categories: [
          { title: 'Features & Improvements', labels: ['minor'] },
          { title: 'CI/CD', labels: ['patch'] },
        ],
      })

      // Matches callouts
      expect(summary).toContain('- **Matched Title:** `feat: add OAuth login`')
      expect(summary).toContain('- **Matched Files:**')
      expect(summary).toContain('  - `.github/workflows/ci.yml`')

      // Header & PR info
      expect(summary).toContain('## 🏷️ Release Drafter Summary')
      expect(summary).toContain(
        'Applied **2** label(s) to PR **#42** (`feat/auth`) with **`minor`** version increment.',
      )

      // Collapsed details section
      expect(summary).toContain('<details>')
      expect(summary).toContain('<summary>🏷️ Label Decision Details</summary>')

      // Table headers
      expect(summary).toContain(
        '| Label | Semver Impact | Trigger | Matched Rule |',
      )

      expect(summary).toContain(
        '| `minor` | `minor` | Title | Title matched `/^feat:/` |',
      )
      expect(summary).toContain(
        '| `patch` | `patch` | Files | Files matched pattern `.github/**` |',
      )

      // Release Sections list
      expect(summary).toContain('- **Release Sections:**')
      expect(summary).toContain('  - Features & Improvements')
      expect(summary).toContain('  - CI/CD')
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
          title: 'feat: new feature and docs',
          branch: 'test/pr',
        },
        matches: [
          {
            label: 'minor',
            matcher: 'title',
            pattern: '/^feat:/',
            matchedValue: 'feat: new feature and docs',
          },
          {
            label: 'patch',
            matcher: 'files',
            pattern: 'docs/**',
            matchedValue: 'docs/test.md',
          },
        ],
        appliedLabels: ['minor'],
        supersededLabels: ['patch'],
      })

      expect(summary).toContain(
        'Applied **1** label(s) to PR **#1** (`test/pr`) with **`minor`** version increment.',
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
