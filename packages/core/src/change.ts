import { createPathMatcher } from './path-matcher.ts'
import type {
  Change,
  Commit,
  CommitAuthor,
  ParsedAutolabelerRule,
} from './types.ts'

export const splitCommitMessage = (message = '') => {
  const [title = '', ...body] = message.replaceAll('\r\n', '\n').split('\n')
  return { title, body: body.join('\n').replace(/^\n+/, '').trimEnd() }
}

export const changeTitle = (change: Change) =>
  change.type === 'pull-request'
    ? change.pullRequest.title
    : splitCommitMessage(change.commit.message).title || change.commit.oid

export const changeDate = (change: Change) =>
  change.type === 'pull-request'
    ? change.pullRequest.mergedAt
    : change.commit.committedAt

const testRegex = (regex: RegExp, text: string) => {
  regex.lastIndex = 0
  return regex.test(text)
}

export const inferChangeLabels = (
  change: Change,
  autolabeler: ParsedAutolabelerRule[] = [],
): string[] => {
  if (autolabeler.length === 0) return []
  const inferred = new Set<string>()

  if (change.type === 'pull-request') {
    const { pullRequest } = change
    const branch = pullRequest.headRefName ?? ''
    const title = pullRequest.title
    const body = pullRequest.body ?? ''
    const files = pullRequest.changedFiles ?? []

    for (const rule of autolabeler) {
      if (rule.files.length > 0 && files.length > 0) {
        const matches = createPathMatcher(rule.files)
        if (files.some(matches)) {
          inferred.add(rule.label)
          continue
        }
      }
      if (branch && rule.branch.some((regex) => testRegex(regex, branch))) {
        inferred.add(rule.label)
        continue
      }
      if (title && rule.title.some((regex) => testRegex(regex, title))) {
        inferred.add(rule.label)
        continue
      }
      if (body && rule.body.some((regex) => testRegex(regex, body))) {
        inferred.add(rule.label)
        continue
      }
    }
  } else {
    // Direct commits should only infer based on commit message
    const { title, body } = splitCommitMessage(change.commit.message ?? '')
    const fullMessage = change.commit.message ?? ''

    for (const rule of autolabeler) {
      if (
        (title && rule.title.some((regex) => testRegex(regex, title))) ||
        (fullMessage &&
          rule.title.some((regex) => testRegex(regex, fullMessage))) ||
        (body && rule.body.some((regex) => testRegex(regex, body)))
      ) {
        inferred.add(rule.label)
      }
    }
  }

  return [...inferred]
}

export const changeForCategory = (
  change: Change,
  autolabeler?: ParsedAutolabelerRule[],
) => {
  const inferredLabels = inferChangeLabels(change, autolabeler)

  if (change.type === 'pull-request') {
    const existingLabels = change.pullRequest.labels ?? []
    return {
      ...change.pullRequest,
      labels: [...new Set([...existingLabels, ...inferredLabels])],
    }
  }

  const { title } = splitCommitMessage(change.commit.message ?? '')
  return {
    title: title || change.commit.message,
    labels: inferredLabels,
  }
}

/** Uses adapter-provided authors when available, falling back to commit trailers. */
export const commitAuthors = (commit: Commit): CommitAuthor[] => {
  if (commit.authors) return commit.authors.filter((author) => author != null)

  const authors = commit.author ? [commit.author] : []
  const coauthorPattern = new RegExp(
    ['^Co-authored-by:', String.raw`\s*(.+?)\s*<([^>]+)>\s*$`].join(''),
    'gim',
  )
  for (const match of (commit.message ?? '').matchAll(coauthorPattern)) {
    const [, name, email] = match
    if (
      !authors.some(
        (author) =>
          (email && author.email?.toLowerCase() === email.toLowerCase()) ||
          (name && author.name === name),
      )
    ) {
      authors.push({ name, email })
    }
  }
  return authors
}

/** Returns the strongest available stable identity: login, then email, then name. */
export const commitAuthorKey = (author: CommitAuthor | null | undefined) => {
  if (author?.login) return `login:${author.login.toLowerCase()}`
  if (author?.email) return `email:${author.email.toLowerCase()}`
  if (author?.name) return `name:${author.name}`
  return undefined
}
