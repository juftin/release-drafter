import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Gitmoji, gitmojis } from 'gitmojis'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, '../..')

// Gitmojis from upstream master that may not yet be published in the npm package
const UNRELEASED_GITMOJIS: Gitmoji[] = [
  {
    emoji: '🦖',
    entity: '&#x1f996;',
    code: ':t-rex:',
    description: 'Code that adds backwards compatibility.',
    name: 't-rex',
    semver: null,
  },
]

export const ALL_GITMOJIS: Gitmoji[] = (() => {
  const list = [...gitmojis]
  for (const extra of UNRELEASED_GITMOJIS) {
    if (!list.some((g) => g.name === extra.name)) {
      list.push(extra)
    }
  }
  return list
})()

interface CategoryDef {
  title: string
  semver: 'major' | 'minor' | 'patch'
  names: string[]
  extra_labels?: string[]
  branch_patterns?: string[]
}

const CATEGORIES: CategoryDef[] = [
  {
    title: '💥 Breaking Changes',
    semver: 'major',
    names: ['boom'],
    extra_labels: ['breaking', 'breaking-change'],
  },
  {
    title: '✨ Features & Improvements',
    semver: 'minor',
    names: [
      'sparkles',
      'tada',
      'rocket',
      'children-crossing',
      'iphone',
      'dizzy',
      'globe-with-meridians',
      'bento',
      'wheelchair',
      'egg',
      'alembic',
      'triangular-flag-on-post',
      'necktie',
      't-rex',
      'airplane',
    ],
    extra_labels: ['feature', 'enhancement', 'feat'],
    branch_patterns: ['/^feat(\\/|-)/i', '/^feature(\\/|-)/i'],
  },
  {
    title: '🐛 Bug Fixes & Security',
    semver: 'patch',
    names: [
      'bug',
      'ambulance',
      'adhesive-bandage',
      'lock',
      'closed-lock-with-key',
      'passport-control',
      'safety-vest',
      'goal-net',
      'rotating-light',
      'pencil2',
      'alien',
    ],
    extra_labels: ['fix', 'bugfix', 'security', 'patch'],
    branch_patterns: [
      '/^fix(\\/|-)/i',
      '/^bugfix(\\/|-)/i',
      '/^hotfix(\\/|-)/i',
      '/^sec(urity)?(\\/|-)/i',
    ],
  },
  {
    title: '⚡ Performance',
    semver: 'patch',
    names: ['zap', 'thread', 'mag'],
    extra_labels: ['perf', 'performance'],
    branch_patterns: ['/^perf(\\/|-)/i'],
  },
  {
    title: '📝 Documentation',
    semver: 'patch',
    names: [
      'memo',
      'bulb',
      'page-facing-up',
      'busts-in-silhouette',
      'speech-balloon',
    ],
    extra_labels: ['docs', 'documentation'],
    branch_patterns: ['/^docs?(\\/|-)/i'],
  },
  {
    title: '♻️ Code Refactoring & Style',
    semver: 'patch',
    names: [
      'recycle',
      'art',
      'fire',
      'coffin',
      'building-construction',
      'wastebasket',
      'truck',
      'label',
      'card-file-box',
      'lipstick',
      'poop',
    ],
    extra_labels: ['refactor', 'style'],
    branch_patterns: ['/^refactor(\\/|-)/i', '/^style(\\/|-)/i'],
  },
  {
    title: '📦 Dependency Updates',
    semver: 'patch',
    names: [
      'arrow-up',
      'arrow-down',
      'pushpin',
      'heavy-plus-sign',
      'heavy-minus-sign',
      'package',
    ],
    extra_labels: ['dependencies', 'deps'],
    branch_patterns: [
      '/^dependabot\\//i',
      '/^renovate\\//i',
      '/^deps?(\\/|-)/i',
    ],
  },
  {
    title: '👷 CI/CD',
    semver: 'patch',
    names: [
      'construction-worker',
      'green-heart',
      'wrench',
      'hammer',
      'bricks',
      'technologist',
      'see-no-evil',
      'chart-with-upwards-trend',
      'stethoscope',
      'money-with-wings',
      'bookmark',
      'construction',
      'loud-sound',
      'mute',
    ],
    extra_labels: ['ci', 'build', 'chore'],
    branch_patterns: ['/^ci(\\/|-)/i', '/^build(\\/|-)/i', '/^chore(\\/|-)/i'],
  },
  {
    title: '🧪 Tests',
    semver: 'patch',
    names: [
      'white-check-mark',
      'test-tube',
      'camera-flash',
      'clown-face',
      'seedling',
      'monocle-face',
    ],
    extra_labels: ['test'],
    branch_patterns: ['/^tests?(\\/|-)/i'],
  },
  {
    title: '⏪️ Reverts & Branches',
    semver: 'patch',
    names: ['rewind', 'twisted-rightwards-arrows', 'beers'],
    extra_labels: ['revert'],
    branch_patterns: ['/^revert(\\/|-)/i'],
  },
]

