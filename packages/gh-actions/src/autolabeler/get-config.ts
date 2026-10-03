import * as core from '@actions/core'
import { context } from '@actions/github'
import {
  configSchema,
  type ParsedConfig,
  parseConfig,
} from '@release-drafter/autolabeler'
import { composeConfigGet } from '../common/config/index.ts'

export const getConfig = async (
  configName: string,
  token?: string,
): Promise<ParsedConfig> => {
  const { config, contexts } = await composeConfigGet(
    configName,
    context,
    token,
  )
  if (contexts.length > 1) {
    core.info(`Config was fetched from ${contexts.length} different contexts.`)
  } else if (contexts.length === 1) {
    const source = contexts[0]
    let location: string
    if (source.scheme === 'preset') {
      location = `from preset "${source.filepath}"`
    } else if (source.scheme === 'file') {
      location = 'locally'
    } else {
      location = `on remote "${source.repo?.owner}/${source.repo?.repo}${source.ref ? `@${source.ref}` : ''}"${source.ref ? '' : ' on the default branch'}`
    }
    core.info(`Config fetched ${location}.`)
  }
  return parseConfig({ config: configSchema.parse(config), logger: core })
}
