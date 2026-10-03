# Proposed Changes & Commit Architecture

This document provides a structured overview of the commits and enhancements developed on this fork. Each commit is designed to be atomic, isolated, and self-contained so that upstream maintainers can review, cherry-pick, or adopt individual features independently.

---

## Commit Summary

| #   | Commit    | Type    | Summary                                                                           | Author               |
| --- | --------- | ------- | --------------------------------------------------------------------------------- | -------------------- |
| 1   | `5cdfa05` | `feat`  | Resolve mutually exclusive SemVer bump labels to highest precedence               | `jufty-bot`          |
| 2   | `f77110f` | `feat!` | Support individual and direct commits in release drafts (Upstream PR #1726)       | Clément Chanchevrier |
| 3   | `c2e2fde` | `feat`  | Infer categories & SemVer from direct commits and PR branches, titles, and bodies | `jufty-bot`          |
| 4   | `b825b20` | `feat`  | Add autolabeler explainability step summary on GitHub Actions                     | `jufty-bot`          |
| 5   | `da8cb51` | `feat`  | Support Gitmoji specification and configuration presets                           | `jufty-bot`          |
| 6   | `bdec418` | `ci`    | Consolidate repository configuration and dogfood presets in CI                    | `jufty-bot`          |

---

## Detailed Commit Breakdown

### 1. `feat(autolabeler): resolve mutually exclusive semver bump labels to highest precedence` (`5cdfa05`)

- **Objective**: Prevent conflicting semantic version labels from being simultaneously attached to a pull request.
- **Problem**: When a pull request's metadata matched rules for multiple bump levels (e.g., both `patch` and `minor`), the autolabeler would apply both labels. Downstream version resolvers or workflows could then behave non-deterministically.
- **Solution**:
  - Implemented label conflict resolution in the autolabeler runner.
  - When multiple version bump labels match, resolved to the highest semantic precedence (`major` > `minor` > `patch`).
  - Lower-precedence bump labels are suppressed before applying changes to the forge.
- **Files Modified**:
  - `packages/gh-actions/src/autolabeler/runner.ts`
  - `packages/gh-actions/src/autolabeler/runner.test.ts`
- **Upstream Value**: Eliminates race conditions and conflicting labels for any team using label-driven SemVer bumping.

---

### 2. `feat!: support individual and direct commits in release drafts` (`f77110f`)

- **Objective**: Integrate upstream contribution [PR #1726](https://github.com/release-drafter/release-drafter/pull/1726) by Clément Chanchevrier (`feat/individual-commit-support`).
- **Problem**: Historically, Release Drafter only operated on merged pull requests. Direct commits pushed to the default branch (e.g. administrative changes, release bumps, direct pushes in smaller repositories) were omitted from release notes and contributor discovery.
- **Solution**:
  - Introduced a polymorphic `Change` abstraction (`type: 'pull-request' | 'commit'`).
  - Added the `include-commits: true` configuration flag.
  - Implemented generic change templating with `$CHANGE_*` variables (`$CHANGE_TITLE`, `$CHANGE_URL`, `$CHANGE_AUTHOR_MENTION`, `$CHANGE_REFERENCE`) alongside dedicated `commit-template` and `pr-template` overrides.
  - Added adapter discovery for direct commits across GitHub (with GraphQL association polling), GitLab, and Gitea/Forgejo.
  - Added contributor discovery for direct commits via commit author and `Co-authored-by:` git trailers.
  - Unified change sorting by timestamp (`sort-by: date`).
- **Breaking Changes**:
  - Replaces legacy unprefixed per-change template variables with `$CHANGE_*`.
  - Renames `sort-by: merged_at` to `sort-by: date`.
  - Replaces `$NUMBER` and `$URL` in `new-contributor-template` with `$CHANGE_REFERENCE` and `$CHANGE_URL`.
- **Files Modified**:
  - Core orchestration, release payload builders, and change formatters in `packages/core`.
  - GraphQL queries and polling in `packages/github-adapter`.
  - Adapter implementations in `packages/gitlab-adapter` and `packages/rest-adapter`.

---

### 3. `feat: infer categories & semver from direct commits and PR branches, titles, and bodies` (`c2e2fde`)

- **Objective**: Enable direct commits to be categorized and drive SemVer version increments using autolabeler rules.
- **Problem**: In upstream PR #1726, direct commits could only be categorized by matching raw commit titles in `when.title`. Because direct commits do not have forge PR labels, they could not match label-based category rules (`when: { label: '...' }`) and could not participate in SemVer version calculation (`semver-increment`).
- **Solution**:
  - Introduced `inferChangeLabels` in `packages/core/src/change.ts`.
  - Evaluates `autolabeler` regex rules during release drafting:
    - **For direct commits**: Matches commit message titles, full messages, and bodies against regex rules to infer synthetic labels (e.g. matching `feat:` or `:sparkles:` to assign a `minor` label). Branch rules are safely skipped.
    - **For pull requests**: Matches branch names, PR titles, bodies, and changed files to infer missing labels.
  - Passed inferred labels into `categorizeChanges` and `resolveVersionKeyIncrement`.
  - Direct commits now sort into their corresponding changelog categories (`## Features`, `## Bug Fixes`) and trigger appropriate version increments (`major`, `minor`, `patch`) without requiring manual PR labels.
- **Files Modified**:
  - `packages/core/src/change.ts`
  - `packages/core/src/category-matching.ts`
  - `packages/core/src/config/config.schema.ts`
  - `packages/core/src/config/merge-input-and-config.ts`
  - `packages/core/src/release/categorize-changes.ts`
  - `packages/core/src/release/resolve-version-increment.ts`
  - `packages/core/src/release/generate-changelog.ts`
  - `packages/core/src/release/generate-contributors-sentence.ts`
  - `packages/core/src/release/individual-commits.test.ts`
  - Added unit test suites: `sort-changes.test.ts`, `sort-pull-requests.test.ts`, `categorize-pull-requests.test.ts`.

---

### 4. `feat(autolabeler): add explainability step summary when running on GitHub` (`b825b20`)

- **Objective**: Provide clear visibility into why specific labels were applied or skipped by the autolabeler action.
- **Problem**: Autolabeling can feel like a "black box" when complex regexes or file globs are evaluated, making it difficult for contributors and maintainers to debug why a PR received certain labels.
- **Solution**:
  - Added a GitHub Actions Step Summary (`$GITHUB_STEP_SUMMARY`) generated after autolabeler execution.
  - Details each label evaluated, whether it was applied or skipped, and the exact matching criteria:
    - Matched branch pattern
    - Matched title pattern
    - Matched body pattern
    - Matched file paths (formatted under `Matched Files:` with bulleted lists)
  - Falls back gracefully to standard console logging in local or non-GitHub environments.
- **Files Modified**:
  - `packages/gh-actions/src/autolabeler/explainability.ts`
  - `packages/gh-actions/src/autolabeler/explainability.test.ts`
  - `packages/gh-actions/src/autolabeler/runner.ts`

---

### 5. `feat: support gitmoji specification and configuration presets` (`da8cb51`)

- **Objective**: Provide turnkey support for the Gitmoji specification and introduce reusable configuration presets.
- **Problem**: Configuring categories, SemVer increments, and autolabeler rules for Gitmoji or Conventional Commits requires hundreds of lines of repetitive YAML regexes.
- **Solution**:
  - Added built-in presets that can be referenced via `_extends`:
    - `presets:gitmoji`: Complete Gitmoji specification mapping emojis and `:shortcode:` notation to categories, SemVer bump levels (`major`, `minor`, `patch`), and autolabeler rules.
    - `presets:conventional-commits`: Standard Conventional Commits categories (`feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`).
    - `presets:hybrid`: Combined preset supporting both Gitmoji and Conventional Commits conventions simultaneously.
  - Implemented `scripts/generate_gitmoji.py` fetching the official `gitmojis.json` schema to generate typed mappings and presets.
  - Added conformance tests in `src/tests/drafter/spec-conformance.test.ts`.
- **Files Modified**:
  - `configs/gitmoji.yaml`
  - `configs/conventional-commits.yaml`
  - `configs/hybrid.yaml`
  - `data/gitmojis.json`
  - `packages/gh-actions/src/common/config/presets.generated.ts`
  - `scripts/generate_gitmoji.py`
  - `src/tests/drafter/spec-conformance.test.ts`

---

### 6. `ci: update workflows and repository dogfooding` (`bdec418`)

- **Objective**: Standardize configuration management and dogfood the new presets directly within the repository.
- **Problem**: Configuration was split across multiple test configuration files (`release-drafter.tests.yml`, `release-drafter.autolabeler.tests.yml`), resulting in drift and duplication.
- **Solution**:
  - Consolidated into a single source of truth: `.github/release-drafter.yml` symlinked to `configs/hybrid.yaml`.
  - Removed obsolete test configurations.
  - Added dedicated `.github/workflows/autolabeler.yml` with necessary pull request permissions.
  - Configured repository dogfooding for automatic labeling, explainability summaries, and release drafting.
- **Files Modified**:
  - `.github/workflows/autolabeler.yml`
  - `.github/workflows/drafter.yml`
  - `.github/release-drafter.yml`
  - Removed: `.github/release-drafter.tests.yml`, `.github/release-drafter.autolabeler.tests.yml`.

---

## Recommended Adoption Order for Upstream

For maintainers looking to adopt these enhancements incrementally:

1. **Commit 1 (`5cdfa05`) — SemVer Precedence**: Zero breaking changes; immediate bug fix for label contention.
2. **Commit 4 (`b825b20`) — Autolabeler Explainability**: Zero breaking changes; standalone enhancement for GitHub Actions UX.
3. **Commit 2 (`f77110f`) — PR #1726 Squashed**: Major feature; brings in individual commit support.
4. **Commit 3 (`c2e2fde`) — Commit Label Inference**: Natural follow-up to Commit 2; enables categorization and SemVer for individual commits.
5. **Commit 5 (`da8cb51`) — Presets & Gitmoji**: Adds presets without affecting custom configurations.
