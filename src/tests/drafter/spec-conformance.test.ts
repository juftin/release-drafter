import { describe, expect, it } from 'vitest'
import { PRESET_CONFIGS } from '#gh-actions/common/config/presets.generated.ts'
import { configSchema } from '@release-drafter/core'
import { parseConfig } from '@release-drafter/autolabeler'
import { matchLabels } from '@release-drafter/autolabeler'
import YAML from 'yaml'

describe('GitMoji & Conventional Commits Spec Conformance', () => {
  const gitmojiConfig = configSchema.parse(YAML.parse(PRESET_CONFIGS['gitmoji']))
  const convConfig = configSchema.parse(YAML.parse(PRESET_CONFIGS['conventional-commits']))
  const hybridConfig = configSchema.parse(YAML.parse(PRESET_CONFIGS['hybrid']))

  const parsedGitmojiAutolabeler = parseConfig({
    config: { autolabeler: gitmojiConfig.autolabeler },
    logger: { warning: () => {} },
  })
  const parsedConvAutolabeler = parseConfig({
    config: { autolabeler: convConfig.autolabeler },
    logger: { warning: () => {} },
  })
  const parsedHybridAutolabeler = parseConfig({
    config: { autolabeler: hybridConfig.autolabeler },
    logger: { warning: () => {} },
  })

  describe('GitMoji Specification (https://gitmoji.dev/specification)', () => {
    // Format: <intention> [scope?][:?] <message>
    const examples = [
      { title: '⚡️ Lazyload home screen images.', expectedGitmoji: 'zap' },
      { title: '🐛 Fix onClick event handler', expectedGitmoji: 'bug' },
      { title: '🔖 Bump version 1.2.0', expectedGitmoji: 'bookmark' },
      { title: '♻️ (components): Transform classes to hooks', expectedGitmoji: 'recycle' },
      { title: '✨ (ui) Add button', expectedGitmoji: 'sparkles' },
      { title: ':sparkles: Add feature', expectedGitmoji: 'sparkles' },
      { title: ':sparkles: (ui): Add button', expectedGitmoji: 'sparkles' },
      { title: '💥 Break existing API', expectedGitmoji: 'boom' },
      { title: ':boom: (db): Drop deprecated tables', expectedGitmoji: 'boom' },
    ]

    for (const { title, expectedGitmoji } of examples) {
      it(`matches gitmoji title: "${title}"`, () => {
        const gitmojiResult = matchLabels({
          config: parsedGitmojiAutolabeler,
          pullRequest: { files: [], branch: 'main', title, body: null },
        })
        expect(gitmojiResult.labels).toContain(expectedGitmoji)

        const hybridResult = matchLabels({
          config: parsedHybridAutolabeler,
          pullRequest: { files: [], branch: 'main', title, body: null },
        })
        // In hybrid, boom maps to breaking or boom
        if (expectedGitmoji === 'boom') {
          expect(hybridResult.labels.some((l) => l === 'boom' || l === 'breaking')).toBe(true)
        } else {
          expect(hybridResult.labels).toContain(expectedGitmoji)
        }
      })
    }
  })

  describe('Conventional Commits Specification (https://www.conventionalcommits.org/en/v1.0.0/)', () => {
    // Format: <type>[optional scope]: <description>
    const examples = [
      { title: 'feat: add authentication', expectedLabel: 'feat' },
      { title: 'feat(auth): add OAuth2 provider', expectedLabel: 'feat' },
      { title: 'fix: resolve race condition', expectedLabel: 'fix' },
      { title: 'fix(core): handle null pointer', expectedLabel: 'fix' },
      { title: 'perf: optimize queries', expectedLabel: 'perf' },
      { title: 'docs: update README', expectedLabel: 'docs' },
      { title: 'refactor: simplify parser', expectedLabel: 'refactor' },
      { title: 'test: add unit tests', expectedLabel: 'test' },
      { title: 'chore: bump dependencies', expectedLabel: 'chore' },
      { title: 'feat!: breaking change with bang', expectedLabel: 'breaking' },
      { title: 'feat(api)!: breaking change with scope and bang', expectedLabel: 'breaking' },
      { title: '✨ feat: add new feature with gitmoji prefix', expectedLabel: 'feat' },
      { title: ':sparkles: feat(ui): add button with shortcode prefix', expectedLabel: 'feat' },
    ]

    for (const { title, expectedLabel } of examples) {
      it(`matches conventional title: "${title}"`, () => {
        const convResult = matchLabels({
          config: parsedConvAutolabeler,
          pullRequest: { files: [], branch: 'main', title, body: null },
        })
        expect(convResult.labels).toContain(expectedLabel)

        const hybridResult = matchLabels({
          config: parsedHybridAutolabeler,
          pullRequest: { files: [], branch: 'main', title, body: null },
        })
        expect(hybridResult.labels).toContain(expectedLabel)
      })
    }

    it('matches breaking change declared in PR body footer', () => {
      const convResult = matchLabels({
        config: parsedConvAutolabeler,
        pullRequest: {
          files: [],
          branch: 'main',
          title: 'feat: normal looking title',
          body: 'Some description\n\nBREAKING CHANGE: this breaks everything!',
        },
      })
      expect(convResult.labels).toContain('breaking')

      const hybridResult = matchLabels({
        config: parsedHybridAutolabeler,
        pullRequest: {
          files: [],
          branch: 'main',
          title: 'feat: normal looking title',
          body: 'Some description\n\nBREAKING CHANGE: this breaks everything!',
        },
      })
      expect(hybridResult.labels).toContain('breaking')
    })
  })

  describe('Emoji Labels Support', () => {
    it('matches emoji labels directly on categories and version-resolvers', () => {
      // Test that all presets include emoji labels (✨, :sparkles:, 🐛, :bug:, 💥, :boom:)
      for (const [name, cfg] of [
        ['gitmoji', gitmojiConfig],
        ['conventional-commits', convConfig],
        ['hybrid', hybridConfig],
      ] as const) {
        // Check Breaking category
        const breakingCat = cfg.categories.find((c) =>
          c.title?.includes('Breaking') || (c.labels && c.labels.includes('boom')),
        )
        expect(breakingCat, `${name} missing breaking category`).toBeDefined()
        expect(breakingCat?.labels).toContain('💥')
        expect(breakingCat?.labels).toContain(':boom:')

        // Check Features category
        const featureCat = cfg.categories.find((c) =>
          c.title?.includes('Feature') || (c.labels && c.labels.includes('sparkles')),
        )
        expect(featureCat, `${name} missing feature category`).toBeDefined()
        expect(featureCat?.labels).toContain('✨')
        expect(featureCat?.labels).toContain(':sparkles:')

        // Check Bug category
        const bugCat = cfg.categories.find((c) =>
          c.title?.includes('Bug') || (c.labels && c.labels.includes('bug')),
        )
        expect(bugCat, `${name} missing bug category`).toBeDefined()
        expect(bugCat?.labels).toContain('🐛')
        expect(bugCat?.labels).toContain(':bug:')

        // Check Version Resolver
        expect(cfg['version-resolver'].major.labels).toContain('💥')
        expect(cfg['version-resolver'].major.labels).toContain(':boom:')
        expect(cfg['version-resolver'].minor.labels).toContain('✨')
        expect(cfg['version-resolver'].minor.labels).toContain(':sparkles:')
        expect(cfg['version-resolver'].patch.labels).toContain('🐛')
        expect(cfg['version-resolver'].patch.labels).toContain(':bug:')
      }
    })
  })
})
