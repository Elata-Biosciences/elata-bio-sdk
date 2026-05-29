set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set positional-arguments

default:
    @just --list

# Publish a package to npm end-to-end: build, verify, publish, tag, push tag.
# Requires NPM_TOKEN in .env (or exported in the environment).
# Usage: just publish               # defaults to app-payments
#        just publish app-metrics   # or any other workspace package
publish pkg="app-payments":
    @./scripts/just-publish.sh {{pkg}}
