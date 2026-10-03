import type { ParsedConfig } from './config/parse-config.ts'
import { createPathMatcher } from './path-matcher.ts'

export type PullRequestFacts = {
  files: readonly string[]
  branch: string
  title: string
  body: string | null
}

export type AutolabelMatch = {
  label: string
  matcher: 'files' | 'branch' | 'title' | 'body' | 'fallback'
  pattern?: string
  matchedValue?: string
}

export type MatchLabelsResult = {
  labels: string[]
  matches: AutolabelMatch[]
  supersededLabels: string[]
}

const SEMVER_PRECEDENCE: Record<string, number> = {
  major: 3,
  minor: 2,
  patch: 1,
}

const test = (matcher: RegExp, value: string) => {
  matcher.lastIndex = 0
  return matcher.test(value)
}

const findMatchingFile = (
  patterns: readonly string[],
  files: readonly string[],
) => {
  if (patterns.length === 0) return undefined
  const matches = createPathMatcher(patterns)
  return files.find(matches)
}

/** Evaluates rules in configuration order, stopping on request or adding a fallback. */
export const matchLabels = (params: {
  config: ParsedConfig
  pullRequest: PullRequestFacts
  explainable?: boolean
}): MatchLabelsResult => {
  const { config, pullRequest, explainable = false } = params
  const labels = new Set<string>()
  const matches: AutolabelMatch[] = []

  for (const rule of config.autolabeler) {
    if (rule.fallback) continue
    const body = pullRequest.body
    let matcher: AutolabelMatch['matcher'] | undefined
    let pattern: string | undefined
    let matchedValue: string | undefined

    const matchedFile = findMatchingFile(rule.files, pullRequest.files)
    if (matchedFile !== undefined) {
      matcher = 'files'
      pattern = rule.files.join(', ')
      matchedValue = matchedFile
    } else {
      for (const regex of rule.branch) {
        if (test(regex, pullRequest.branch)) {
          matcher = 'branch'
          pattern = regex.toString()
          matchedValue = pullRequest.branch
          break
        }
      }
      if (!matcher) {
        for (const regex of rule.title) {
          if (test(regex, pullRequest.title)) {
            matcher = 'title'
            pattern = regex.toString()
            matchedValue = pullRequest.title
            break
          }
        }
      }
      if (!matcher && body != null) {
        for (const regex of rule.body) {
          if (test(regex, body)) {
            matcher = 'body'
            pattern = regex.toString()
            matchedValue = body.length > 80 ? `${body.slice(0, 77)}...` : body
            break
          }
        }
      }
    }

    if (matcher) {
      for (const label of rule.labels) {
        labels.add(label)
        matches.push(
          explainable
            ? { label, matcher, pattern, matchedValue }
            : { label, matcher },
        )
      }
      if (rule['stop-on-match']) break
    }
  }

  const fallback = config.autolabeler.find((rule) => rule.fallback)
  if (labels.size === 0 && fallback) {
    for (const label of fallback.labels) {
      labels.add(label)
      matches.push(
        explainable
          ? {
              label,
              matcher: 'fallback',
              pattern: 'fallback',
              matchedValue: 'fallback',
            }
          : { label, matcher: 'fallback' },
      )
    }
  }

  const rawLabels = [...labels]
  const matchedSemverBumps = rawLabels
    .filter((l) => l in SEMVER_PRECEDENCE)
    .sort((a, b) => SEMVER_PRECEDENCE[b] - SEMVER_PRECEDENCE[a])

  const supersededLabels = matchedSemverBumps.slice(1)
  const resolvedLabels = rawLabels.filter((l) => !supersededLabels.includes(l))

  return { labels: resolvedLabels, matches, supersededLabels }
}
