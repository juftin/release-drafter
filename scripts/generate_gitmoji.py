#!/usr/bin/env python3
"""
Generate Release Drafter Gitmoji and Hybrid configurations
from the official gitmojis.json database.
"""

import json
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
DATA_FILE = ROOT_DIR / "data" / "gitmojis.json"

CATEGORIES = [
    {
        "title": "💥 Breaking Changes",
        "semver": "major",
        "names": ["boom"],
        "extra_labels": ["breaking", "breaking-change"],
    },
    {
        "title": "✨ Features & Improvements",
        "semver": "minor",
        "names": [
            "sparkles",
            "tada",
            "rocket",
            "children-crossing",
            "iphone",
            "dizzy",
            "globe-with-meridians",
            "bento",
            "wheelchair",
            "egg",
            "alembic",
            "triangular-flag-on-post",
            "necktie",
            "t-rex",
            "airplane",
        ],
        "extra_labels": ["feature", "enhancement", "feat"],
        "branch_patterns": ["/^feat(\\//|-)/i", "/^feature(\\//|-)/i"],
    },
    {
        "title": "🐛 Bug Fixes & Security",
        "semver": "patch",
        "names": [
            "bug",
            "ambulance",
            "adhesive-bandage",
            "lock",
            "closed-lock-with-key",
            "passport-control",
            "safety-vest",
            "goal-net",
            "rotating-light",
            "pencil2",
            "alien",
        ],
        "extra_labels": ["fix", "bugfix", "security"],
        "branch_patterns": ["/^fix(\\//|-)/i", "/^bugfix(\\//|-)/i", "/^hotfix(\\//|-)/i", "/^sec(urity)?(\\//|-)/i"],
    },
    {
        "title": "⚡ Performance",
        "semver": "patch",
        "names": ["zap", "thread", "mag"],
        "extra_labels": ["perf", "performance"],
        "branch_patterns": ["/^perf(\\//|-)/i"],
    },
    {
        "title": "📝 Documentation",
        "semver": "patch",
        "names": ["memo", "bulb", "page-facing-up", "busts-in-silhouette", "speech-balloon"],
        "extra_labels": ["docs", "documentation"],
        "branch_patterns": ["/^docs?(\\//|-)/i"],
    },
    {
        "title": "♻️ Code Refactoring & Style",
        "semver": "patch",
        "names": [
            "recycle",
            "art",
            "fire",
            "coffin",
            "building-construction",
            "wastebasket",
            "truck",
            "label",
            "card-file-box",
            "lipstick",
            "poop",
        ],
        "extra_labels": ["refactor", "style"],
        "branch_patterns": ["/^refactor(\\//|-)/i", "/^style(\\//|-)/i"],
    },
    {
        "title": "📦 Dependency Updates",
        "semver": "patch",
        "names": [
            "arrow-up",
            "arrow-down",
            "pushpin",
            "heavy-plus-sign",
            "heavy-minus-sign",
            "package",
        ],
        "extra_labels": ["dependencies", "deps"],
        "branch_patterns": ["/^dependabot\\//i", "/^renovate\\//i", "/^deps?(\\//|-)/i"],
    },
    {
        "title": "👷 CI/CD",
        "semver": "patch",
        "names": [
            "construction-worker",
            "green-heart",
            "wrench",
            "hammer",
            "bricks",
            "technologist",
            "see-no-evil",
            "chart-with-upwards-trend",
            "stethoscope",
            "money-with-wings",
            "bookmark",
            "construction",
            "loud-sound",
            "mute",
        ],
        "extra_labels": ["ci", "build", "chore"],
        "branch_patterns": ["/^ci(\\//|-)/i", "/^build(\\//|-)/i", "/^chore(\\//|-)/i"],
    },
    {
        "title": "🧪 Tests",
        "semver": "patch",
        "names": [
            "white-check-mark",
            "test-tube",
            "camera-flash",
            "clown-face",
            "seedling",
            "monocle-face",
        ],
        "extra_labels": ["test"],
        "branch_patterns": ["/^tests?(\\//|-)/i"],
    },
    {
        "title": "⏪️ Reverts & Branches",
        "semver": "patch",
        "names": ["rewind", "twisted-rightwards-arrows", "beers"],
        "extra_labels": ["revert"],
        "branch_patterns": ["/^revert(\\//|-)/i"],
    },
]


def load_gitmojis():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {g["name"]: g for g in data["gitmojis"]}


