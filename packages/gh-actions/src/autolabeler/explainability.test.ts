import * as core from '@actions/core'
import type { GitHubAdapter } from '@release-drafter/github-adapter'
import { describe, expect, it, vi } from 'vitest'
import {
  buildExplainabilitySummary,
  COMMENT_MARKER,
  getGitmojiSpec,
  postOrUpdatePRComment,
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
      expect(summary).toContain(
        '- **Matched File(s):** `.github/workflows/ci.yml`',
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

      // Release Impact section
      expect(summary).toContain('- **Calculated Version Increment:** `minor`')
      expect(summary).toContain('- ✨ Features & Improvements')
      expect(summary).toContain('- 👷 CI/CD')
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
      expect(summary).toContain('No autolabeler rules matched Pull Request')
    })

    it('displays superseded status in table and release impact section', () => {
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

      expect(summary).toContain('Applied **3** label(s) to Pull Request')
      expect(summary).toContain(
        '| `patch` | - | `patch` *(superseded by `minor`)* | Files |',
      )
      expect(summary).toContain(
        '- **Superseded Bump Label(s):** `patch` (superseded by `minor`)',
      )
    })
  })

  describe('writeStepSummary', () => {
    it('writes markdown to core.summary', async () => {
      const addRawMock = vi.fn().mockReturnThis()
      const writeMock = vi.fn().mockResolvedValue(undefined)
      vi.spyOn(core.summary, 'addRaw').mockImplementation(addRawMock)
      vi.spyOn(core.summary, 'write').mockImplementation(writeMock)

      await writeStepSummary('## Test Summary')
      expect(addRawMock).toHaveBeenCalledWith('## Test Summary')
      expect(writeMock).toHaveBeenCalled()
    })
  })

  describe('postOrUpdatePRComment', () => {
    it('creates a new comment if none exists', async () => {
      const createCommentMock = vi.fn().mockResolvedValue({ data: { id: 101 } })
      const updateCommentMock = vi.fn().mockResolvedValue({})
      const listCommentsMock = vi.fn().mockResolvedValue({
        data: [{ id: 1, body: 'User comment' }],
      })

      const adapter = {
        octokit: {
          rest: {
            issues: {
              listComments: listCommentsMock,
              createComment: createCommentMock,
              updateComment: updateCommentMock,
            },
          },
        },
      } as unknown as GitHubAdapter

      await postOrUpdatePRComment({
        adapter,
        repo: { owner: 'test-owner', repo: 'test-repo' },
        issueNumber: 42,
        markdown: '## Summary Body',
      })

      expect(listCommentsMock).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 42,
      })
      expect(createCommentMock).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 42,
        body: `${COMMENT_MARKER}\n## Summary Body`,
      })
      expect(updateCommentMock).not.toHaveBeenCalled()
    })

    it('updates existing comment if comment with marker exists', async () => {
      const createCommentMock = vi.fn().mockResolvedValue({})
      const updateCommentMock = vi.fn().mockResolvedValue({})
      const listCommentsMock = vi.fn().mockResolvedValue({
        data: [
          { id: 1, body: 'User comment' },
          { id: 202, body: `${COMMENT_MARKER}\nOld summary` },
        ],
      })

      const adapter = {
        octokit: {
          rest: {
            issues: {
              listComments: listCommentsMock,
              createComment: createCommentMock,
              updateComment: updateCommentMock,
            },
          },
        },
      } as unknown as GitHubAdapter

      await postOrUpdatePRComment({
        adapter,
        repo: { owner: 'test-owner', repo: 'test-repo' },
        issueNumber: 42,
        markdown: '## Updated Body',
      })

      expect(updateCommentMock).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        comment_id: 202,
        body: `${COMMENT_MARKER}\n## Updated Body`,
      })
      expect(createCommentMock).not.toHaveBeenCalled()
    })
  })
})
