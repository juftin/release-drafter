import * as core from '@actions/core'
import { type Config, configSchema } from '@release-drafter/core'
import { composeConfigGet } from './index.ts'

/** Load and validate the standard Release Drafter configuration. */
export const getReleaseDrafterConfig = async (
  configName: string,
  currentContext: {
    repo: { owner: string; repo: string }
    ref: string
  },
  token?: string,
): Promise<Config> => {
  const { config, contexts } = await composeConfigGet(
    configName,
    currentContext,
    token,
  )
  contexts.forEach(({ filepath, ref, repo, scheme }) => {
    const remotePath = repo
      ? `${repo.owner}/${repo.repo}/${filepath}${ref ? `@${ref}` : ''}`
      : filepath
    const location =
      scheme === 'file'
        ? `locally from "${filepath}"`
        : scheme === 'preset'
          ? `from preset "${filepath}"`
          : `from "${remotePath}"${ref ? '' : ' on the default branch'}`
    core.info(`Config fetched ${location}.`)
  })
  return configSchema.parse(config)
}