function makeEmojiRegex(emoji: string, code: string): string {
  const rawEmoji = emoji.replace(/\ufe0f/g, '')
  const cleanCode = code.replace(/^:|:$/g, '')
  const pattern =
    rawEmoji !== emoji
      ? `^(:${cleanCode}:|${rawEmoji}\\ufe0f?)`
      : `^(:${cleanCode}:|${rawEmoji})`
  return `/${pattern}/`
}

function getCategoryLabels(
  cat: CategoryDef,
  gitmojisMap: Map<string, Gitmoji>,
  mode: 'gitmoji' | 'hybrid' = 'gitmoji',
): string[] {
  const labels: string[] = []
  if (cat.semver === 'major' && !labels.includes('major')) {
    labels.push('major')
  } else if (cat.semver === 'minor' && !labels.includes('minor')) {
    labels.push('minor')
  } else if (cat.title.includes('Bug Fixes') && !labels.includes('patch')) {
    labels.push('patch')
  }

  for (const name of cat.names) {
    const g = gitmojisMap.get(name)
    if (!g) continue
    const rawEmoji = g.emoji
    if (!labels.includes(rawEmoji)) {
      labels.push(rawEmoji)
    }
    if (rawEmoji.includes('\ufe0f')) {
      const withoutVs = rawEmoji.replace(/\ufe0f/g, '')
      if (!labels.includes(withoutVs)) {
        labels.push(withoutVs)
      }
    }
    if (!labels.includes(g.code)) {
      labels.push(g.code)
    }
    if (!labels.includes(g.name)) {
      labels.push(g.name)
    }
  }

  if (mode === 'hybrid') {
    for (const name of cat.names) {
      if (!labels.includes(name)) {
        labels.push(name)
      }
    }
    for (const extra of cat.extra_labels ?? []) {
      if (!labels.includes(extra)) {
        labels.push(extra)
      }
    }
  }

  return labels
}

interface ConvRule {
  label: string
  titlePatterns: string[]
  branchPatterns: string[]
}

