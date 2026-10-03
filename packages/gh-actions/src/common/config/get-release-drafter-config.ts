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
    let location: string
    if (scheme === 'preset') {
      location = `from preset "${filepath}"`
    } else if (scheme === 'file') {
      location = `locally from "${filepath}"`
    } else {
      const remotePath = `${repo?.owner}/${repo?.repo}/${filepath}${ref ? `@${ref}` : ''}`
      location = `from "${remotePath}"${ref ? '' : ' on the default branch'}`
    }
    core.info(`Config fetched ${location}.`)
  })
  return configSchema.parse(config)
}
