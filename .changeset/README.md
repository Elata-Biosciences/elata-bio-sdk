# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning and changelogs.

## Adding a changeset (contributors)

When you make a change that should be released:

1. Run **`pnpm changeset`** (or `./run.sh changeset`) from the repo root.
2. Choose which packages are affected (`@elata-biosciences/eeg-web`, `eeg-web-ble`, `rppg-web`).
3. Pick the bump type for each (patch / minor / major).
4. Write a short summary for the changelog.

Commit the new file under `.changeset/` with your PR. Maintainers will run the version + release flow and your summary will appear in the package changelogs.

## Releasing (maintainers)

1. **Bump versions and update changelogs:**  
   `./run.sh bump` or `pnpm version`
2. Review the version bumps and changelog updates, then commit.
3. **Build and publish:**  
   `./run.sh release all next` (or `latest`).

We use `run.sh release` for the actual publish step (build + npm publish + git tags) instead of `changeset publish`.