def make_emoji_regex(emoji: str, code: str) -> str:
    raw_emoji = emoji.replace("\ufe0f", "")
    clean_code = code.strip(":")
    if raw_emoji != emoji:
        pattern = f"^(:{clean_code}:|{raw_emoji}\ufe0f?)"
    else:
        pattern = f"^(:{clean_code}:|{raw_emoji})"
    return f"/{pattern}/"


def get_category_labels(cat, gitmojis, mode="gitmoji"):
    labels = []
    if cat["semver"] == "major" and "major" not in labels:
        labels.append("major")
    elif cat["semver"] == "minor" and "minor" not in labels:
        labels.append("minor")

    # Unicode emojis are included for all modes
    for name in cat["names"]:
        g = gitmojis[name]
        raw_emoji = g["emoji"]
        if raw_emoji not in labels:
            labels.append(raw_emoji)
        if "\ufe0f" in raw_emoji:
            without_vs = raw_emoji.replace("\ufe0f", "")
            if without_vs not in labels:
                labels.append(without_vs)

    if mode == "hybrid":
        for name in cat["names"]:
            if name not in labels:
                labels.append(name)
        for extra in cat.get("extra_labels", []):
            if extra not in labels:
                labels.append(extra)

    return labels


CONV_RULES = [
    ("feat", ["/^feat(ure)?(\\([^\\)]+\\))?:/i"], ["/^feat(\\//|-)/i", "/^feature(\\//|-)/i"], []),
    ("fix", ["/^(fix|bugfix|hotfix)(\\([^\\)]+\\))?:/i"], ["/^fix(\\//|-)/i", "/^bugfix(\\//|-)/i", "/^hotfix(\\//|-)/i"], []),
    ("security", ["/^sec(urity)?(\\([^\\)]+\\))?:/i"], ["/^sec(urity)?(\\//|-)/i"], []),
    ("perf", ["/^perf(ormance)?(\\([^\\)]+\\))?:/i"], ["/^perf(\\//|-)/i"], []),
    ("docs", ["/^docs?(\\([^\\)]+\\))?:/i"], ["/^docs?(\\//|-)/i"], ["**/*.md", "docs/**"]),
    ("refactor", ["/^refactor(\\([^\\)]+\\))?:/i"], ["/^refactor(\\//|-)/i"], []),
    ("dependencies", ["/^(deps?|dependencies)(\\([^\\)]+\\))?:/i", "/^chore\\(deps(-[a-z0-9]+)?\\):/i"], ["/^dependabot\\//i", "/^renovate\\//i", "/^deps?(\\//|-)/i"], []),
    ("ci", ["/^(ci|build)(\\([^\\)]+\\))?:/i"], ["/^ci(\\//|-)/i", "/^build(\\//|-)/i"], [".github/**"]),
    ("chore", ["/^chore(\\([^\\)]+\\))?:/i"], ["/^chore(\\//|-)/i"], []),
    ("test", ["/^tests?(\\([^\\)]+\\))?:/i"], ["/^tests?(\\//|-)/i"], []),
    ("revert", ["/^revert(\\([^\\)]+\\))?:/i"], ["/^revert(\\//|-)/i"], []),
]


