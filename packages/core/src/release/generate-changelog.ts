import { type Logger, noopLogger } from '../ports.ts'
import type { Change, Commit, ParsedConfig, PullRequest } from '../types.ts'
import { categorizeChanges } from './categorize-changes.ts'
import { changeToString } from './change-to-string.ts'
import { groupChanges } from './group-changes.ts'
import { pullRequestToString } from './pull-request-to-string.ts'
import { renderTemplate } from './render-template/index.ts'

export const generateChangeLog = (params: {
  commits?: Commit[]
  logger?: Logger
  pullRequests?: PullRequest[]
  changes?: Change[]
  serverUrl: string
  config: Pick<
    ParsedConfig,
    | 'change-title-escapes'
    | 'no-changes-template'
    | 'categories'
    | 'change-template'
    | 'pr-template'
    | 'commit-template'
    | 'change-author-template'
    | 'change-authors-separator'
    | 'change-authors-final-separator'
    | 'category-template'
    | 'group-changes'
  >
}) => {
  const {
    commits = [],
    logger = noopLogger,
    pullRequests,
    changes,
    serverUrl,
    config,
  } = params

  const allChanges: Change[] =
    changes ??
    (pullRequests ?? []).map((pullRequest) => ({
      type: 'pull-request' as const,
      pullRequest,
    }))

  const [uncategorizedChanges, categorizedChanges] = categorizeChanges({
    changes: allChanges,
    config,
  })

  const totalChangesInChangelog =
    uncategorizedChanges.length +
    categorizedChanges.reduce((sum, cat) => sum + cat.changes.length, 0)

  if (totalChangesInChangelog === 0) return config['no-changes-template']
  const changeLog: string[] = []

  const hasGroupRules = (config['group-changes'] ?? []).length > 0

  const renderChangesBucket = (
    bucketChanges: Change[],
    categoryTitle?: string,
  ): { content: string; entryCount: number } => {
    if (bucketChanges.length === 0) return { content: '', entryCount: 0 }
    if (hasGroupRules) {
      const prs = bucketChanges
        .filter(
          (c): c is { type: 'pull-request'; pullRequest: PullRequest } =>
            c.type === 'pull-request',
        )
        .map((c) => c.pullRequest)
      const directCommits = bucketChanges.filter((c) => c.type === 'commit')
      const parts: string[] = []
      let entryCount = directCommits.length
      if (prs.length > 0) {
        const grouped = groupChanges({
          pullRequests: prs,
          rules: config['group-changes'],
          logger,
        })
        entryCount += grouped.length
        parts.push(
          pullRequestToString({
            category: categoryTitle,
            changes: grouped,
            commits,
            serverUrl,
            config,
          }),
        )
      }
      if (directCommits.length > 0) {
        parts.push(
          changeToString({
            categoryTitle,
            changes: directCommits,
            commits,
            serverUrl,
            config,
          }),
        )
      }
      return { content: parts.join('\n'), entryCount }
    }

    return {
      content: changeToString({
        categoryTitle,
        changes: bucketChanges,
        commits,
        serverUrl,
        config,
      }),
      entryCount: bucketChanges.length,
    }
  }

  if (uncategorizedChanges.length > 0) {
    const rendered = renderChangesBucket(uncategorizedChanges)
    if (rendered.content) {
      changeLog.push(rendered.content, '\n\n')
    }
  }

  const nonEmptyCategories = categorizedChanges.filter(
    (category) => category.changes.length > 0,
  )
  for (const [index, category] of nonEmptyCategories.entries()) {
    const categoryTitle = renderTemplate({
      template: config['category-template'],
      object: { $TITLE: category.title },
    })
    if (categoryTitle) changeLog.push(categoryTitle, '\n\n')
    const { content: renderedString, entryCount } = renderChangesBucket(
      category.changes,
      category.title,
    )
    const shouldCollapse =
      category['collapse-after'] !== -1 &&
      entryCount > category['collapse-after']
    if (shouldCollapse) {
      changeLog.push(
        '<details>',
        '\n',
        `<summary>${entryCount} change${entryCount > 1 ? 's' : ''}</summary>`,
        '\n\n',
        renderedString,
        '\n',
        '</details>',
      )
    } else {
      changeLog.push(renderedString)
    }
    if (index + 1 !== nonEmptyCategories.length) changeLog.push('\n\n')
  }

  return changeLog.join('').trim()
}
