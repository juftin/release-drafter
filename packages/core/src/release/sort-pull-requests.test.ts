import { describe, expect, it, vi } from 'vitest'
import type { PullRequest } from '../types.ts'
import { sortPullRequests } from './sort-pull-requests.ts'

describe('sortPullRequests', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }

  const pr1: PullRequest = {
    number: 1,
    title: 'B feature',
    mergedAt: '2023-01-01T00:00:00Z',
    labels: [],
  }

  const pr2: PullRequest = {
    number: 2,
    title: 'A feature',
    mergedAt: '2023-01-02T00:00:00Z',
    labels: [],
  }

  const prNullMerged: PullRequest = {
    number: 3,
    title: 'C feature',
    mergedAt: null,
    labels: [],
  }

  it('sorts pull requests by title ascending', () => {
    const res = sortPullRequests({
      pullRequests: [pr1, pr2],
      logger,
      config: { 'sort-by': 'title', 'sort-direction': 'ascending' },
    })
    expect(res.map((p) => p.number)).toEqual([2, 1])
  })

  it('sorts pull requests by title descending', () => {
    const res = sortPullRequests({
      pullRequests: [pr1, pr2],
      logger,
      config: { 'sort-by': 'title', 'sort-direction': 'descending' },
    })
    expect(res.map((p) => p.number)).toEqual([1, 2])
  })

  it('sorts pull requests by merged_at ascending with nulls', () => {
    const res = sortPullRequests({
      pullRequests: [prNullMerged, pr1, pr2],
      logger,
      config: { 'sort-by': 'merged_at', 'sort-direction': 'ascending' },
    })
    expect(res.map((p) => p.number)).toEqual([1, 2, 3])
  })

  it('sorts pull requests by merged_at descending with nulls', () => {
    const res = sortPullRequests({
      pullRequests: [prNullMerged, pr1, pr2],
      logger,
      config: { 'sort-by': 'merged_at', 'sort-direction': 'descending' },
    })
    expect(res.map((p) => p.number)).toEqual([3, 2, 1])
  })
})