def generate_semver_autolabelers(gitmojis):
    lines = []
    # Major
    lines.append("  # Semver: Major")
    lines.append("  - label: 'major'")
    lines.append("    title:")
    lines.append("      - '/^(:boom:|💥)/'")
    lines.append("      - '/^([a-z]+(\\([^\\)]+\\))?!:|.*BREAKING CHANGE:?)/i'")
    lines.append("      - '/BREAKING[ -]CHANGE/i'")
    lines.append("    branch:")
    lines.append("      - '/.*breaking.*/i'")
    lines.append("    body:")
    lines.append("      - '/BREAKING[ -]CHANGE:/i'")
    lines.append("")

    # Minor
    lines.append("  # Semver: Minor")
    lines.append("  - label: 'minor'")
    lines.append("    title:")
    for cat in CATEGORIES:
        if cat["semver"] == "minor":
            for name in cat["names"]:
                g = gitmojis[name]
                lines.append(f"      - '{make_emoji_regex(g['emoji'], g['code'])}'")
    lines.append("      - '/^feat(ure)?(\\([^\\)]+\\))?:/i'")
    lines.append("    branch:")
    lines.append("      - '/^feat(\\//|-)/i'")
    lines.append("      - '/^feature(\\//|-)/i'")
    lines.append("")

    # Patch
    lines.append("  # Semver: Patch")
    lines.append("  - label: 'patch'")
    lines.append("    files:")
    lines.append("      - '.github/**'")
    lines.append("      - '**/*.md'")
    lines.append("      - 'docs/**'")
    lines.append("    title:")
    for cat in CATEGORIES:
        if cat["semver"] == "patch":
            for name in cat["names"]:
                g = gitmojis[name]
                lines.append(f"      - '{make_emoji_regex(g['emoji'], g['code'])}'")
    for r in [
        "/^(fix|bugfix|hotfix)(\\([^\\)]+\\))?:/i",
        "/^sec(urity)?(\\([^\\)]+\\))?:/i",
        "/^perf(ormance)?(\\([^\\)]+\\))?:/i",
        "/^docs?(\\([^\\)]+\\))?:/i",
        "/^refactor(\\([^\\)]+\\))?:/i",
        "/^(deps?|dependencies)(\\([^\\)]+\\))?:/i",
        "/^chore\\(deps(-[a-z0-9]+)?\\):/i",
        "/^(ci|build)(\\([^\\)]+\\))?:/i",
        "/^chore(\\([^\\)]+\\))?:/i",
        "/^tests?(\\([^\\)]+\\))?:/i",
        "/^revert(\\([^\\)]+\\))?:/i",
    ]:
        lines.append(f"      - '{r}'")
    lines.append("    branch:")
    for bp in [
        "/^fix(\\//|-)/i",
        "/^bugfix(\\//|-)/i",
        "/^hotfix(\\//|-)/i",
        "/^sec(urity)?(\\//|-)/i",
        "/^perf(\\//|-)/i",
        "/^docs?(\\//|-)/i",
        "/^refactor(\\//|-)/i",
        "/^dependabot\\//i",
        "/^renovate\\//i",
        "/^deps?(\\//|-)/i",
        "/^ci(\\//|-)/i",
        "/^build(\\//|-)/i",
        "/^chore(\\//|-)/i",
        "/^tests?(\\//|-)/i",
        "/^revert(\\//|-)/i",
    ]:
        lines.append(f"      - '{bp}'")
    lines.append("")

    return lines


def generate_gitmoji_yaml(gitmojis):
    lines = [
        "# yaml-language-server: $schema=https://raw.githubusercontent.com/release-drafter/release-drafter/master/schema.json",
        "",
        "name-template: 'v$RESOLVED_VERSION'",
        "tag-template: 'v$RESOLVED_VERSION'",
        "include-commits: true",
        "change-template: '- $CHANGE_TITLE ($CHANGE_REFERENCE) $CHANGE_AUTHORS'",
        "",
        "template: |",
        "  ## What's Changed",
        "",
        "  $CHANGES",
        "",
        "  **Full Changelog**: $PREVIOUS_TAG...$NEXT_TAG",
        "",
        "exclude-labels:",
        "  - 'skip-changelog'",
        "  - 'skip-release'",
        "",
        "categories:",
    ]

    for cat in CATEGORIES:
        lines.append(f"  - title: '{cat['title']}'")
        lines.append("    labels:")
        all_labels = get_category_labels(cat, gitmojis, mode="gitmoji")
        for label in all_labels:
            lines.append(f"      - '{label}'")

    lines.append("")
    lines.append("version-resolver:")

    # Major
    major_labels = ["major"]
    minor_labels = ["minor"]
    patch_labels = ["patch"]

    for cat in CATEGORIES:
        labels = get_category_labels(cat, gitmojis, mode="gitmoji")
        if cat["semver"] == "major":
            for l in labels:
                if l not in major_labels:
                    major_labels.append(l)
        elif cat["semver"] == "minor":
            for l in labels:
                if l not in minor_labels:
                    minor_labels.append(l)
        else:
            for l in labels:
                if l not in patch_labels:
                    patch_labels.append(l)

    lines.append("  major:")
    lines.append("    labels:")
    for l in major_labels:
        lines.append(f"      - '{l}'")

    lines.append("  minor:")
    lines.append("    labels:")
    for l in minor_labels:
        lines.append(f"      - '{l}'")

    lines.append("  patch:")
    lines.append("    labels:")
    for l in patch_labels:
        lines.append(f"      - '{l}'")

    lines.append("  default: patch")
    lines.append("")
    lines.append("autolabeler:")

    # Add Semver autolabelers
    lines.extend(generate_semver_autolabelers(gitmojis))

    # Pure Gitmoji autolabelers (all labels are emojis)
    boom = gitmojis["boom"]
    lines.append(f"  - label: '{boom['emoji']}'")
    lines.append("    title:")
    lines.append(f"      - '{make_emoji_regex(boom['emoji'], boom['code'])}'")
    lines.append("      - '/^([a-z]+(\\([^\\)]+\\))?!:|.*BREAKING CHANGE:?)/i'")
    lines.append("      - '/BREAKING[ -]CHANGE/i'")
    lines.append("    branch:")
    lines.append("      - '/.*breaking.*/i'")
    lines.append("    body:")
    lines.append("      - '/BREAKING[ -]CHANGE:/i'")
    lines.append("")

    for cat in CATEGORIES:
        for name in cat["names"]:
            if name == "boom":
                continue  # already added above
            g = gitmojis[name]
            lines.append(f"  - label: '{g['emoji']}'")
            if name == "construction-worker":
                lines.append("    files:")
                lines.append("      - '.github/**'")
                lines.append("    title:")
                lines.append(f"      - '{make_emoji_regex(g['emoji'], g['code'])}'")
                lines.append("      - '/^(ci|build)(\\([^\\)]+\\))?:/i'")
            elif name == "memo":
                lines.append("    files:")
                lines.append("      - '**/*.md'")
                lines.append("      - 'docs/**'")
                lines.append("    title:")
                lines.append(f"      - '{make_emoji_regex(g['emoji'], g['code'])}'")
                lines.append("      - '/^docs?(\\([^\\)]+\\))?:/i'")
            else:
                lines.append("    title:")
                lines.append(f"      - '{make_emoji_regex(g['emoji'], g['code'])}'")
            if "branch_patterns" in cat and name == cat["names"][0]:
                lines.append("    branch:")
                for bp in cat["branch_patterns"]:
                    lines.append(f"      - '{bp}'")
            lines.append("")

    return "\n".join(lines).strip() + "\n"


