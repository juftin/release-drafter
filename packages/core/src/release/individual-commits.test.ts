import { describe, expect, it, vi } from 'vitest'
import { splitCommitMessage } from '../change.ts'
import { configSchema } from '../config/config.schema.ts'
import { mergeInputAndConfig } from '../config/merge-input-and-config.ts'
import { noopLogger } from '../ports.ts'
import type { Commit, PullRequest } from '../types.ts'
import { buildReleasePayload } from './build-release-payload.ts'
import { changeToString } from './change-to-string.ts'
import {
  generateContributorsSentence,
  generateNewContributorsList,
} from './generate-contributors-sentence.ts'
import { selectChanges } from './select-changes.ts'
import { sortChanges } from './sort-changes.ts'

const directCommit = (overrides: Partial<Commit> = {}): Commit => ({
  oid: '1234567890abcdef',
  url: 'https://example.test/owner/repo/commit/1234567890abcdef',
  authoredAt: '2026-01-01T00:00:00Z',
  committedAt: '2026-01-02T00:00:00Z',
  message: 'feat(core): add commits\n\nRendered from the commit body.',
  author: {
    login: 'commit-author',
    url: 'https://example.test/commit-author',
  },
  associationStatus: 'unassociated',
  ...overrides,
})

const pullRequest: PullRequest = {
  number: 42,
  title: 'fix: repair releases',
  url: 'https://example.test/owner/repo/pulls/42',
  mergedAt: '2026-01-03T00:00:00Z',
  baseRepository: 'owner/repo',
  author: { login: 'pr-author' },
}

const config = (overrides: Record<string, unknown> = {}) =>
  mergeInputAndConfig({
    config: configSchema.parse({
      commitish: 'main',
      template: '$CHANGES\n\n$CONTRIBUTORS',
      'include-commits': true,
      categories: [
        {
          title: 'Features',
          'semver-increment': 'minor',
          when: { conventional: { type: 'feat' } },
        },
        {
          title: 'Fixes',
          when: { conventional: { type: 'fix' } },
        },
      ],
      ...overrides,
    }),
    input: {},
    logger: noopLogger,
  })

