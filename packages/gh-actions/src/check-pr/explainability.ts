import type { PullRequestEvaluation } from '@release-drafter/core'
import { isGitHubEnvironment, writeStepSummary } from '../common/summary.ts'

export { isGitHubEnvironment, writeStepSummary }

export type CheckPrExplainabilityParams = {
  pullRequest: {
    number: number
    title: string
    baseRef: string
    labels: string[]
  }
  evaluation: PullRequestEvaluation
}

export const buildCheckPrSummary = (
  params: CheckPrExplainabilityParams,
): string => {
  const { pullRequest, evaluation } = params
  const labelsDisplay =
    pullRequest.labels.length > 0
      ? pullRequest.labels.map((l) => `\`${l}\``).join(', ')
      : '_None_'

  const lines: string[] = ['### 🏷️ Release Drafter — PR Check', '']

  if (evaluation.skipped) {
    lines.push(
      '| PR | Title | Status | Labels |',
      '| :--- | :--- | :--- | :--- |',
      `| **#${pullRequest.number}** | \`${pullRequest.title}\` | ⏭️ Skipped (\`pre-exclude\`) | ${labelsDisplay} |`,
      '',
      '> [!NOTE]',
      '> Excluded by configuration rule (e.g. `skip-changelog`). No release notes will be generated.',
    )
  } else if (evaluation.valid) {
    const rulesText = `${evaluation.selectedCategoryCount} rule${evaluation.selectedCategoryCount === 1 ? '' : 's'} matched`
    lines.push(
      '| PR | Title | Status | Labels |',
      '| :--- | :--- | :--- | :--- |',
      `| **#${pullRequest.number}** | \`${pullRequest.title}\` | ✅ Valid (${rulesText}) | ${labelsDisplay} |`,
    )
  } else {
    lines.push(
      '| PR | Title | Status | Labels |',
      '| :--- | :--- | :--- | :--- |',
      `| **#${pullRequest.number}** | \`${pullRequest.title}\` | ❌ Invalid | ${labelsDisplay} |`,
      '',
      '> [!WARNING]',
      '> **To resolve:** Ensure the pull request title, branch, or applied labels match at least one configured category or version-resolver rule.',
    )
  }

  return lines.join('\n')
}