const CONV_RULES: ConvRule[] = [
  {
    label: 'feat',
    titlePatterns: ['/^feat(ure)?(\\([^\\)]+\\))?:/i'],
    branchPatterns: ['/^feat(\\/|-)/i', '/^feature(\\/|-)/i'],
  },
  {
    label: 'fix',
    titlePatterns: ['/^(fix|bugfix|hotfix)(\\([^\\)]+\\))?:/i'],
    branchPatterns: [
      '/^fix(\\/|-)/i',
      '/^bugfix(\\/|-)/i',
      '/^hotfix(\\/|-)/i',
    ],
  },
  {
    label: 'security',
    titlePatterns: ['/^sec(urity)?(\\([^\\)]+\\))?:/i'],
    branchPatterns: ['/^sec(urity)?(\\/|-)/i'],
  },
  {
    label: 'perf',
    titlePatterns: ['/^perf(ormance)?(\\([^\\)]+\\))?:/i'],
    branchPatterns: ['/^perf(\\/|-)/i'],
  },
  {
    label: 'docs',
    titlePatterns: ['/^docs?(\\([^\\)]+\\))?:/i'],
    branchPatterns: ['/^docs?(\\/|-)/i'],
  },
  {
    label: 'refactor',
    titlePatterns: ['/^refactor(\\([^\\)]+\\))?:/i'],
    branchPatterns: ['/^refactor(\\/|-)/i'],
  },
  {
    label: 'dependencies',
    titlePatterns: [
      '/^(deps?|dependencies)(\\([^\\)]+\\))?:/i',
      '/^chore\\(deps(-[a-z0-9]+)?\\):/i',
    ],
    branchPatterns: [
      '/^dependabot\\//i',
      '/^renovate\\//i',
      '/^deps?(\\/|-)/i',
    ],
  },
  {
    label: 'ci',
    titlePatterns: ['/^(ci|build)(\\([^\\)]+\\))?:/i'],
    branchPatterns: ['/^ci(\\/|-)/i', '/^build(\\/|-)/i'],
  },
  {
    label: 'chore',
    titlePatterns: ['/^chore(\\([^\\)]+\\))?:/i'],
    branchPatterns: ['/^chore(\\/|-)/i'],
  },
  {
    label: 'test',
    titlePatterns: ['/^tests?(\\([^\\)]+\\))?:/i'],
    branchPatterns: ['/^tests?(\\/|-)/i'],
  },
  {
    label: 'revert',
    titlePatterns: ['/^revert(\\([^\\)]+\\))?:/i'],
    branchPatterns: ['/^revert(\\/|-)/i'],
  },
]

function generateSemverAutolabelers(
  gitmojisMap: Map<string, Gitmoji>,
): string[] {
  const lines: string[] = []
  // Major
  lines.push('  # Semver: Major')
  lines.push("  - label: 'major'")
  lines.push('    title:')
  lines.push("      - '/^(:boom:|💥)/'")
  lines.push("      - '/^([a-z]+(\\([^\\)]+\\))?!:|.*BREAKING CHANGE:?)/i'")
  lines.push("      - '/BREAKING[ -]CHANGE/i'")
  lines.push('    branch:')
  lines.push("      - '/.*breaking.*/i'")
  lines.push('    body:')
  lines.push("      - '/BREAKING[ -]CHANGE:/i'")
  lines.push('')

  // Minor
  lines.push('  # Semver: Minor')
  lines.push("  - label: 'minor'")
  lines.push('    title:')
  for (const cat of CATEGORIES) {
    if (cat.semver === 'minor') {
      for (const name of cat.names) {
        const g = gitmojisMap.get(name)
        if (g) {
          lines.push(`      - '${makeEmojiRegex(g.emoji, g.code)}'`)
        }
      }
    }
  }
  lines.push("      - '/^feat(ure)?(\\([^\\)]+\\))?:/i'")
  lines.push('    branch:')
  lines.push("      - '/^feat(\\/|-)/i'")
  lines.push("      - '/^feature(\\/|-)/i'")
  lines.push('')

  // Patch
  lines.push('  # Semver: Patch')
  lines.push("  - label: 'patch'")
  lines.push('    title:')
  for (const cat of CATEGORIES) {
    if (cat.semver === 'patch') {
      for (const name of cat.names) {
        const g = gitmojisMap.get(name)
        if (g) {
          lines.push(`      - '${makeEmojiRegex(g.emoji, g.code)}'`)
        }
      }
    }
  }
  for (const r of [
    '/^(fix|bugfix|hotfix)(\\([^\\)]+\\))?:/i',
    '/^sec(urity)?(\\([^\\)]+\\))?:/i',
    '/^perf(ormance)?(\\([^\\)]+\\))?:/i',
    '/^docs?(\\([^\\)]+\\))?:/i',
    '/^refactor(\\([^\\)]+\\))?:/i',
    '/^(deps?|dependencies)(\\([^\\)]+\\))?:/i',
    '/^chore\\(deps(-[a-z0-9]+)?\\):/i',
    '/^(ci|build)(\\([^\\)]+\\))?:/i',
    '/^chore(\\([^\\)]+\\))?:/i',
    '/^tests?(\\([^\\)]+\\))?:/i',
    '/^revert(\\([^\\)]+\\))?:/i',
  ]) {
    lines.push(`      - '${r}'`)
  }
  lines.push('    branch:')
  for (const bp of [
    '/^fix(\\/|-)/i',
    '/^bugfix(\\/|-)/i',
    '/^hotfix(\\/|-)/i',
    '/^sec(urity)?(\\/|-)/i',
    '/^perf(\\/|-)/i',
    '/^docs?(\\/|-)/i',
    '/^refactor(\\/|-)/i',
    '/^dependabot\\//i',
    '/^renovate\\//i',
    '/^deps?(\\/|-)/i',
    '/^ci(\\/|-)/i',
    '/^build(\\/|-)/i',
    '/^chore(\\/|-)/i',
    '/^tests?(\\/|-)/i',
    '/^revert(\\/|-)/i',
  ]) {
    lines.push(`      - '${bp}'`)
  }
  lines.push('')

  return lines
}

