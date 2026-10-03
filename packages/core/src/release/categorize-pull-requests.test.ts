import { describe, expect, it } from 'vitest'
import {
  commonConfigSchema,
  configSchema,
  mergeInputAndConfig,
} from '../config/index.ts'
import type { Logger } from '../ports.ts'
import type { PullRequest } from '../types.ts'
import { categorizePullRequests } from './categorize-pull-requests.ts'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warning: () => {},
  error: () => {},
}

describe('categorizePullRequests', () => {
  const config = configSchema.parse({
    template: '$CHANGES',
    commitish: 'main',
    categories: [
      {
        title: 'Features',
        labels: ['feature'],
      },
      {
        title: 'Fixes',
        labels: ['bug'],
      },
    ],
  })

  const parsedConfig = mergeInputAndConfig({
    config,
    input: commonConfigSchema.parse({}),
    logger,
  })

  const pr1: PullRequest = {
    number: 1,
    title: 'New shiny thing',
    labels: ['feature'],
  }

  const pr2: PullRequest = {
    number: 2,
    title: 'Fix issue',
    labels: ['bug'],
  }

  const pr3: PullRequest = {
    number: 3,
    title: 'Other thing',
    labels: ['chore'],
  }

  it('categorizes pull requests according to matching categories', () => {
    const [uncategorized, categorized] = categorizePullRequests({
      pullRequests: [pr1, pr2, pr3],
      config: parsedConfig,
    })

    expect(uncategorized).toEqual([pr3])
    expect(categorized[0].title).toBe('Features')
    expect(categorized[0].pullRequests).toEqual([pr1])
    expect(categorized[1].title).toBe('Fixes')
    expect(categorized[1].pullRequests).toEqual([pr2])
  })
})
