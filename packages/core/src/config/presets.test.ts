import { describe, expect, it, vi } from 'vitest'
import {
  type ConfigLogger,
  type LoadConfigOptions,
  loadConfig,
} from './load-config.ts'
import { BUILTIN_PRESETS, isBuiltinPreset } from './presets.generated.ts'

const repository = {
  owner: 'acme',
  name: 'widgets',
  serverUrl: 'https://github.com',
}

const logger = (): ConfigLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
})

const createOptions = (
  overrides: Partial<LoadConfigOptions> = {},
): LoadConfigOptions => ({
  target: 'release-drafter.yml',
  repository,
  ref: 'main',
  cwd: '/checkout',
  reader: {
    getRepositoryConfig: vi.fn(async () => 'template: safe\n'),
  },
  logger: logger(),
  ...overrides,
})

describe('core config presets', () => {
  it('defines the expected built-in presets', () => {
    expect(BUILTIN_PRESETS).toEqual([
      'conventional-commits',
      'gitmoji',
      'hybrid',
    ])
    expect(isBuiltinPreset('gitmoji')).toBe(true)
    expect(isBuiltinPreset('conventional-commits')).toBe(true)
    expect(isBuiltinPreset('hybrid')).toBe(true)
    expect(isBuiltinPreset('unknown')).toBe(false)
  })

  it('loads preset targets directly without calling the repository reader', async () => {
    const reader = {
      getRepositoryConfig: vi.fn(),
    }

    const config = await loadConfig(
      createOptions({
        target: 'preset:gitmoji',
        reader,
      }),
    )

    expect(reader.getRepositoryConfig).not.toHaveBeenCalled()
    expect(config.categories?.length).toBeGreaterThan(0)
    expect(config['tag-template']).toBe('v$RESOLVED_VERSION')
  })

  it('supports the plural "presets:" scheme alias', async () => {
    const reader = {
      getRepositoryConfig: vi.fn(),
    }

    const config = await loadConfig(
      createOptions({
        target: 'presets:conventional-commits',
        reader,
      }),
    )

    expect(reader.getRepositoryConfig).not.toHaveBeenCalled()
    expect(config.categories?.length).toBeGreaterThan(0)
  })

  it('supports inheriting from a preset via _extends', async () => {
    const reader = {
      getRepositoryConfig: vi.fn(
        async () =>
          '_extends: presets:gitmoji\ntag-template: "custom-v$RESOLVED_VERSION"\n',
      ),
    }

    const config = await loadConfig(
      createOptions({
        target: 'release-drafter.yml',
        reader,
      }),
    )

    expect(reader.getRepositoryConfig).toHaveBeenCalledOnce()
    expect(config['tag-template']).toBe('custom-v$RESOLVED_VERSION')
    expect(config.categories?.length).toBeGreaterThan(0)
  })

  it('rejects unknown presets with available preset names', async () => {
    await expect(
      loadConfig(
        createOptions({
          target: 'preset:nonexistent',
        }),
      ),
    ).rejects.toThrow(/Unknown preset "nonexistent"/)
  })

  it('falls back to the conventional-commits preset when repo and .github configs are missing', async () => {
    const notFoundError = Object.assign(new Error('Not found'), {
      configNotFound: true,
    })
    const reader = {
      getRepositoryConfig: vi.fn(async () => {
        throw notFoundError
      }),
    }
    const log = logger()

    const config = await loadConfig(
      createOptions({
        target: 'release-drafter.yml',
        reader,
        logger: log,
      }),
    )

    expect(reader.getRepositoryConfig).toHaveBeenCalledTimes(2)
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('falling back to conventional-commits preset'),
    )
    expect(config.categories?.length).toBeGreaterThan(0)
  })
})