function generateGitmojiYaml(gitmojisMap: Map<string, Gitmoji>): string {
  const lines: string[] = [
    '# yaml-language-server: $schema=https://raw.githubusercontent.com/release-drafter/release-drafter/master/schema.json',
    '',
    "name-template: 'v$RESOLVED_VERSION'",
    "tag-template: 'v$RESOLVED_VERSION'",
    'include-commits: true',
    "change-template: '- $CHANGE_TITLE ($CHANGE_REFERENCE) $CHANGE_AUTHORS'",
    '',
    'template: |',
    "  ## What's Changed",
    '',
    '  $CHANGES',
    '',
    '  **Full Changelog**: https://github.com/$OWNER/$REPOSITORY/compare/$PREVIOUS_TAG...$RESOLVED_TAG',
    '',
    'categories:',
    "  - type: 'pre-exclude'",
    '    when:',
    '      labels:',
    "        - 'skip-changelog'",
    "        - 'skip-release'",
    '',
  ]

  for (const cat of CATEGORIES) {
    lines.push(`  - title: '${cat.title}'`)
    lines.push(`    semver-increment: ${cat.semver}`)
    lines.push('    when:')
    lines.push('      labels:')
    const allLabels = getCategoryLabels(cat, gitmojisMap, 'gitmoji')
    for (const label of allLabels) {
      lines.push(`        - '${label}'`)
    }
    lines.push('')
  }

  lines.push("  - type: 'version-resolver'")
  lines.push('    semver-increment: patch')
  lines.push('')
  lines.push('autolabeler:')

  lines.push(...generateSemverAutolabelers(gitmojisMap))

  const boom = gitmojisMap.get('boom')
  if (!boom) {
    throw new Error("Missing 'boom' gitmoji")
  }
  lines.push(`  - label: '${boom.code}'`)
  lines.push('    title:')
  lines.push(`      - '${makeEmojiRegex(boom.emoji, boom.code)}'`)
  lines.push("      - '/^([a-z]+(\\([^\\)]+\\))?!:|.*BREAKING CHANGE:?)/i'")
  lines.push("      - '/BREAKING[ -]CHANGE/i'")
  lines.push('    branch:')
  lines.push("      - '/.*breaking.*/i'")
  lines.push('    body:')
  lines.push("      - '/BREAKING[ -]CHANGE:/i'")
  lines.push('')

  for (const cat of CATEGORIES) {
    for (const name of cat.names) {
      if (name === 'boom') continue
      const g = gitmojisMap.get(name)
      if (!g) continue
      lines.push(`  - label: '${g.code}'`)
      lines.push('    title:')
      lines.push(`      - '${makeEmojiRegex(g.emoji, g.code)}'`)
      if (name === 'construction-worker') {
        lines.push("      - '/^(ci|build)(\\([^\\)]+\\))?:/i'")
      } else if (name === 'memo') {
        lines.push("      - '/^docs?(\\([^\\)]+\\))?:/i'")
      }
      if (cat.branch_patterns && name === cat.names[0]) {
        lines.push('    branch:')
        for (const bp of cat.branch_patterns) {
          lines.push(`      - '${bp}'`)
        }
      }
      lines.push('')
    }
  }

  return `${lines.join('\n').trim()}\n`
}

