import * as core from '@actions/core'
import type { AutolabelMatch } from '@release-drafter/autolabeler'
import type { GitHubAdapter } from '@release-drafter/github-adapter'
import {
  GITMOJI_SPEC_DATA,
  type GitmojiSpecEntry,
} from '../common/config/presets.generated.ts'

export const COMMENT_MARKER = '<!-- release-drafter-autolabeler-summary -->'

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
      '## 🏷️ Autolabeler & Semver Summary',
      '',
      `No autolabeler rules matched Pull Request **#${pullRequest.number}** (\`${pullRequest.branch}\`).`,
      '',
    ].join('\n')
  }

  let highestBump: 'patch' | 'minor' | 'major' = 'patch'
  const matchedLabels = new Set(matches.map((m) => m.label))

  for (const match of matches) {
    const spec = getGitmojiSpec(match.label)
    const semver = resolveSemverBump(match.label, spec)
    if (PRIORITY[semver] > PRIORITY[highestBump]) {
      highestBump = semver
    }
  }

  const rows: string[] = []
  for (const match of matches) {
    const spec = getGitmojiSpec(match.label)
    const semver = resolveSemverBump(match.label, spec)
    const isSuperseded = supersededLabels?.includes(match.label)

    // Only Preset gitmoji labels have a linked intention
    const intention = spec
      ? `[${spec.description}](https://gitmoji.dev/specification)`
      : '-'

    const trigger =
      match.matcher === 'files'
        ? 'Files'
        : match.matcher === 'branch'
          ? 'Branch'
          : match.matcher === 'title'
            ? 'Title'
            : 'Body'

    const patternEscaped = match.pattern
      ? `\`${match.pattern.replace(/\|/g, '\\|')}\``
      : '-'
    const valueEscaped = match.matchedValue
      ? `\`${match.matchedValue.replace(/\|/g, '\\|')}\``
      : '-'

    const details =
      match.matcher === 'files'
        ? `Pattern ${patternEscaped} matched file ${valueEscaped}`
        : `${trigger} ${valueEscaped} matched ${patternEscaped}`

    const semverDisplay = isSuperseded
      ? `\`${semver}\` *(superseded by \`${highestBump}\`)*`
      : `\`${semver}\``

    rows.push(
      `| \`${match.label}\` | ${intention} | ${semverDisplay} | ${trigger} | ${details} |`,
    )
  }

  const sections: string[] = []
  if (categories && categories.length > 0) {
    for (const cat of categories) {
      if (cat.labels.some((l) => matchedLabels.has(l))) {
        sections.push(`- ${cat.title}`)
      }
    }
  }

  const appliedCount = appliedLabels ? appliedLabels.length : matches.length
  const lines = [
    '## 🏷️ Autolabeler & Semver Summary',
    '',
    `Applied **${appliedCount}** label(s) to Pull Request **#${pullRequest.number}** (\`${pullRequest.branch}\`):`,
    '',
    '| Label | Gitmoji Intention | Semver Impact | Trigger | Matched Details |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...rows,
    '',
    '### 🚀 Release Impact',
    `- **Calculated Version Increment:** \`${highestBump}\``,
  ]

  if (supersededLabels && supersededLabels.length > 0) {
    lines.push(
      `- **Superseded Bump Label(s):** ${supersededLabels.map((l) => `\`${l}\``).join(', ')} (superseded by \`${highestBump}\`)`,
    )
  }

  if (sections.length > 0) {
    lines.push('- **Target Changelog Section(s):**', ...sections)
  }

  lines.push('')
  return lines.join('\n')
}

/** Writes the explainability summary table to the GitHub Actions Job Step Summary. */
export const writeStepSummary = async (markdown: string): Promise<void> => {
  try {
    await core.summary.addRaw(markdown).write()
  } catch (error) {
    core.warning(
      `Failed to write GitHub Actions Step Summary: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** Posts or updates an explainability comment on the pull request. */
export const postOrUpdatePRComment = async (params: {
  adapter: GitHubAdapter
  repo: { owner: string; repo: string }
  issueNumber: number
  markdown: string
}): Promise<void> => {
  const { adapter, repo, issueNumber, markdown } = params
  const fullBody = `${COMMENT_MARKER}\n${markdown}`

  try {
    const comments = await adapter.octokit.rest.issues.listComments({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issueNumber,
    })

    const existing = comments.data.find((c) => c.body?.includes(COMMENT_MARKER))

    if (existing) {
      await adapter.octokit.rest.issues.updateComment({
        owner: repo.owner,
        repo: repo.repo,
        comment_id: existing.id,
        body: fullBody,
      })
      core.info(
        `Updated existing explainability comment #${existing.id} on PR #${issueNumber}.`,
      )
    } else {
      const created = await adapter.octokit.rest.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: issueNumber,
        body: fullBody,
      })
      core.info(
        `Posted new explainability comment #${created.data.id} on PR #${issueNumber}.`,
      )
    }
  } catch (error) {
    core.warning(
      `Failed to post or update pull request explainability comment: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