def generate_hybrid_yaml(gitmojis):
    lines = [
        "# yaml-language-server: $schema=https://raw.githubusercontent.com/release-drafter/release-drafter/master/schema.json",
        "",
        "name-template: 'v$RESOLVED_VERSION'",
        "tag-template: 'v$RESOLVED_VERSION'",
        "include-commits: true",
        "change-template: '- $CHANGE_TITLE ($CHANGE_REFERENCE) $CHANGE_AUTHORS'",
        "",
        "template: |",
        "  ## What's Changed",
        "",
        "  $CHANGES",
        "",
        "  **Full Changelog**: $PREVIOUS_TAG...$NEXT_TAG",
        "",
        "exclude-labels:",
        "  - 'skip-changelog'",
        "  - 'skip-release'",
        "",
        "categories:",
    ]

    for cat in CATEGORIES:
        lines.append(f"  - title: '{cat['title']}'")
        lines.append("    labels:")
        all_labels = get_category_labels(cat, gitmojis, mode="hybrid")
        for label in all_labels:
            lines.append(f"      - '{label}'")

    lines.append("")
    lines.append("version-resolver:")

    major_labels = ["major"]
    minor_labels = ["minor"]
    patch_labels = ["patch"]

    for cat in CATEGORIES:
        labels = get_category_labels(cat, gitmojis, mode="hybrid")
        if cat["semver"] == "major":
            for l in labels:
                if l not in major_labels:
                    major_labels.append(l)
        elif cat["semver"] == "minor":
            for l in labels:
                if l not in minor_labels:
                    minor_labels.append(l)
        else:
            for l in labels:
                if l not in patch_labels:
                    patch_labels.append(l)

    lines.append("  major:")
    lines.append("    labels:")
    for l in major_labels:
        lines.append(f"      - '{l}'")

    lines.append("  minor:")
    lines.append("    labels:")
    for l in minor_labels:
        lines.append(f"      - '{l}'")

    lines.append("  patch:")
    lines.append("    labels:")
    for l in patch_labels:
        lines.append(f"      - '{l}'")

    lines.append("  default: patch")
    lines.append("")
    lines.append("autolabeler:")

    # Add Semver autolabelers
    lines.extend(generate_semver_autolabelers(gitmojis))

    # Breaking Changes (Conventional + Gitmoji)
    lines.append("  - label: 'breaking'")
    lines.append("    title:")
    lines.append("      - '/^([a-z]+(\\([^\\)]+\\))?!:|.*BREAKING CHANGE:?)/i'")
    lines.append("      - '/BREAKING[ -]CHANGE/i'")
    lines.append("    branch:")
    lines.append("      - '/.*breaking.*/i'")
    lines.append("    body:")
    lines.append("      - '/BREAKING[ -]CHANGE:/i'")
    lines.append("")

    boom = gitmojis["boom"]
    lines.append(f"  - label: '{boom['emoji']}'")
    lines.append("    title:")
    lines.append(f"      - '{make_emoji_regex(boom['emoji'], boom['code'])}'")
    lines.append("      - '/^([a-z]+(\\([^\\)]+\\))?!:|.*BREAKING CHANGE:?)/i'")
    lines.append("      - '/BREAKING[ -]CHANGE/i'")
    lines.append("    branch:")
    lines.append("      - '/.*breaking.*/i'")
    lines.append("    body:")
    lines.append("      - '/BREAKING[ -]CHANGE:/i'")
    lines.append("")

    for item in CONV_RULES:
        label = item[0]
        title_patterns = item[1]
        branch_patterns = item[2]
        files_patterns = item[3] if len(item) > 3 else []

        lines.append(f"  - label: '{label}'")
        if files_patterns:
            lines.append("    files:")
            for fp in files_patterns:
                lines.append(f"      - '{fp}'")
        lines.append("    title:")
        for tp in title_patterns:
            lines.append(f"      - '{tp}'")
        lines.append("    branch:")
        for bp in branch_patterns:
            lines.append(f"      - '{bp}'")
        lines.append("")

    # Add individual Gitmoji autolabelers (emojis as labels)
    for cat in CATEGORIES:
        for name in cat["names"]:
            if name == "boom":
                continue
            g = gitmojis[name]
            lines.append(f"  - label: '{g['emoji']}'")
            if name == "construction-worker":
                lines.append("    files:")
                lines.append("      - '.github/**'")
            elif name == "memo":
                lines.append("    files:")
                lines.append("      - '**/*.md'")
                lines.append("      - 'docs/**'")
            lines.append("    title:")
            lines.append(f"      - '{make_emoji_regex(g['emoji'], g['code'])}'")
            lines.append("")

    return "\n".join(lines).strip() + "\n"