function generateHybridYaml(gitmojisMap: Map<string, Gitmoji>): string {
  const lines: string[] = [
    '# yaml-language-server: $schema=https://raw.githubusercontent.com/release-drafter/release-drafter/master/schema.json',
    '',
    "name-template: 'v$RESOLVED_VERSION'",
    "tag-template: 'v$RESOLVED_VERSION'",
    'include-commits: true',
    "change-template: '- $CHANGE_TITLE ($CHANGE_REFERENCE) $CHANGE_AUTHORS'",
    '',
    'template: |',
    "  ## What's Changed",
    '',
    '  $CHANGES',
    '',
    '  **Full Changelog**: https://github.com/$OWNER/$REPOSITORY/compare/$PREVIOUS_TAG...$RESOLVED_TAG',
    '',
    'categories:',
    "  - type: 'pre-exclude'",
    '    when:',
    '      labels:',
    "        - 'skip-changelog'",
    "        - 'skip-release'",
    '',
  ]

  for (const cat of CATEGORIES) {
    lines.push(`  - title: '${cat.title}'`)
    lines.push(`    semver-increment: ${cat.semver}`)
    lines.push('    when:')
    lines.push('      labels:')
    const allLabels = getCategoryLabels(cat, gitmojisMap, 'hybrid')
    for (const label of allLabels) {
      lines.push(`        - '${label}'`)
    }
    lines.push('')
  }

  lines.push("  - type: 'version-resolver'")
  lines.push('    semver-increment: patch')
  lines.push('')
  lines.push('autolabeler:')

  lines.push(...generateSemverAutolabelers(gitmojisMap))

  lines.push("  - label: 'breaking'")
  lines.push('    title:')
  lines.push("      - '/^([a-z]+(\\([^\\)]+\\))?!:|.*BREAKING CHANGE:?)/i'")
  lines.push("      - '/BREAKING[ -]CHANGE/i'")
  lines.push('    branch:')
  lines.push("      - '/.*breaking.*/i'")
  lines.push('    body:')
  lines.push("      - '/BREAKING[ -]CHANGE:/i'")
  lines.push('')

  const boom = gitmojisMap.get('boom')
  if (!boom) {
    throw new Error("Missing 'boom' gitmoji")
  }
  lines.push(`  - label: '${boom.code}'`)
  lines.push('    title:')
  lines.push(`      - '${makeEmojiRegex(boom.emoji, boom.code)}'`)
  lines.push("      - '/^([a-z]+(\\([^\\)]+\\))?!:|.*BREAKING CHANGE:?)/i'")
  lines.push("      - '/BREAKING[ -]CHANGE/i'")
  lines.push('    branch:')
  lines.push("      - '/.*breaking.*/i'")
  lines.push('    body:')
  lines.push("      - '/BREAKING[ -]CHANGE:/i'")
  lines.push('')

  for (const item of CONV_RULES) {
    lines.push(`  - label: '${item.label}'`)
    lines.push('    title:')
    for (const tp of item.titlePatterns) {
      lines.push(`      - '${tp}'`)
    }
    lines.push('    branch:')
    for (const bp of item.branchPatterns) {
      lines.push(`      - '${bp}'`)
    }
    lines.push('')
  }

  for (const cat of CATEGORIES) {
    for (const name of cat.names) {
      if (name === 'boom') continue
      const g = gitmojisMap.get(name)
      if (!g) continue
      lines.push(`  - label: '${g.code}'`)
      lines.push('    title:')
      lines.push(`      - '${makeEmojiRegex(g.emoji, g.code)}'`)
      lines.push('')
    }
  }

  return `${lines.join('\n').trim()}\n`
}

