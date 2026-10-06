import process from 'node:process'
import * as core from '@actions/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCheckPrSummary, writeStepSummary } from './explainability.ts'

describe('check-pr explainability', () => {
  describe('buildCheckPrSummary', () => {
    it('builds summary for valid pull request', () => {
      const summary = buildCheckPrSummary({
        pullRequest: {
          number: 42,
          title: 'feat: add user profile endpoints',
          baseRef: 'main',
          labels: ['feature'],
        },
        evaluation: {
          valid: true,
          skipped: false,
          labels: ['feature'],
          selectedCategoryCount: 1,
        },
      })

      expect(summary).toContain('### 🏷️ Release Drafter — PR Check')
      expect(summary).toContain('| **#42** |')
      expect(summary).toContain('`feat: add user profile endpoints`')
      expect(summary).toContain('`feature`')
      expect(summary).toContain('✅ Valid (1 rule matched)')
    })

    it('builds summary for skipped pull request', () => {
      const summary = buildCheckPrSummary({
        pullRequest: {
          number: 10,
          title: 'chore: update internal tests',
          baseRef: 'main',
          labels: ['skip-changelog'],
        },
        evaluation: {
          valid: true,
          skipped: true,
          labels: ['skip-changelog'],
        },
      })

      expect(summary).toContain('### 🏷️ Release Drafter — PR Check')
      expect(summary).toContain('| **#10** |')
      expect(summary).toContain('⏭️ Skipped (`pre-exclude`)')
      expect(summary).toContain('`skip-changelog`')
    })

    it('builds summary for invalid pull request', () => {
      const summary = buildCheckPrSummary({
        pullRequest: {
          number: 99,
          title: 'random non conforming commit',
          baseRef: 'main',
          labels: [],
        },
        evaluation: {
          valid: false,
          skipped: false,
          labels: [],
          selectedCategoryCount: 0,
        },
      })

      expect(summary).toContain('### 🏷️ Release Drafter — PR Check')
      expect(summary).toContain('| **#99** |')
      expect(summary).toContain('❌ Invalid')
      expect(summary).toContain('To resolve:')
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

      await writeStepSummary('### Check PR Summary')
      expect(addRawMock).toHaveBeenCalledWith('### Check PR Summary')
      expect(writeMock).toHaveBeenCalled()
    })
  })
})
