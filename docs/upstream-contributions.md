# Proposed Changes & Commit Architecture

This document provides a structured overview of the commits and enhancements developed on this fork. Each commit is designed to be atomic, isolated, and self-contained so that upstream maintainers can review, cherry-pick, or adopt individual features independently.

---

## Commit Summary

| #   | Commit    | Type    | Summary                                                                                  | Author               |
| --- | --------- | ------- | ---------------------------------------------------------------------------------------- | -------------------- |
| 1   | `415936c` | `feat!` | Support individual and direct commits in release drafts (Upstream PR #1726)              | Clément Chanchevrier |
| 2   | `e4097a2` | `feat`  | Resolve mutually exclusive SemVer bump labels to highest precedence                      | `jufty-bot`          |
| 3   | `d10a400` | `feat`  | Infer categories & SemVer from direct commits and PR branches, titles, bodies, and files | `jufty-bot`          |
| 4   | `49a4f17` | `feat`  | Add autolabeler explainability step summary on GitHub Actions                            | `jufty-bot`          |
| 5   | `32ce7c3` | `feat`  | Support Gitmoji specification and configuration presets                                  | `jufty-bot`          |
| 6   | `b11fc91` | `ci`    | Consolidate repository configuration and dogfood presets in CI                           | `jufty-bot`          |
| 7   | `d370a5c` | `feat`  | Support configuration presets in core loader and standalone CLI                          | `jufty-bot`          |
| 8   | `2fc751d` | `ci`    | Add reusable workflow.yml for workflow_call invocation                                   | `jufty-bot`          |
| 9   | `a08d998` | `ci`    | Include preset generation in CI validation                                               | `jufty-bot`          |
| 10  | `d87100a` | `docs`  | Update documentation for presets, direct commit drafting, and reusable workflow          | `jufty-bot`          |
| 11  | `781fad6` | `feat`  | Add explainability step summary across all composite actions                             | `jufty-bot`          |
| 12  | `a6a1b29` | `ci`    | Add workflow to update floating major version tag on release                             | `jufty-bot`          |

---

## Detailed Commit Breakdown

### 1. `feat!: support individual and direct commits in release drafts` (`415936c`)

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
  - Renames `sort-by: merged_at` to `sort-by: date``.
  - Replaces `$NUMBER` and `$URL` in `new-contributor-template` with `$CHANGE_REFERENCE` and `$CHANGE_URL`.
- **Files Modified**:
  - Core orchestration, release payload builders, and change formatters in `packages/core`.
  - GraphQL queries and polling in `packages/github-adapter`.
  - Adapter implementations in `packages/gitlab-adapter` and `packages/rest-adapter`.

---

### 2. `feat(autolabeler): resolve mutually exclusive semver bump labels to highest precedence` (`e4097a2`)

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

### 3. `feat: infer categories & semver from direct commits and PR branches, titles, bodies, and files` (`d10a400`)

- **Objective**: Enable direct commits to be categorized and drive SemVer version increments using autolabeler rules and changed file paths.
- **Problem**: In upstream PR #1726, direct commits could only be categorized by matching raw commit titles in `when.title`. Because direct commits do not have forge PR labels or tracked changed files, they could not match label-based category rules (`when: { label: '...' }`), could not match file path rules (`when: { path: '...' }`), and could not participate in SemVer version calculation (`semver-increment`).
- **Solution**:
  - Introduced `inferChangeLabels` in `packages/core/src/change.ts` and enhanced commit modeling with `changedFiles`.
  - Evaluates `autolabeler` regex and file path rules during release drafting:
    - **For direct commits**: Matches commit message titles, full messages, bodies, and edited files (`changedFiles`) against rules to infer synthetic labels (e.g. matching `feat:` or `:sparkles:` for `minor`, or `docs/**` for `docs`). Direct commits also match category `paths` conditions directly. Branch rules are safely skipped.
    - **For pull requests**: Matches branch names, PR titles, bodies, and changed files to infer missing labels.
  - Hydrates `changedFiles` for direct unassociated commits in forge adapters (e.g. via GitHub REST `repos.getCommit`) when `include-commits` and changed-file rules are active.
  - Passed inferred labels and changed files into `categorizeChanges` and `resolveVersionKeyIncrement``.
  - Direct commits now sort into their corresponding changelog categories (`## Features`, `## Bug Fixes`, `## Documentation`) and trigger appropriate version increments (`major`, `minor`, `patch`) based on messages and files edited without requiring manual PR labels.
- **Files Modified**:
  - `packages/core/src/types.ts`
  - `packages/core/src/change.ts`
  - `packages/core/src/category-matching.ts`
  - `packages/core/src/release-orchestration.ts`
  - `packages/core/src/config/config.schema.ts`
  - `packages/core/src/config/merge-input-and-config.ts`
  - `packages/core/src/release/categorize-changes.ts`
  - `packages/core/src/release/resolve-version-increment.ts`
  - `packages/core/src/release/generate-changelog.ts`
  - `packages/core/src/release/generate-contributors-sentence.ts`
  - `packages/core/src/release/individual-commits.test.ts`
  - `packages/github-adapter/src/index.ts`
  - `packages/github-adapter/src/index.test.ts`
  - Added unit test suites: `sort-changes.test.ts`, `sort-pull-requests.test.ts`, `categorize-pull-requests.test.ts`.

---

### 4. `feat(autolabeler): add explainability step summary when running on GitHub` (`49a4f17`)

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

### 5. `feat: support gitmoji specification and configuration presets` (`32ce7c3`)

- **Objective**: Introduce official support for the Gitmoji specification and ready-to-use configuration presets.
- **Problem**: Repositories using Gitmoji had to handcraft massive regular expressions for emojis, shortcodes, and SemVer mappings, often missing obscure edge cases.
- **Solution**:
  - Created first-class presets accessible via `_extends`:
    - `presets:gitmoji`: Comprehensive Gitmoji categorization and SemVer bumping rules.
    - `presets:conventional-commits`: Turnkey Conventional Commits rules.
    - `presets:hybrid`: Combined preset supporting both Gitmoji and Conventional Commits conventions simultaneously.
  - Integrated the official `gitmojis` package to provide typed Gitmoji definitions without maintaining local data files.
  - Implemented `src/scripts/generate-gitmoji.ts` to generate YAML presets and compile-time TypeScript presets.
  - Added conformance tests in `src/tests/drafter/spec-conformance.test.ts`.
- **Files Modified**:
  - `configs/gitmoji.yaml`
  - `configs/conventional-commits.yaml`
  - `configs/hybrid.yaml`
  - `package.json`
  - `packages/gh-actions/package.json`
  - `packages/gh-actions/src/common/config/presets.generated.ts`
  - `src/scripts/generate-gitmoji.ts`
  - `src/tests/drafter/spec-conformance.test.ts`

---

### 6. `ci: update workflows and repository dogfooding` (`b11fc91`)

- **Objective**: Standardize configuration management and dogfood the new presets directly within the repository.
- **Problem**: Configuration was split across multiple test configuration files (`release-drafter.tests.yml`, `release-drafter.autolabeler.tests.yml`), resulting in drift and duplication.
- **Solution**:
  - Consolidated into a single source of truth: `.github/release-drafter.yml` symlinked to `configs/conventional-commits.yaml`.
  - Removed obsolete test configurations.
  - Added dedicated `.github/workflows/autolabeler.yml` with necessary pull request permissions.
  - Configured repository dogfooding for automatic labeling, explainability summaries, and release drafting.
- **Files Modified**:
  - `.github/workflows/autolabeler.yml`
  - `.github/workflows/drafter.yml`
  - `.github/release-drafter.yml`
  - Removed: `.github/release-drafter.tests.yml`, `.github/release-drafter.autolabeler.tests.yml`

---

### 7. `feat(core): support configuration presets in core loader and cli` (`d370a5c`)

- **Objective**: Ensure configuration presets (`presets:gitmoji`, `presets:conventional-commits`, `presets:hybrid`) and zero-config fallback work identically across the core loader and standalone CLI without requiring GitHub Actions context.
- **Problem**: Presets were originally resolved in the `gh-actions` wrapper, meaning non-GitHub environments, the standalone CLI, and programmatic API users could not resolve `preset:` / `presets:` targets or fallback to `preset:conventional-commits`. Additionally, presets using legacy syntax trigger deprecation warnings.
- **Solution**:
  - Moved preset catalog and resolution directly into `@release-drafter/core`.
  - Added support for `preset:<name>` and plural alias `presets:<name>` in `load-config.ts`.
  - Enabled automatic fallback to `preset:conventional-commits` when no repository configuration file is discovered.
  - Conformed presets strictly to modern category schema (using `when.labels`, `type: 'pre-exclude'`, and category-level `semver-increment` per PR #1558) so zero deprecation warnings are logged.
  - Configured built-in presets to rely purely on explicit author intent conveyed through commit message titles and branch names (omitting default file-based autolabeling rules, while custom repository autolabeler configurations retain full file-matching capabilities).
  - Added unit test coverage for preset resolution and inheritance in `packages/core` and `packages/cli`.

---

### 8. `ci: add reusable workflow.yml for workflow_call invocation` (`2fc751d`)

- **Objective**: Provide a first-class reusable workflow at `.github/workflows/workflow.yml` that downstream repositories can call via `workflow_call`.
- **Problem**: Repositories wanting to standardize Release Drafter across organizations previously had to copy runner job definitions and composite action invocations into every repository workflow.
- **Solution**:
  - Added `.github/workflows/workflow.yml` accepting all action inputs and secrets, executing Release Drafter, and exposing all outputs.
  - Implemented intelligent event routing: runs `autolabeler` and optional `check-pr` validation on PR events (`pull_request`, `pull_request_target`), and `update_release_draft` on push and dispatch events.
  - Added `check` (and alias `check-pr`) input as an optional PR validation step.
  - Configured `.github/actionlint.yaml` to ensure workflow linting passes across environments.
  - Allows downstream workflows to invoke Release Drafter cleanly via `uses: juftin/release-drafter/.github/workflows/workflow.yml@main`.

---

### 9. `ci: include preset generation in ci validation` (`a08d998`)

- **Objective**: Guarantee that preset YAML configurations, TypeScript definitions, and generated code remain strictly in sync.
- **Problem**: Manual edits to presets or dependencies could cause drift if preset generation is not verified in CI.
- **Solution**:
  - Wired `generate:presets` directly into root `npm run ci`.
  - Added test assertions in `src/tests/tooling/workspaces.test.ts`.

---

### 10. `docs: update documentation for presets, direct commit drafting, and reusable workflow` (`d87100a`)

- **Objective**: Provide comprehensive end-user and administrator documentation for all newly introduced capabilities.
- **Problem**: New features (built-in presets, reusable workflow, direct commit drafting, autolabeler explainability) require clear reference documentation and usage examples.
- **Solution**:
  - Documented `presets:gitmoji`, `presets:conventional-commits`, and `presets:hybrid` alongside `preset:<name>` syntax in `README.md` and `docs/configuration-loading.md`.
  - Documented zero-config fallback to `preset:conventional-commits`.
  - Documented `include-commits: true` configuration for drafting direct branch commits and crediting individual authors.
  - Documented autolabeler explainability step summary (`$GITHUB_STEP_SUMMARY`).
  - Documented reusable workflow invocation via `.github/workflows/workflow.yml@v7` with event routing and optional PR check step.

---

### 11. `feat(actions): add explainability step summary across all composite actions` (`781fad6`)

- **Objective**: Extend GitHub Actions Step Summary (`$GITHUB_STEP_SUMMARY`) explainability across all Release Drafter composite actions (`check-pr`, `drafter`, and root `release-drafter`).
- **Problem**: While `autolabeler` had rich step summary explainability, `check-pr` only logged messages and threw on failures, and `drafter` only updated draft releases without surfacing evaluation metrics, resolved SemVer bumps, or preview release notes directly in the GitHub Actions job run.
- **Solution**:
  - Implemented shared Step Summary writer utility in `packages/gh-actions/src/common/summary.ts`.
  - Added `check-pr` explainability in `packages/gh-actions/src/check-pr/explainability.ts`:
    - Renders formatted table showing PR number, title, base branch, labels, and evaluation status (`✅ Valid`, `❌ Invalid`, or `⏭️ Excluded`).
    - Surfaces actionable remediation guidance on check failure before exiting.
    - Writes the Step Summary even on failure so contributors can see immediately why their PR failed.
  - Added `drafter` explainability in `packages/gh-actions/src/drafter/explainability.ts`:
    - Renders release evaluation summary showing release name, tag, action taken (`✨ Created Draft`, `📝 Updated Draft`, or `🧪 Dry Run`), target commitish, and resolved version.
    - Renders collapsible `<details>` preview containing the generated release notes markdown body.
  - Exposed `summary` boolean input (default `true`) across `check-pr`, `drafter`, `action.yml`, and the reusable `workflow.yml`.

---

### 12. `ci: add workflow to update floating major version tag on release` (`a6a1b29`)

- **Objective**: Automatically create or force-update the floating major version tag (e.g. `v7`) whenever a GitHub release is published.
- **Problem**: When new releases are published, consumers pinning to major versions (e.g. `uses: release-drafter/release-drafter@v7`) do not receive updates unless the repository manually moves the floating major tag to the latest release commit.
- **Solution**:
  - Added standalone workflow `.github/workflows/major-tag.yml` triggered on `on: release: types: [published]`.
  - Uses the runner's native GitHub CLI (`gh api`) to resolve the published release's target commit SHA and update/create the `v{majorVersion}` Git ref with `force: true` without external action dependencies.
  - Emits a clean GitHub Actions step summary showing the updated major tag, release tag, and commit SHA.

---

## Recommended Adoption Order for Upstream

For maintainers looking to adopt these enhancements incrementally:

1. **Commit 2 (`e4097a2`) — SemVer Precedence**: Zero breaking changes; immediate bug fix for label contention.
2. **Commit 4 (`49a4f17`) — Autolabeler Explainability**: Zero breaking changes; standalone enhancement for GitHub Actions UX.
3. **Commit 11 (`781fad6`) — Composite Action Explainability**: Zero breaking changes; provides consistent, user-friendly GitHub Actions step summaries across check-pr and release-drafter.
4. **Commit 12 (`a6a1b29`) — Floating Major Tag Workflow**: Zero breaking changes; automatically moves `v{major}` tags upon release publication so GitHub Action consumers stay current.
5. **Commit 1 (`415936c`) — PR #1726 Squashed**: Major feature; brings in individual commit support.
6. **Commit 3 (`d10a400`) — Commit Label & Path Inference**: Natural follow-up to Commit 1; enables categorization and SemVer for individual commits.
7. **Commit 5 (`32ce7c3`) & Commit 7 (`d370a5c`) — Presets & Gitmoji**: Adds turnkey Gitmoji & Conventional Commits presets across Core, CLI, and Actions.
8. **Commit 8 (`2fc751d`) — Reusable Workflow**: Adds reusable workflow invocation for downstream organizations.
