import type { DraftReleaseResult } from '@release-drafter/core'
import { isGitHubEnvironment, writeStepSummary } from '../common/summary.ts'

export { isGitHubEnvironment, writeStepSummary }

export type DrafterExplainabilityParams = {
  result: DraftReleaseResult
}

export const buildDrafterSummary = (
  params: DrafterExplainabilityParams,
): string => {
  const { result } = params
  const { plan, releasePayload, release, labels } = result

  const actionDisplay =
    plan.action === 'dry-run'
      ? '🧪 Dry Run'
      : plan.action === 'create'
        ? '✨ Created Draft'
        : '📝 Updated Draft'

  const releaseDisplayName = release?.url
    ? `[${releasePayload.name || releasePayload.tag}](${release.url})`
    : `\`${releasePayload.name || releasePayload.tag}\``

  const versionDisplay = releasePayload.resolvedVersion
    ? `\`${releasePayload.resolvedVersion}\``
    : `\`${releasePayload.tag}\``

  const lines: string[] = [
    '### 🚀 Release Drafter Summary',
    '',
    '| Release | Tag | Action | Resolved Version | Target |',
    '| :--- | :--- | :--- | :--- | :--- |',
    `| ${releaseDisplayName} | \`${releasePayload.tag}\` | ${actionDisplay} | ${versionDisplay} | \`${releasePayload.targetCommitish}\` |`,
  ]

  if (labels.length > 0) {
    lines.push(
      '',
      `**Matched Labels:** ${labels.map((l) => `\`${l}\``).join(', ')}`,
    )
  }

  if (releasePayload.body) {
    lines.push(
      '',
      '<details>',
      '<summary>📄 Preview Generated Release Notes</summary>',
      '',
      releasePayload.body,
      '',
      '</details>',
      '',
    )
  }

  return lines.join('\n')
}