describe('individual commit changes', () => {
  it('splits commit messages without retaining the separator', () => {
    expect(splitCommitMessage('Title\r\n\r\nBody\r\nline two')).toEqual({
      title: 'Title',
      body: 'Body\nline two',
    })
  })

  it('suppresses duplicate, associated, unresolved, and merge-result commits', () => {
    const warning = vi.fn()
    const changes = selectChanges({
      commits: [
        directCommit(),
        directCommit(),
        directCommit({ oid: 'stronger-evidence' }),
        directCommit({
          oid: 'stronger-evidence',
          associationStatus: 'associated',
        }),
        directCommit({ oid: 'associated', associationStatus: 'associated' }),
        directCommit({
          oid: 'reported-association',
          associationStatus: 'unassociated',
          associatedPullRequests: [
            { number: 99, baseRepository: 'someone/else' },
          ],
        }),
        directCommit({ oid: 'unresolved', associationStatus: 'unresolved' }),
        directCommit({
          oid: 'merge-result',
          associationStatus: 'unassociated',
        }),
      ],
      pullRequests: [{ ...pullRequest, mergeCommitOid: 'merge-result' }],
      config: config(),
      logger: { ...noopLogger, warning },
    })

    expect(changes.map((change) => change.type)).toEqual([
      'pull-request',
      'commit',
    ])
    expect(changes[1]).toMatchObject({
      type: 'commit',
      commit: { oid: '1234567890abcdef' },
    })
    expect(warning).toHaveBeenCalledWith(
      'Skipped 1 commit because the forge could not determine its pull request association. It was omitted to prevent a potential duplicate release entry.',
    )
  })

  it('sorts pull requests and commits together by integration date', () => {
    const changes = selectChanges({
      commits: [directCommit()],
      pullRequests: [pullRequest],
      config: config(),
    })

    expect(
      sortChanges({ changes, config: config(), logger: noopLogger }).map(
        (change) => change.type,
      ),
    ).toEqual(['pull-request', 'commit'])
  })

  it('sorts dates chronologically across timezone offsets', () => {
    const changes = selectChanges({
      commits: [
        directCommit({
          oid: 'later',
          committedAt: '2026-01-02T01:00:00+01:00',
        }),
      ],
      pullRequests: [{ ...pullRequest, mergedAt: '2026-01-01T23:30:00Z' }],
      config: config({ 'sort-direction': 'ascending' }),
    })

    expect(
      sortChanges({
        changes,
        config: config({ 'sort-direction': 'ascending' }),
        logger: noopLogger,
      }).map((change) => change.type),
    ).toEqual(['pull-request', 'commit'])
  })

  it('sorts missing and invalid dates last', () => {
    const warning = vi.fn()
    const changes = [
      {
        type: 'commit' as const,
        commit: directCommit({ committedAt: undefined }),
      },
      {
        type: 'commit' as const,
        commit: directCommit({ oid: 'bad', committedAt: 'bad' }),
      },
      { type: 'pull-request' as const, pullRequest },
    ]

    expect(
      sortChanges({
        changes,
        config: config(),
        logger: { ...noopLogger, warning },
      }).map((change) =>
        change.type === 'pull-request' ? 'pr' : change.commit.oid,
      ),
    ).toEqual(['pr', '1234567890abcdef', 'bad'])
    expect(warning).toHaveBeenCalledWith(
      'Failed to parse change date "bad". Sorting it last.',
    )
  })

  it('renders generic and commit-specific variables', () => {
    expect(
      changeToString({
        changes: [{ type: 'commit', commit: directCommit() }],
        commits: [directCommit()],
        serverUrl: 'https://example.test',
        config: config({
          'commit-template':
            '$CHANGE_TYPE $CHANGE_TITLE $CHANGE_REFERENCE $COMMIT_BODY $COMMIT_AUTHORED_DATE $COMMIT_COMMITTED_DATE $CHANGE_AUTHORS',
        }),
      }),
    ).toBe(
      'commit feat(core): add commits [`1234567`](https://example.test/owner/repo/commit/1234567890abcdef) Rendered from the commit body. 2026-01-01T00:00:00Z 2026-01-02T00:00:00Z @commit-author',
    )
  })

  it('includes direct commit coauthors from trailers', () => {
    const commit = directCommit({
      message:
        'feat: collaborate\n\nCo-authored-by: Grace Hopper <grace@example.com>',
    })

    expect(
      changeToString({
        changes: [{ type: 'commit', commit }],
        commits: [commit],
        serverUrl: 'https://example.test',
        config: config({ 'commit-template': '$CHANGE_AUTHORS' }),
      }),
    ).toBe('@commit-author, Grace Hopper')
  })

  it('deduplicates direct contributors by email when their names change', () => {
    const first = directCommit({
      oid: 'first',
      author: { name: 'J. Doe', email: 'person@example.com' },
    })
    const second = directCommit({
      oid: 'second',
      author: { name: 'Jane Doe', email: 'person@example.com' },
    })

    expect(
      generateContributorsSentence({
        commits: [first, second],
        changes: [
          { type: 'commit', commit: first },
          { type: 'commit', commit: second },
        ],
        serverUrl: 'https://example.test',
        config: config(),
      }),
    ).toBe('Jane Doe')
  })

  it('renders a primary direct commit author as a new contributor', () => {
    const commit = directCommit()

    expect(
      generateNewContributorsList({
        changes: [{ type: 'commit', commit }],
        newContributorLogins: new Set(),
        newCommitContributors: [{ login: 'commit-author' }],
        config: config(),
      }),
    ).toBe(
      '* @commit-author made their first contribution in [`1234567`](https://example.test/owner/repo/commit/1234567890abcdef)',
    )
  })

  it('excludes pre-filtered changes from new contributors', () => {
    const commit = directCommit({ message: 'docs: excluded change' })

    expect(
      generateNewContributorsList({
        changes: [{ type: 'commit', commit }],
        newContributorLogins: new Set(),
        newCommitContributors: [{ login: 'commit-author' }],
        config: config({
          categories: [
            {
              type: 'pre-exclude',
              when: { conventional: { type: 'docs' } },
            },
          ],
        }),
      }),
    ).toBe('* No new contributors')
  })

  it('uses the same selected changes for changelog, versioning, and contributors', async () => {
    const resolveCommitish = vi.fn().mockResolvedValue('main')
    const result = await buildReleasePayload({
      adapter: { resolveCommitish },
      commits: [directCommit()],
      pullRequests: [pullRequest],
      config: config(),
      input: { publish: false },
      lastRelease: { id: 1, tagName: 'v1.0.0' },
      logger: noopLogger,
      repository: {
        owner: 'owner',
        name: 'repo',
        serverUrl: 'https://example.test',
      },
    })

    expect(result.body).toContain('## Features')
    expect(result.body).toContain(
      '* feat(core): add commits ([`1234567`](https://example.test/owner/repo/commit/1234567890abcdef)) @commit-author',
    )
    expect(result.body).toContain('## Fixes')
    expect(result.body).toContain('* fix: repair releases (#42) @pr-author')
    expect(result.body).toContain('@commit-author')
    expect(result.resolvedVersion).toBe('1.1.0')
  })

  it('infers labels from autolabeler rules for direct commits using commit message only', async () => {
    const gitmojiConfig = config({
      categories: [
        {
          title: '✨ Features',
          'semver-increment': 'minor',
          when: { label: 'sparkles' },
        },
        {
          title: '🐛 Bug Fixes',
          'semver-increment': 'patch',
          when: { label: 'bug' },
        },
      ],
      autolabeler: [
        {
          label: 'sparkles',
          title: ['/^(:sparkles:|✨)/'],
          branch: ['/^feat/i'],
        },
        {
          label: 'bug',
          title: ['/^(:bug:|🐛)/'],
          branch: ['/^fix/i'],
        },
      ],
    })

    const directGitmojiCommit = directCommit({
      message: '✨ add awesome new feature\n\nDetailed description of feature.',
    })

    const resolveCommitish = vi.fn().mockResolvedValue('main')
    const result = await buildReleasePayload({
      adapter: { resolveCommitish },
      commits: [directGitmojiCommit],
      pullRequests: [],
      config: gitmojiConfig,
      input: { publish: false },
      lastRelease: { id: 1, tagName: 'v1.0.0' },
      logger: noopLogger,
      repository: {
        owner: 'owner',
        name: 'repo',
        serverUrl: 'https://example.test',
      },
    })

    expect(result.body).toContain('## ✨ Features')
    expect(result.body).toContain('✨ add awesome new feature')
    expect(result.resolvedVersion).toBe('1.1.0')
  })

  it('does NOT infer branch rules on direct commits', async () => {
    const branchOnlyConfig = config({
      categories: [
        {
          title: 'Features',
          'semver-increment': 'minor',
          when: { label: 'feature' },
        },
      ],
      autolabeler: [
        {
          label: 'feature',
          branch: ['/.*feature.*/i'],
        },
      ],
    })

    const commit = directCommit({
      message: 'ordinary commit without feature keyword',
    })

    const resolveCommitish = vi.fn().mockResolvedValue('main')
    const result = await buildReleasePayload({
      adapter: { resolveCommitish },
      commits: [commit],
      pullRequests: [],
      config: branchOnlyConfig,
      input: { publish: false },
      lastRelease: { id: 1, tagName: 'v1.0.0' },
      logger: noopLogger,
      repository: {
        owner: 'owner',
        name: 'repo',
        serverUrl: 'https://example.test',
      },
    })

    // Should NOT be categorized under Features and should not trigger a minor bump
    expect(result.body).not.toContain('## Features')
    expect(result.resolvedVersion).toBe('1.0.1')
  })

  it('infers labels on PRs from branch name, commit message, and title', async () => {
    const prConfig = config({
      categories: [
        {
          title: 'Features',
          'semver-increment': 'minor',
          when: { label: 'feature' },
        },
        {
          title: 'Bug Fixes',
          'semver-increment': 'patch',
          when: { label: 'bug' },
        },
      ],
      autolabeler: [
        {
          label: 'feature',
          branch: ['/^feature\\//i'],
        },
        {
          label: 'bug',
          title: ['/^fix:/i'],
        },
      ],
    })

    const branchMatchedPR: PullRequest = {
      ...pullRequest,
      number: 101,
      title: 'some non-descriptive title',
      headRefName: 'feature/new-api',
      labels: [],
    }

    const titleMatchedPR: PullRequest = {
      ...pullRequest,
      number: 102,
      title: 'fix: resolve edge-case crash',
      headRefName: 'patch-1',
      labels: [],
    }

    const resolveCommitish = vi.fn().mockResolvedValue('main')
    const result = await buildReleasePayload({
      adapter: { resolveCommitish },
      commits: [],
      pullRequests: [branchMatchedPR, titleMatchedPR],
      config: prConfig,
      input: { publish: false },
      lastRelease: { id: 1, tagName: 'v1.0.0' },
      logger: noopLogger,
      repository: {
        owner: 'owner',
        name: 'repo',
        serverUrl: 'https://example.test',
      },
    })

    expect(result.body).toContain('## Features')
    expect(result.body).toContain('* some non-descriptive title (#101)')
    expect(result.body).toContain('## Bug Fixes')
    expect(result.body).toContain('* fix: resolve edge-case crash (#102)')
    expect(result.resolvedVersion).toBe('1.1.0')
  })

  it('infers labels from autolabeler file rules on direct commits with changed files', async () => {
    const fileConfig = config({
      categories: [
        {
          title: 'Documentation',
          'semver-increment': 'patch',
          when: { label: 'docs' },
        },
      ],
      autolabeler: [
        {
          label: 'docs',
          files: ['docs/**', '**/*.md'],
        },
      ],
    })

    const directDocCommit = directCommit({
      message: 'update guide',
      changedFiles: ['docs/getting-started.md'],
    })

    const resolveCommitish = vi.fn().mockResolvedValue('main')
    const result = await buildReleasePayload({
      adapter: { resolveCommitish },
      commits: [directDocCommit],
      pullRequests: [],
      config: fileConfig,
      input: { publish: false },
      lastRelease: { id: 1, tagName: 'v1.0.0' },
      logger: noopLogger,
      repository: {
        owner: 'owner',
        name: 'repo',
        serverUrl: 'https://example.test',
      },
    })

    expect(result.body).toContain('## Documentation')
    expect(result.body).toContain('update guide')
    expect(result.resolvedVersion).toBe('1.0.1')
  })

  it('matches category path rules directly on commits with changed files', async () => {
    const pathConfig = config({
      categories: [
        {
          title: 'Core Engine',
          'semver-increment': 'minor',
          when: { path: 'packages/core/**' },
        },
      ],
    })

    const directCoreCommit = directCommit({
      message: 'refactor internal engine algorithm',
      changedFiles: ['packages/core/src/index.ts'],
    })

    const resolveCommitish = vi.fn().mockResolvedValue('main')
    const result = await buildReleasePayload({
      adapter: { resolveCommitish },
      commits: [directCoreCommit],
      pullRequests: [],
      config: pathConfig,
      input: { publish: false },
      lastRelease: { id: 1, tagName: 'v1.0.0' },
      logger: noopLogger,
      repository: {
        owner: 'owner',
        name: 'repo',
        serverUrl: 'https://example.test',
      },
    })

    expect(result.body).toContain('## Core Engine')
    expect(result.body).toContain('refactor internal engine algorithm')
    expect(result.resolvedVersion).toBe('1.1.0')
  })
})
