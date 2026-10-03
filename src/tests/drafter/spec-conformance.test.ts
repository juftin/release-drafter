import {
  configSchema as autolabelerConfigSchema,
  matchLabels,
  parseConfig,
} from '@release-drafter/autolabeler'
import { configSchema } from '@release-drafter/core'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { PRESET_CONFIGS } from '#gh-actions/common/config/presets.generated.ts'

describe('GitMoji & Conventional Commits Spec Conformance', () => {
  const gitmojiConfig = configSchema.parse(YAML.parse(PRESET_CONFIGS.gitmoji))
  const convConfig = configSchema.parse(
    YAML.parse(PRESET_CONFIGS['conventional-commits']),
  )
  const hybridConfig = configSchema.parse(YAML.parse(PRESET_CONFIGS.hybrid))

  const parsedGitmojiAutolabeler = parseConfig({
    config: autolabelerConfigSchema.parse(YAML.parse(PRESET_CONFIGS.gitmoji)),
    logger: { warning: () => {} },
  })
  const parsedConvAutolabeler = parseConfig({
    config: autolabelerConfigSchema.parse(
      YAML.parse(PRESET_CONFIGS['conventional-commits']),
    ),
    logger: { warning: () => {} },
  })
  const parsedHybridAutolabeler = parseConfig({
    config: autolabelerConfigSchema.parse(YAML.parse(PRESET_CONFIGS.hybrid)),
    logger: { warning: () => {} },
  })

  describe('GitMoji Specification (https://gitmoji.dev/specification)', () => {
    // Format: <intention> [scope?][:?] <message>
    const examples = [
      { title: '⚡️ Lazyload home screen images.', expectedEmoji: '⚡️' },
      { title: '🐛 Fix onClick event handler', expectedEmoji: '🐛' },
      { title: '🔖 Bump version 1.2.0', expectedEmoji: '🔖' },
      {
        title: '♻️ (components): Transform classes to hooks',
        expectedEmoji: '♻️',
      },
      { title: '✨ (ui) Add button', expectedEmoji: '✨' },
      { title: ':sparkles: Add feature', expectedEmoji: '✨' },
      { title: ':sparkles: (ui): Add button', expectedEmoji: '✨' },
      { title: '💥 Break existing API', expectedEmoji: '💥' },
      { title: ':boom: (db): Drop deprecated tables', expectedEmoji: '💥' },
    ]

    for (const { title, expectedEmoji } of examples) {
      it(`matches gitmoji title: "${title}"`, () => {
        const gitmojiResult = matchLabels({
          config: parsedGitmojiAutolabeler,
          pullRequest: { files: [], branch: 'main', title, body: null },
        })
        expect(Array.from(gitmojiResult.labels)).toContain(expectedEmoji)

        const hybridResult = matchLabels({
          config: parsedHybridAutolabeler,
          pullRequest: { files: [], branch: 'main', title, body: null },
        })
        expect(Array.from(hybridResult.labels)).toContain(expectedEmoji)
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
      {
        title: 'feat(api)!: breaking change with scope and bang',
        expectedLabel: 'breaking',
      },
      {
        title: '✨ feat: add new feature with gitmoji prefix',
        expectedLabel: 'feat',
      },
      {
        title: ':sparkles: feat(ui): add button with shortcode prefix',
        expectedLabel: 'feat',
      },
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

        if (title.startsWith('✨') || title.startsWith(':sparkles:')) {
          expect(hybridResult.labels).toContain('✨')
        } else {
          expect(hybridResult.labels).toContain(expectedLabel)
        }
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

  describe('Emoji & Word Labels Separation', () => {
    it('gitmoji preset uses emoji labels, no shortcodes or conventional words', () => {
      // Categories in gitmoji preset must only have emoji labels
      const SEMVER_LABELS = new Set(['major', 'minor', 'patch'])

      for (const cat of gitmojiConfig.categories) {
        if (cat.labels) {
          for (const l of cat.labels) {
            expect(l).not.toMatch(/^:[a-z0-9_]+:$/) // no shortcodes
            if (!SEMVER_LABELS.has(l)) {
              expect(l).not.toMatch(/^[a-z_-]+$/i) // no other word labels
            }
          }
        }
      }

      // Autolabeler in gitmoji preset emits emoji labels + standard semver labels
      for (const rule of gitmojiConfig.autolabeler ?? []) {
        if (!rule.label) continue
        expect(rule.label).not.toMatch(/^:[a-z0-9_]+:$/)
        if (!SEMVER_LABELS.has(rule.label)) {
          expect(rule.label).not.toMatch(/^[a-z_-]+$/i)
        }
      }

      // Check specific categories and version resolvers have both semver words and emojis
      expect(gitmojiConfig['version-resolver'].major.labels).toContain('major')
      expect(gitmojiConfig['version-resolver'].major.labels).toContain('💥')
      expect(gitmojiConfig['version-resolver'].minor.labels).toContain('minor')
      expect(gitmojiConfig['version-resolver'].minor.labels).toContain('✨')
      expect(gitmojiConfig['version-resolver'].patch.labels).toContain('patch')
      expect(gitmojiConfig['version-resolver'].patch.labels).toContain('🐛')
    })

    it('conventional preset uses word labels and does NOT give emoji labels', () => {
      // Categories in conventional preset must only have word labels
      for (const cat of convConfig.categories) {
        if (cat.labels) {
          for (const l of cat.labels) {
            expect(l).not.toMatch(/^:[a-z0-9_]+:$/)
            expect(l).toMatch(/^[a-z0-9_-]+$/i) // strictly words/slugs
          }
        }
      }

      // Autolabeler in conventional preset must NOT emit emoji labels
      for (const rule of convConfig.autolabeler ?? []) {
        expect(rule.label).toMatch(/^[a-z0-9_-]+$/i) // strictly words/slugs
      }

      // Version resolver must only have words
      expect(convConfig['version-resolver'].major.labels).toContain('major')
      expect(convConfig['version-resolver'].major.labels).toContain('breaking')
      expect(convConfig['version-resolver'].minor.labels).toContain('minor')
      expect(convConfig['version-resolver'].minor.labels).toContain('feat')
      expect(convConfig['version-resolver'].patch.labels).toContain('patch')
      expect(convConfig['version-resolver'].patch.labels).toContain('fix')
    })

    it('hybrid preset accepts both word and emoji labels', () => {
      expect(hybridConfig['version-resolver'].major.labels).toContain('major')
      expect(hybridConfig['version-resolver'].major.labels).toContain(
        'breaking',
      )
      expect(hybridConfig['version-resolver'].major.labels).toContain('💥')
      expect(hybridConfig['version-resolver'].minor.labels).toContain('minor')
      expect(hybridConfig['version-resolver'].minor.labels).toContain('feat')
      expect(hybridConfig['version-resolver'].minor.labels).toContain('✨')
      expect(hybridConfig['version-resolver'].patch.labels).toContain('patch')
      expect(hybridConfig['version-resolver'].patch.labels).toContain('fix')
      expect(hybridConfig['version-resolver'].patch.labels).toContain('🐛')
    })

    it('gitmoji autolabeler produces emoji labels and semver label', () => {
      const result = matchLabels({
        config: parsedGitmojiAutolabeler,
        pullRequest: {
          files: [],
          title: ':sparkles: Add awesome feature',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(result.labels)).toContain('✨')
      expect(Array.from(result.labels)).toContain('minor')
    })

    it('conventional autolabeler produces word labels and semver label', () => {
      const result = matchLabels({
        config: parsedConvAutolabeler,
        pullRequest: {
          files: [],
          title: 'feat: add awesome feature',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(result.labels)).toContain('feat')
      expect(Array.from(result.labels)).toContain('minor')
    })
  })

  describe('File-Based Autolabeling & Exclusions', () => {
    it('contains exclude-labels across all presets', () => {
      for (const [name, cfg] of [
        ['gitmoji', gitmojiConfig],
        ['conventional-commits', convConfig],
        ['hybrid', hybridConfig],
      ] as const) {
        expect(
          cfg['exclude-labels'],
          `${name} missing exclude-labels`,
        ).toContain('skip-changelog')
        expect(
          cfg['exclude-labels'],
          `${name} missing exclude-labels`,
        ).toContain('skip-release')
      }
    })

    it('autolabels .github changes as ci (or 👷) across presets', () => {
      // Gitmoji autolabels .github as 👷
      const gitmojiResult = matchLabels({
        config: parsedGitmojiAutolabeler,
        pullRequest: {
          files: ['.github/workflows/release.yml'],
          title: 'update workflow',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(gitmojiResult.labels)).toContain('👷')

      // Conventional autolabels .github as ci
      const convResult = matchLabels({
        config: parsedConvAutolabeler,
        pullRequest: {
          files: ['.github/workflows/release.yml'],
          title: 'update workflow',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(convResult.labels)).toContain('ci')

      // Hybrid autolabels .github as ci (and 👷)
      const hybridResult = matchLabels({
        config: parsedHybridAutolabeler,
        pullRequest: {
          files: ['.github/workflows/release.yml'],
          title: 'update workflow',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(hybridResult.labels)).toContain('ci')
      expect(Array.from(hybridResult.labels)).toContain('👷')
    })

    it('autolabels markdown and docs files as docs (or 📝) across presets', () => {
      // Gitmoji autolabels markdown as 📝
      const gitmojiResult = matchLabels({
        config: parsedGitmojiAutolabeler,
        pullRequest: {
          files: ['README.md'],
          title: 'update guide',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(gitmojiResult.labels)).toContain('📝')

      // Conventional autolabels markdown as docs
      const convResult = matchLabels({
        config: parsedConvAutolabeler,
        pullRequest: {
          files: ['README.md'],
          title: 'update guide',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(convResult.labels)).toContain('docs')

      // Hybrid autolabels markdown as docs (and 📝)
      const hybridResult = matchLabels({
        config: parsedHybridAutolabeler,
        pullRequest: {
          files: ['README.md'],
          title: 'update guide',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(hybridResult.labels)).toContain('docs')
      expect(Array.from(hybridResult.labels)).toContain('📝')
    })

    it('docs and CI/CD use their emoji representation when gitmoji is used', () => {
      // In Gitmoji preset, conventional titles docs: and ci: resolve to their emojis (📝 and 👷) plus patch
      const gitmojiDocs = matchLabels({
        config: parsedGitmojiAutolabeler,
        pullRequest: {
          files: [],
          title: 'docs: update guide',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(gitmojiDocs.labels)).toContain('📝')
      expect(Array.from(gitmojiDocs.labels)).toContain('patch')

      const gitmojiCI = matchLabels({
        config: parsedGitmojiAutolabeler,
        pullRequest: {
          files: [],
          title: 'ci: update github action',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(gitmojiCI.labels)).toContain('👷')
      expect(Array.from(gitmojiCI.labels)).toContain('patch')

      // In Hybrid preset, when gitmoji prefix is used, Docs and CI/CD resolve to emojis plus patch
      const hybridDocs = matchLabels({
        config: parsedHybridAutolabeler,
        pullRequest: {
          files: [],
          title: '📝 docs: update guide',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(hybridDocs.labels)).toContain('📝')
      expect(Array.from(hybridDocs.labels)).toContain('patch')
      expect(Array.from(hybridDocs.labels)).not.toContain('docs')

      const hybridCI = matchLabels({
        config: parsedHybridAutolabeler,
        pullRequest: {
          files: [],
          title: '👷 ci: update workflow',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(hybridCI.labels)).toContain('👷')
      expect(Array.from(hybridCI.labels)).toContain('patch')
      expect(Array.from(hybridCI.labels)).not.toContain('ci')

      // Without gitmoji, conventional preset and hybrid use word labels plus patch
      const convDocs = matchLabels({
        config: parsedConvAutolabeler,
        pullRequest: {
          files: [],
          title: 'docs: update guide',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(convDocs.labels)).toContain('docs')
      expect(Array.from(convDocs.labels)).toContain('patch')

      const convCI = matchLabels({
        config: parsedConvAutolabeler,
        pullRequest: {
          files: [],
          title: 'ci: update workflow',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(convCI.labels)).toContain('ci')
      expect(Array.from(convCI.labels)).toContain('patch')
    })

    it('major/minor/patch are always included as labels across all PRs and presets', () => {
      const testCases = [
        { title: '💥 breaking change', expectedSemver: 'major' },
        { title: 'feat!: breaking change', expectedSemver: 'major' },
        { title: '✨ new feature', expectedSemver: 'minor' },
        { title: 'feat: new feature', expectedSemver: 'minor' },
        { title: '🐛 fix issue', expectedSemver: 'patch' },
        { title: 'fix: fix issue', expectedSemver: 'patch' },
        { title: '📝 update docs', expectedSemver: 'patch' },
        { title: 'docs: update docs', expectedSemver: 'patch' },
        { title: '👷 update ci', expectedSemver: 'patch' },
        { title: 'ci: update ci', expectedSemver: 'patch' },
      ]

      for (const tc of testCases) {
        // Gitmoji
        const gRes = matchLabels({
          config: parsedGitmojiAutolabeler,
          pullRequest: { files: [], title: tc.title, branch: 'main', body: '' },
        })
        expect(
          Array.from(gRes.labels),
          `gitmoji failed on ${tc.title}`,
        ).toContain(tc.expectedSemver)

        // Hybrid
        const hRes = matchLabels({
          config: parsedHybridAutolabeler,
          pullRequest: { files: [], title: tc.title, branch: 'main', body: '' },
        })
        expect(
          Array.from(hRes.labels),
          `hybrid failed on ${tc.title}`,
        ).toContain(tc.expectedSemver)
      }
    })
  })
})
