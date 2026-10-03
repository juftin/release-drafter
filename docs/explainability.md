# Autolabeler Explainability

Release Drafter includes built-in explainability for pull request labeling.

## Features

- **GitHub Actions Step Summary**: Written automatically to `$GITHUB_STEP_SUMMARY` on every workflow run.
- **Pull Request Sticky Comment**: Opt-in via `pr-comment: true` in your workflow configuration.
- **GitMoji Specification Links**: Preset GitMoji labels automatically link to their official intentions on [gitmoji.dev/specification](https://gitmoji.dev/specification).
- **SemVer Impact & Target Sections**: Clearly displays the calculated version increment and which release notes categories the PR will appear under.

## Configuration Example

```yaml
- uses: release-drafter/release-drafter/autolabeler@v6
  with:
    # Enabled by default: writes to GitHub Actions Job Summary
    summary: true
    # Opt-in: posts/updates sticky comment on the PR
    pr-comment: true
```
