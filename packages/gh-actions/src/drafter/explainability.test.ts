import process from 'node:process'
import * as core from '@actions/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDrafterSummary, writeStepSummary } from './explainability.ts'

describe('drafter explainability', () => {
  describe('buildDrafterSummary', () => {
    it('builds summary for created draft release', () => {
      const summary = buildDrafterSummary({
        result: {
          plan: {
            action: 'create',
            releasePayload: {
              name: 'v1.0.0',
              tag: 'v1.0.0',
              body: '## Changes\n- feat: something new',
              targetCommitish: 'main',
              prerelease: false,
              makeLatest: true,
              draft: true,
              resolvedVersion: '1.0.0',
            },
          },
          release: {
            id: 12345,
            tagName: 'v1.0.0',
            name: 'v1.0.0',
            draft: true,
            prerelease: false,
            url: 'https://github.com/org/repo/releases/tag/v1.0.0',
          },
          releasePayload: {
            name: 'v1.0.0',
            tag: 'v1.0.0',
            body: '## Changes\n- feat: something new',
            targetCommitish: 'main',
            prerelease: false,
            makeLatest: true,
            draft: true,
            resolvedVersion: '1.0.0',
          },
          labels: ['feature'],
        },
      })

      expect(summary).toContain('### 🚀 Release Drafter Summary')
      expect(summary).toContain(
        '[v1.0.0](https://github.com/org/repo/releases/tag/v1.0.0)',
      )
      expect(summary).toContain('`v1.0.0`')
      expect(summary).toContain('✨ Created Draft')
      expect(summary).toContain('`1.0.0`')
      expect(summary).toContain('`main`')
      expect(summary).toContain('**Matched Labels:** `feature`')
      expect(summary).toContain(
        '<summary>📄 Preview Generated Release Notes</summary>',
      )
      expect(summary).toContain('## Changes\n- feat: something new')
    })

    it('builds summary for dry-run release', () => {
      const summary = buildDrafterSummary({
        result: {
          plan: {
            action: 'dry-run',
            releasePayload: {
              name: 'v1.1.0',
              tag: 'v1.1.0',
              body: '## Changes in Dry Run',
              targetCommitish: 'main',
              prerelease: false,
              makeLatest: true,
              draft: true,
              resolvedVersion: '1.1.0',
            },
          },
          releasePayload: {
            name: 'v1.1.0',
            tag: 'v1.1.0',
            body: '## Changes in Dry Run',
            targetCommitish: 'main',
            prerelease: false,
            makeLatest: true,
            draft: true,
            resolvedVersion: '1.1.0',
          },
          labels: [],
        },
      })

      expect(summary).toContain('🧪 Dry Run')
      expect(summary).toContain('`v1.1.0`')
      expect(summary).toContain('## Changes in Dry Run')
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

      await writeStepSummary('## Drafter Summary')
      expect(addRawMock).toHaveBeenCalledWith('## Drafter Summary')
      expect(writeMock).toHaveBeenCalled()
    })
  })
})