def main():
    gitmojis = load_gitmojis()
    print(f"Loaded {len(gitmojis)} gitmojis from {DATA_FILE}")

    gitmoji_yaml = generate_gitmoji_yaml(gitmojis)
    hybrid_yaml = generate_hybrid_yaml(gitmojis)

    (ROOT_DIR / "configs" / "gitmoji.yaml").write_text(gitmoji_yaml, encoding="utf-8")
    (ROOT_DIR / "configs" / "hybrid.yaml").write_text(hybrid_yaml, encoding="utf-8")

    print("Successfully generated:")
    print(" - configs/gitmoji.yaml")
    print(" - configs/hybrid.yaml")

    # Generate presets.generated.ts for @release-drafter/gh-actions
    conv_yaml = (ROOT_DIR / "configs" / "conventional-commits.yaml").read_text(encoding="utf-8")
    presets_ts = f'''// This file is auto-generated by scripts/generate_gitmoji.py. Do not edit directly.

export const PRESET_CONFIGS: Record<string, string> = {{
  'conventional-commits': {json.dumps(conv_yaml)},
  gitmoji: {json.dumps(gitmoji_yaml)},
  hybrid: {json.dumps(hybrid_yaml)},
}}

export const BUILTIN_PRESETS = [
  'conventional-commits',
  'gitmoji',
  'hybrid',
] as const

export type BuiltinPreset = (typeof BUILTIN_PRESETS)[number]

export const isBuiltinPreset = (name: string): name is BuiltinPreset =>
  (BUILTIN_PRESETS as readonly string[]).includes(name)

export const getPresetConfig = (name: string): string | undefined => {{
  const normalized = name.replace(/\\.ya?ml$/, '')
  return PRESET_CONFIGS[normalized]
}}
'''
    presets_file = ROOT_DIR / "packages" / "gh-actions" / "src" / "common" / "config" / "presets.generated.ts"
    presets_file.write_text(presets_ts, encoding="utf-8")
    print(" - packages/gh-actions/src/common/config/presets.generated.ts")

    # Symlinks only for gitmoji
    github_dir = ROOT_DIR / ".github"
    target = Path("../configs/gitmoji.yaml")
    for link_name in ("release-drafter.yaml", "release-drafter.yml"):
        link_path = github_dir / link_name
        if link_path.is_symlink():
            if link_path.readlink() != target:
                link_path.unlink()
                link_path.symlink_to(target)
        elif link_path.exists():
            link_path.unlink()
            link_path.symlink_to(target)
        else:
            link_path.symlink_to(target)

    print("Symlinked gitmoji configs:")
    print(" - .github/release-drafter.yaml -> ../configs/gitmoji.yaml")
    print(" - .github/release-drafter.yml -> ../configs/gitmoji.yaml")


if __name__ == "__main__":
    main()
