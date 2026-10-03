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
      { title: '⚡️ Lazyload home screen images.', expectedLabel: ':zap:' },
      { title: '🐛 Fix onClick event handler', expectedLabel: ':bug:' },
      { title: '🔖 Bump version 1.2.0', expectedLabel: ':bookmark:' },
      {
        title: '♻️ (components): Transform classes to hooks',
        expectedLabel: ':recycle:',
      },
      { title: '✨ (ui) Add button', expectedLabel: ':sparkles:' },
      { title: ':sparkles: Add feature', expectedLabel: ':sparkles:' },
      { title: ':sparkles: (ui): Add button', expectedLabel: ':sparkles:' },
      { title: '💥 Break existing API', expectedLabel: ':boom:' },
      { title: ':boom: (db): Drop deprecated tables', expectedLabel: ':boom:' },
    ]

    for (const { title, expectedLabel } of examples) {
      it(`matches gitmoji title: "${title}"`, () => {
        const gitmojiResult = matchLabels({
          config: parsedGitmojiAutolabeler,
          pullRequest: { files: [], branch: 'main', title, body: null },
        })
        expect(Array.from(gitmojiResult.labels)).toContain(expectedLabel)

        const hybridResult = matchLabels({
          config: parsedHybridAutolabeler,
          pullRequest: { files: [], branch: 'main', title, body: null },
        })
        expect(Array.from(hybridResult.labels)).toContain(expectedLabel)
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

  describe('Emoji & Word Labels Separation', () => {
    it('gitmoji preset uses gitmoji labels and semver words, adhering to GitHub label constraints', () => {
      // GitHub requires labels to contain more than native emojis (e.g. :shortcodes: or words)
      const SEMVER_LABELS = new Set(['major', 'minor', 'patch'])

      // Autolabeler in gitmoji preset emits shortcode labels + standard semver labels
      for (const rule of gitmojiConfig.autolabeler ?? []) {
        if (!rule.label) continue
        if (!SEMVER_LABELS.has(rule.label)) {
          expect(rule.label).toMatch(/^:[a-z0-9_-]+:$/)
        }
      }

      // Check specific categories and version resolvers have both semver words and emojis
      const majorLabels = gitmojiConfig.categories
        .filter((c) => c['semver-increment'] === 'major')
        .flatMap((c) =>
          Array.isArray(c.when)
            ? c.when.flatMap((w) => w.labels || [])
            : c.when?.labels || [],
        )
      const minorLabels = gitmojiConfig.categories
        .filter((c) => c['semver-increment'] === 'minor')
        .flatMap((c) =>
          Array.isArray(c.when)
            ? c.when.flatMap((w) => w.labels || [])
            : c.when?.labels || [],
        )
      const patchLabels = gitmojiConfig.categories
        .filter(
          (c) => c['semver-increment'] === 'patch' && c.type === 'changelog',
        )
        .flatMap((c) =>
          Array.isArray(c.when)
            ? c.when.flatMap((w) => w.labels || [])
            : c.when?.labels || [],
        )

      expect(majorLabels).toContain('major')
      expect(majorLabels).toContain('💥')
      expect(minorLabels).toContain('minor')
      expect(minorLabels).toContain('✨')
      expect(patchLabels).toContain('patch')
      expect(patchLabels).toContain('🐛')
    })

    it('conventional preset uses word labels and does NOT give emoji labels', () => {
      // Categories in conventional preset must only have word labels
      for (const cat of convConfig.categories) {
        if (cat.type !== 'changelog') continue
        const catLabels = Array.isArray(cat.when)
          ? cat.when.flatMap((w) => w.labels || [])
          : cat.when?.labels || []
        for (const l of catLabels) {
          expect(l).not.toMatch(/^:[a-z0-9_]+:$/)
          expect(l).toMatch(/^[a-z0-9_-]+$/i) // strictly words/slugs
        }
      }

      // Autolabeler in conventional preset must NOT emit emoji labels
      for (const rule of convConfig.autolabeler ?? []) {
        expect(rule.label).toMatch(/^[a-z0-9_-]+$/i) // strictly words/slugs
      }

      const majorLabels = convConfig.categories
        .filter((c) => c['semver-increment'] === 'major')
        .flatMap((c) =>
          Array.isArray(c.when)
            ? c.when.flatMap((w) => w.labels || [])
            : c.when?.labels || [],
        )
      const minorLabels = convConfig.categories
        .filter((c) => c['semver-increment'] === 'minor')
        .flatMap((c) =>
          Array.isArray(c.when)
            ? c.when.flatMap((w) => w.labels || [])
            : c.when?.labels || [],
        )
      const patchLabels = convConfig.categories
        .filter(
          (c) => c['semver-increment'] === 'patch' && c.type === 'changelog',
        )
        .flatMap((c) =>
          Array.isArray(c.when)
            ? c.when.flatMap((w) => w.labels || [])
            : c.when?.labels || [],
        )

      expect(majorLabels).toContain('major')
      expect(majorLabels).toContain('breaking')
      expect(minorLabels).toContain('minor')
      expect(minorLabels).toContain('feat')
      expect(patchLabels).toContain('patch')
      expect(patchLabels).toContain('fix')
    })

    it('hybrid preset accepts both word and emoji labels', () => {
      const majorLabels = hybridConfig.categories
        .filter((c) => c['semver-increment'] === 'major')
        .flatMap((c) =>
          Array.isArray(c.when)
            ? c.when.flatMap((w) => w.labels || [])
            : c.when?.labels || [],
        )
      const minorLabels = hybridConfig.categories
        .filter((c) => c['semver-increment'] === 'minor')
        .flatMap((c) =>
          Array.isArray(c.when)
            ? c.when.flatMap((w) => w.labels || [])
            : c.when?.labels || [],
        )
      const patchLabels = hybridConfig.categories
        .filter(
          (c) => c['semver-increment'] === 'patch' && c.type === 'changelog',
        )
        .flatMap((c) =>
          Array.isArray(c.when)
            ? c.when.flatMap((w) => w.labels || [])
            : c.when?.labels || [],
        )

      expect(majorLabels).toContain('major')
      expect(majorLabels).toContain('breaking')
      expect(majorLabels).toContain('💥')
      expect(minorLabels).toContain('minor')
      expect(minorLabels).toContain('feat')
      expect(minorLabels).toContain('✨')
      expect(patchLabels).toContain('patch')
      expect(patchLabels).toContain('fix')
      expect(patchLabels).toContain('🐛')
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
      expect(Array.from(result.labels)).toContain(':sparkles:')
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
    it('contains pre-exclude category across all presets', () => {
      for (const [name, cfg] of [
        ['gitmoji', gitmojiConfig],
        ['conventional-commits', convConfig],
        ['hybrid', hybridConfig],
      ] as const) {
        const preExclude = cfg.categories.find((c) => c.type === 'pre-exclude')
        expect(preExclude, `${name} missing pre-exclude category`).toBeDefined()
        const excludedLabels = Array.isArray(preExclude?.when)
          ? preExclude?.when.flatMap((w) => w.labels || [])
          : preExclude?.when?.labels || []
        expect(excludedLabels, `${name} missing exclude-labels`).toContain(
          'skip-changelog',
        )
        expect(excludedLabels, `${name} missing exclude-labels`).toContain(
          'skip-release',
        )
      }
    })

    it('does not include file-based autolabeling rules by default (authors use commit message / branch for intent)', () => {
      // Gitmoji autolabeler does not label solely based on files
      const gitmojiResult = matchLabels({
        config: parsedGitmojiAutolabeler,
        pullRequest: {
          files: ['.github/workflows/release.yml', 'README.md'],
          title: 'update workflow',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(gitmojiResult.labels)).toEqual([])

      // Conventional autolabeler does not label solely based on files
      const convResult = matchLabels({
        config: parsedConvAutolabeler,
        pullRequest: {
          files: ['.github/workflows/release.yml', 'README.md'],
          title: 'update workflow',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(convResult.labels)).toEqual([])

      // Hybrid autolabeler does not label solely based on files
      const hybridResult = matchLabels({
        config: parsedHybridAutolabeler,
        pullRequest: {
          files: ['.github/workflows/release.yml', 'README.md'],
          title: 'update workflow',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(hybridResult.labels)).toEqual([])
    })

    it('docs and CI/CD use their emoji representation when gitmoji is used', () => {
      // In Gitmoji preset, conventional titles docs: and ci: resolve to their emojis (:memo: and :construction_worker:) plus patch
      const gitmojiDocs = matchLabels({
        config: parsedGitmojiAutolabeler,
        pullRequest: {
          files: [],
          title: 'docs: update guide',
          branch: 'main',
          body: '',
        },
      })
      expect(Array.from(gitmojiDocs.labels)).toContain(':memo:')
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
      expect(Array.from(gitmojiCI.labels)).toContain(':construction_worker:')
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
      expect(Array.from(hybridDocs.labels)).toContain(':memo:')
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
      expect(Array.from(hybridCI.labels)).toContain(':construction_worker:')
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
