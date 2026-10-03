import { describe, expect, it, vi } from 'vitest'
import type { Change } from '../types.ts'
import { sortChanges } from './sort-changes.ts'

describe('sortChanges', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }

  const change1: Change = {
    type: 'pull-request',
    pullRequest: {
      number: 1,
      title: 'B feature',
      mergedAt: '2023-01-01T00:00:00Z',
      labels: [],
    },
  }

  const change2: Change = {
    type: 'pull-request',
    pullRequest: {
      number: 2,
      title: 'A feature',
      mergedAt: '2023-01-02T00:00:00Z',
      labels: [],
    },
  }

  const changeCommit: Change = {
    type: 'commit',
    commit: {
      oid: '1234567890abcdef',
      message: 'C commit',
      committedAt: 'not-a-valid-date',
    },
  }

  it('sorts changes by title ascending and descending', () => {
    const asc = sortChanges({
      changes: [change1, change2],
      logger,
      config: { 'sort-by': 'title', 'sort-direction': 'ascending' },
    })
    expect(
      asc.map((c) =>
        c.type === 'pull-request' ? c.pullRequest.number : c.commit.oid,
      ),
    ).toEqual([2, 1])

    const desc = sortChanges({
      changes: [change1, change2],
      logger,
      config: { 'sort-by': 'title', 'sort-direction': 'descending' },
    })
    expect(
      desc.map((c) =>
        c.type === 'pull-request' ? c.pullRequest.number : c.commit.oid,
      ),
    ).toEqual([1, 2])
  })

  it('sorts changes by date with invalid dates sorted last', () => {
    const asc = sortChanges({
      changes: [changeCommit, change1, change2],
      logger,
      config: { 'sort-by': 'date', 'sort-direction': 'ascending' },
    })
    expect(
      asc.map((c) =>
        c.type === 'pull-request' ? c.pullRequest.number : c.commit.oid,
      ),
    ).toEqual([1, 2, '1234567890abcdef'])
  })
})
