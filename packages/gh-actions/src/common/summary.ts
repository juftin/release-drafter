import process from 'node:process'
import * as core from '@actions/core'

export const isGitHubEnvironment = (): boolean => {
  return Boolean(
    process.env.GITHUB_ACTIONS === 'true' ||
      process.env.GITHUB_STEP_SUMMARY ||
      process.env.GITHUB_REPOSITORY,
  )
}

const isMocked = (fn: unknown): boolean =>
  typeof fn === 'function' && 'mock' in fn

/** Writes markdown to the GitHub Actions Job Step Summary when GitHub is detected. */
export const writeStepSummary = async (markdown: string): Promise<void> => {
  if (!isGitHubEnvironment()) {
    return
  }
  // Prevent test executions from polluting runner step summaries with test fixtures
  if (
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') &&
    !isMocked(core.summary.write)
  ) {
    return
  }
  try {
    await core.summary.addRaw(markdown).write()
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('GITHUB_STEP_SUMMARY')
    ) {
      return
    }
    core.warning(
      `Failed to write GitHub Actions Step Summary: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
