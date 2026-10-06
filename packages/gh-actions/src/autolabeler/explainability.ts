import type { AutolabelMatch } from '@release-drafter/autolabeler'
import {
  GITMOJI_SPEC_DATA,
  type GitmojiSpecEntry,
} from '../common/config/presets.generated.ts'
import { isGitHubEnvironment, writeStepSummary } from '../common/summary.ts'

export { isGitHubEnvironment, writeStepSummary }

const GITMOJI_SPEC_MAP = new Map<string, GitmojiSpecEntry>()

for (const entry of GITMOJI_SPEC_DATA) {
  GITMOJI_SPEC_MAP.set(entry.name, entry)
  GITMOJI_SPEC_MAP.set(entry.code, entry)
  GITMOJI_SPEC_MAP.set(entry.emoji, entry)
  if (entry.emoji.includes('\ufe0f')) {
    GITMOJI_SPEC_MAP.set(entry.emoji.replace(/\ufe0f/g, ''), entry)
  }
}

/** Looks up Gitmoji specification entry for a preset gitmoji label. */
export const getGitmojiSpec = (label: string): GitmojiSpecEntry | undefined => {
  return GITMOJI_SPEC_MAP.get(label)
}

const resolveSemverBump = (
  label: string,
  spec?: GitmojiSpecEntry,
): 'major' | 'minor' | 'patch' => {
  if (spec?.semver) return spec.semver
  if (label === 'major' || label === 'breaking' || label === 'breaking-change')
    return 'major'
  if (label === 'minor' || label === 'feat' || label === 'feature')
    return 'minor'
  return 'patch'
}

const PRIORITY = { patch: 1, minor: 2, major: 3 } as const

export type ExplainabilityParams = {
  pullRequest: {
    number: number
    title: string
    branch: string
  }
  matches: readonly AutolabelMatch[]
  appliedLabels?: readonly string[]
  supersededLabels?: readonly string[]
  categories?: Array<{ title: string; labels: string[] }>
  configName?: string
  isGitmojiPreset?: boolean
}

/**
 * Builds a markdown explainability summary of the autolabeler decisions.
 * Only preset Gitmoji labels receive a linked intention from the Gitmoji specification.
 */
export const buildExplainabilitySummary = (
  params: ExplainabilityParams,
): string => {
  const { pullRequest, matches, appliedLabels, supersededLabels, categories } =
    params

  if (matches.length === 0) {
    return [
      '## 🏷️ Release Drafter Summary',
      '',
      `No autolabeler rules matched Pull Request **#${pullRequest.number}** (\`${pullRequest.branch}\`).`,
      '',
    ].join('\n')
  }

  let highestBump: 'patch' | 'minor' | 'major' = 'patch'
  const matchedLabels = new Set(matches.map((m) => m.label))

  const titleMatches = new Set<string>()
  const branchMatches = new Set<string>()
  const fileMatches = new Set<string>()
  const bodyMatches = new Set<string>()

  for (const match of matches) {
    const spec = getGitmojiSpec(match.label)
    const semver = resolveSemverBump(match.label, spec)
    if (PRIORITY[semver] > PRIORITY[highestBump]) {
      highestBump = semver
    }
    if (match.matchedValue) {
      if (match.matcher === 'title') titleMatches.add(match.matchedValue)
      if (match.matcher === 'branch') branchMatches.add(match.matchedValue)
      if (match.matcher === 'files') fileMatches.add(match.matchedValue)
      if (match.matcher === 'body') bodyMatches.add(match.matchedValue)
    }
  }

  const matchCallouts: string[] = []
  if (titleMatches.size > 0) {
    for (const val of titleMatches) {
      matchCallouts.push(`- **Matched Title:** \`${val}\``)
    }
  }
  if (branchMatches.size > 0) {
    for (const val of branchMatches) {
      matchCallouts.push(`- **Matched Branch:** \`${val}\``)
    }
  }
  if (fileMatches.size > 0) {
    const files = [...fileMatches]
    const maxFiles = 5
    matchCallouts.push('- **Matched Files:**')
    const shown = files.slice(0, maxFiles)
    for (const f of shown) {
      matchCallouts.push(`  - \`${f}\``)
    }
    if (files.length > maxFiles) {
      matchCallouts.push(`  - *(and ${files.length - maxFiles} more)*`)
    }
  }
  if (bodyMatches.size > 0) {
    for (const val of bodyMatches) {
      matchCallouts.push(`- **Matched Body:** \`${val}\``)
    }
  }

  const isGitmoji =
    params.isGitmojiPreset ??
    (params.configName
      ? /gitmoji/i.test(params.configName)
      : matches.some((m) => getGitmojiSpec(m.label) !== undefined))

  const rows: string[] = []
  for (const match of matches) {
    if (supersededLabels?.includes(match.label)) {
      continue
    }

    const spec = getGitmojiSpec(match.label)
    const semver = resolveSemverBump(match.label, spec)

    const trigger =
      match.matcher === 'files'
        ? 'Files'
        : match.matcher === 'branch'
          ? 'Branch'
          : match.matcher === 'title'
            ? 'Title'
            : match.matcher === 'body'
              ? 'Body'
              : 'Fallback'

    const patternEscaped = match.pattern
      ? `\`${match.pattern.replace(/\|/g, '\\|')}\``
      : '-'

    const details =
      match.matcher === 'files'
        ? `Files matched pattern ${patternEscaped}`
        : `${trigger} matched ${patternEscaped}`

    if (isGitmoji) {
      // Only Preset gitmoji labels have a linked intention
      const intention = spec
        ? `[${spec.description}](https://gitmoji.dev/specification)`
        : '-'
      rows.push(
        `| \`${match.label}\` | ${intention} | \`${semver}\` | ${trigger} | ${details} |`,
      )
    } else {
      rows.push(
        `| \`${match.label}\` | \`${semver}\` | ${trigger} | ${details} |`,
      )
    }
  }

  const releaseSectionList: string[] = []
  if (categories && categories.length > 0) {
    const matchedSections: string[] = []
    for (const cat of categories) {
      if (cat.labels.some((l) => matchedLabels.has(l))) {
        matchedSections.push(`  - ${cat.title}`)
      }
    }
    if (matchedSections.length > 0) {
      releaseSectionList.push('- **Release Sections:**', ...matchedSections)
    }
  }

  const appliedCount = appliedLabels ? appliedLabels.length : rows.length
  const lines = [
    '## 🏷️ Release Drafter Summary',
    '',
    `Applied **${appliedCount}** label(s) to PR **#${pullRequest.number}** (\`${pullRequest.branch}\`) with **\`${highestBump}\`** version increment.`,
    '',
    ...matchCallouts,
    ...releaseSectionList,
  ]

  const tableHeader = isGitmoji
    ? [
        '| Label | Gitmoji Intention | Semver Impact | Trigger | Matched Rule |',
        '| :--- | :--- | :--- | :--- | :--- |',
      ]
    : [
        '| Label | Semver Impact | Trigger | Matched Rule |',
        '| :--- | :--- | :--- | :--- |',
      ]

  lines.push(
    '',
    '<details>',
    '<summary>🏷️ Label Decision Details</summary>',
    '',
    ...tableHeader,
    ...rows,
    '',
    '</details>',
    '',
  )

  return lines.join('\n')
}
