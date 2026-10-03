import { basename } from 'node:path'
import * as core from '@actions/core'
import { getConfigFile } from './get-config-file.ts'
import { normalizeFilepath } from './normalize-filepath.ts'
import { parseConfigTarget } from './parse-config-target.ts'

export const getConfigFiles = async (
  configFilename: string,
  currentContext: {
    repo: { owner: string; repo: string }
    ref: string
  },
  token?: string,
) => {
  core.debug(`getConfigFiles: Starting with filename: ${configFilename}`)
  let configTarget = parseConfigTarget(configFilename, currentContext)
  core.debug(
    `getConfigFiles: Parsed config target - scheme: ${configTarget.scheme}, filepath: ${configTarget.filepath}`,
  )

  const isCurrentRepoGithubScheme =
    configTarget.scheme === 'github' &&
    configTarget.repo?.owner === currentContext.repo.owner &&
    configTarget.repo?.repo === currentContext.repo.repo

  // No point falling back to .github if we're already running in it
  const canFallBackToOrgRepo =
    isCurrentRepoGithubScheme && currentContext.repo.repo !== '.github'

  const isDefaultConfig =
    configTarget.scheme === 'github' &&
    ['release-drafter.yml', 'release-drafter.yaml'].includes(
      basename(configTarget.filepath).toLowerCase(),
    ) &&
    isCurrentRepoGithubScheme

  let requestedRepoConfig: Awaited<ReturnType<typeof getConfigFile>>
  try {
    requestedRepoConfig = await getConfigFile(configTarget, undefined, token)
  } catch (error) {
    const isNotFound =
      error instanceof Error && error.message.includes('Config file not found')

    if (
      canFallBackToOrgRepo &&
      isNotFound &&
      configTarget.scheme === 'github'
    ) {
      core.info(
        `Config not found in ${currentContext.repo.owner}/${currentContext.repo.repo}, falling back to ${currentContext.repo.owner}/.github`,
      )
      const orgFallbackTarget = {
        ...configTarget,
        repo: { owner: currentContext.repo.owner, repo: '.github' },
        ref: undefined,
      }
      try {
        requestedRepoConfig = await getConfigFile(
          orgFallbackTarget,
          undefined,
          token,
        )
      } catch (orgError) {
        const isOrgNotFound =
          orgError instanceof Error &&
          orgError.message.includes('Config file not found')
        if (isDefaultConfig && isOrgNotFound) {
          core.info(
            `Config not found in ${currentContext.repo.owner}/${currentContext.repo.repo} or .github, falling back to hybrid preset.`,
          )
          requestedRepoConfig = await getConfigFile(
            { scheme: 'preset', filepath: 'hybrid' },
            undefined,
            token,
          )
        } else {
          throw orgError
        }
      }
    } else if (isDefaultConfig && isNotFound) {
      core.info(
        `Config not found in ${currentContext.repo.owner}/${currentContext.repo.repo}, falling back to hybrid preset.`,
      )
      requestedRepoConfig = await getConfigFile(
        { scheme: 'preset', filepath: 'hybrid' },
        undefined,
        token,
      )
    } else {
      throw error
    }
  }
  core.debug(
    `getConfigFiles: Fetched initial config from ${requestedRepoConfig.fetchedFrom.scheme}:${requestedRepoConfig.fetchedFrom.filepath}`,
  )

  const files = [requestedRepoConfig]
  let lastFetchedFrom = requestedRepoConfig.fetchedFrom
  let lastExtends = requestedRepoConfig.config._extends

  // if the configuration has no `_extends` key, we are done here.
  if (!lastExtends) {
    core.debug(
      `getConfigFiles: No _extends found in config, returning single file`,
    )
    return files
  }
  core.debug(`getConfigFiles: Found _extends directive: ${lastExtends.from}`)

  const MAX_EXTENDS_DEPTH = 33
  let extendsDepth = 0

  do {
    extendsDepth++
    core.debug(
      `getConfigFiles: Processing _extends depth ${extendsDepth}: ${lastExtends.from}`,
    )

    if (extendsDepth > MAX_EXTENDS_DEPTH) {
      const error = `Maximum extends depth (${MAX_EXTENDS_DEPTH}) exceeded. Check for circular dependencies or reduce the chain of extended configurations.`
      core.error(`getConfigFiles: ${error}`)
      throw new Error(error)
    }

    configTarget = parseConfigTarget(lastExtends.from, lastFetchedFrom)

    // Support repo-only _extends (e.g., "org/repo" or "repo") by defaulting
    // to the parent config's filename when no filepath is specified.
    if (!configTarget.filepath) {
      configTarget.filepath = basename(lastFetchedFrom.filepath)
    }

    core.debug(
      `getConfigFiles: Parsed _extends target - scheme: ${configTarget.scheme}, filepath: ${configTarget.filepath}`,
    )

    // Pre-fetch duplicate check: compute what fetchedFrom will be (same logic as
    // getConfigFile) so we can detect loops before making any network request.
    // Rules:
    //   - file: takes priority over github: for the same filepath+repo at any ref
    //     (local checkout is authoritative regardless of what ref the chain targets)
    //   - same-scheme comparisons also require a matching ref
    const normalizedFilepath = normalizeFilepath(configTarget, lastFetchedFrom)
    const preCheckTarget = { ...configTarget, filepath: normalizedFilepath }
    const alreadyLoaded = files.find(({ fetchedFrom: loadedFrom }) => {
      const sameFilepath = loadedFrom.filepath === preCheckTarget.filepath
      const sameRepo =
        loadedFrom.repo?.owner === preCheckTarget.repo?.owner &&
        loadedFrom.repo?.repo === preCheckTarget.repo?.repo
      const crossScheme =
        loadedFrom.scheme === 'file' && preCheckTarget.scheme === 'github'
      return (
        sameFilepath &&
        sameRepo &&
        (crossScheme || loadedFrom.ref === preCheckTarget.ref)
      )
    })
    if (alreadyLoaded) {
      core.warning(
        `Recursion detected. Ignoring "_extends: ${lastExtends.from}".`,
      )
      core.debug(`getConfigFiles: Recursion detected, stopping extends chain`)
      return files
    }

    const extendRepoConfig = await getConfigFile(
      configTarget,
      lastFetchedFrom,
      token,
    )
    core.debug(
      `getConfigFiles: Fetched extended config from ${extendRepoConfig.fetchedFrom.scheme}:${extendRepoConfig.fetchedFrom.filepath}`,
    )

    lastFetchedFrom = extendRepoConfig.fetchedFrom
    lastExtends = extendRepoConfig.config._extends
    files.push(extendRepoConfig)
    core.debug(
      `getConfigFiles: Added extended config to chain. Total files: ${files.length}, next _extends: ${lastExtends?.from || 'none'}`,
    )
  } while (lastExtends)
  core.debug(
    `getConfigFiles: Extends chain complete with ${files.length} file(s)`,
  )

  return files
}