export function generate() {
  const gitmojisMap = new Map<string, Gitmoji>(
    ALL_GITMOJIS.map((g) => [g.name, g]),
  )

  const gitmojiYaml = generateGitmojiYaml(gitmojisMap)
  const hybridYaml = generateHybridYaml(gitmojisMap)

  writeFileSync(resolve(ROOT_DIR, 'configs/gitmoji.yaml'), gitmojiYaml, 'utf8')
  writeFileSync(resolve(ROOT_DIR, 'configs/hybrid.yaml'), hybridYaml, 'utf8')

  console.log('Successfully generated:')
  console.log(' - configs/gitmoji.yaml')
  console.log(' - configs/hybrid.yaml')

  const convYaml = readFileSync(
    resolve(ROOT_DIR, 'configs/conventional-commits.yaml'),
    'utf8',
  )

  const allGitmojis = [...gitmojis]
  for (const extra of UNRELEASED_GITMOJIS) {
    if (!allGitmojis.some((g) => g.name === extra.name)) {
      allGitmojis.push(extra)
    }
  }

  const presetsTs = `// This file is auto-generated by src/scripts/generate-gitmoji.ts. Do not edit directly.

export const PRESET_CONFIGS: Record<string, string> = {
  'conventional-commits': ${JSON.stringify(convYaml)},
  gitmoji: ${JSON.stringify(gitmojiYaml)},
  hybrid: ${JSON.stringify(hybridYaml)},
}

export const BUILTIN_PRESETS = [
  'conventional-commits',
  'gitmoji',
  'hybrid',
] as const

export type BuiltinPreset = (typeof BUILTIN_PRESETS)[number]

export const isBuiltinPreset = (name: string): name is BuiltinPreset =>
  (BUILTIN_PRESETS as readonly string[]).includes(name)

export const getPresetConfig = (name: string): string | undefined => {
  const normalized = name.replace(/\\.ya?ml$/, '')
  return PRESET_CONFIGS[normalized]
}

export interface GitmojiSpecEntry {
  emoji: string
  entity: string
  code: string
  description: string
  name: string
  semver: 'major' | 'minor' | 'patch' | null
}

export const GITMOJI_SPEC_DATA: GitmojiSpecEntry[] = ${JSON.stringify(allGitmojis, null, 2)}
`

  const corePresetsFile = resolve(
    ROOT_DIR,
    'packages/core/src/config/presets.generated.ts',
  )
  writeFileSync(corePresetsFile, presetsTs, 'utf8')
  console.log(' - packages/core/src/config/presets.generated.ts')

  const ghActionsPresetsTs = `// This file is auto-generated by src/scripts/generate-gitmoji.ts. Do not edit directly.

export {
  BUILTIN_PRESETS,
  type BuiltinPreset,
  GITMOJI_SPEC_DATA,
  type GitmojiSpecEntry,
  getPresetConfig,
  isBuiltinPreset,
  PRESET_CONFIGS,
} from '@release-drafter/core'
`

  const ghActionsPresetsFile = resolve(
    ROOT_DIR,
    'packages/gh-actions/src/common/config/presets.generated.ts',
  )
  writeFileSync(ghActionsPresetsFile, ghActionsPresetsTs, 'utf8')
  console.log(' - packages/gh-actions/src/common/config/presets.generated.ts')

  // Release drafter config symlink
  const githubDir = resolve(ROOT_DIR, '.github')
  const target = '../configs/conventional-commits.yaml'
  const yamlDup = resolve(githubDir, 'release-drafter.yaml')
  if (existsSync(yamlDup) || lstatSafeExists(yamlDup)) {
    unlinkSync(yamlDup)
  }

  const linkPath = resolve(githubDir, 'release-drafter.yml')
  if (lstatSafeExists(linkPath)) {
    const isSym = lstatSync(linkPath).isSymbolicLink()
    if (isSym) {
      if (readlinkSync(linkPath) !== target) {
        unlinkSync(linkPath)
        symlinkSync(target, linkPath)
      }
    } else {
      unlinkSync(linkPath)
      symlinkSync(target, linkPath)
    }
  } else {
    symlinkSync(target, linkPath)
  }

  console.log('Configured single release-drafter config:')
  console.log(` - .github/release-drafter.yml -> ${target}`)
}

function lstatSafeExists(p: string): boolean {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}

generate()
