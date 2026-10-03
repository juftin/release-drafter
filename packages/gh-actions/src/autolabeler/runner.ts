import process from 'node:process'
import * as core from '@actions/core'
import { context } from '@actions/github'
import type { PullRequestEvent } from '@octokit/webhooks-types'
import { matchLabels } from '@release-drafter/autolabeler'
import { writeActionOutputs } from '../common/action-contract.ts'
import { getGitHubAdapter } from '../common/github.ts'
import { actionOutputNames } from './action-metadata.ts'
import {
  buildExplainabilitySummary,
  getGitmojiSpec,
  postOrUpdatePRComment,
  writeStepSummary,
} from './explainability.ts'
import { getActionInput } from './get-action-inputs.ts'
import { getConfig } from './get-config.ts'

/** Run the Autolabeler action using package-owned config and matching logic. */
export async function run(): Promise<void> {
  try {
    const input = getActionInput()
    const config = await getConfig(input['config-name'], input.token)
    core.info(
      `Running for event "${context.eventName || '[undefined]'}.${context.payload.action || '[undefined]'}"`,
    )
    if (
      context.eventName !== 'pull_request' &&
      context.eventName !== 'pull_request_target'
    ) {
      throw new Error(
        `Event type is wrong. Expected 'pull_request' or 'pull_request_target', received '${context.eventName}'`,
      )
    }

    const adapter = getGitHubAdapter(input.token)
    const payload = context.payload as PullRequestEvent
    const files = await adapter.findPullRequestChangedFiles({
      repository: {
        owner: context.repo.owner,
        name: context.repo.repo,
        serverUrl: process.env.GITHUB_SERVER_URL ?? 'https://github.com',
      },
      number: payload.number,
    })
    const result = matchLabels({
      config,
      pullRequest: {
        files,
        branch: payload.pull_request.head.ref,
        title: payload.pull_request.title,
        body: payload.pull_request.body,
      },
    })

    for (const match of result.matches)
      core.info(`Found label for ${match.matcher}: '${match.label}'`)

    if (result.labels.length > 0) {
      if (input['dry-run']) {
        core.info(
          `[dry-run] Would add labels [${result.labels.join(', ')}] to PR #${payload.number}`,
        )
      } else {
        try {
          await adapter.octokit.rest.issues.addLabels({
            ...context.repo,
            issue_number: payload.number,
            labels: result.labels,
          })
        } catch {
          for (const label of result.labels) {
            try {
              await adapter.octokit.rest.issues.addLabels({
                ...context.repo,
                issue_number: payload.number,
                labels: [label],
              })
            } catch (err) {
              const spec = getGitmojiSpec(label)
              if (spec?.code) {
                try {
                  await adapter.octokit.rest.issues.addLabels({
                    ...context.repo,
                    issue_number: payload.number,
                    labels: [spec.code],
                  })
                  continue
                } catch {
                  // ignore
                }
              }
              core.warning(
                `Could not add label '${label}' to PR #${payload.number}: ${err instanceof Error ? err.message : String(err)}`,
              )
            }
          }
        }
      }
    }

    const summaryMarkdown = buildExplainabilitySummary({
      pullRequest: {
        number: payload.number,
        title: payload.pull_request.title,
        branch: payload.pull_request.head.ref,
      },
      matches: result.matches,
      categories: config.categories,
    })

    if (input.summary) {
      await writeStepSummary(summaryMarkdown)
    }

    if (input['pr-comment']) {
      if (input['dry-run']) {
        core.info(
          `[dry-run] Would post/update PR comment on #${payload.number} with explainability summary`,
        )
      } else {
        await postOrUpdatePRComment({
          adapter,
          repo: context.repo,
          issueNumber: payload.number,
          markdown: summaryMarkdown,
        })
      }
    }

    writeActionOutputs(actionOutputNames, {
      number: payload.number.toString(),
      labels: result.labels.length > 0 ? result.labels.join(',') : undefined,
    })
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
