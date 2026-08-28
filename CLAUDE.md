# CLAUDE.md — token-metering

This repo is the standalone codebase for cairn's token-metering feature: SQLite capture, transcript parsing, pricing, a local dashboard server, and its frontend. It's consumed as a git submodule by [cairn-2.0](https://github.com/jisundr/cairn-2.0) at `token-metering/`.

## Scope

Code, tests, and this file only — no requirements, architecture rationale, user flows, or specs. This file and `.harness/` cover only what's needed to build and verify this codebase.

## Build & verify

See `.harness/workflow.md` for gates, `.harness/architecture.md` for stack/layering, `.harness/environment.md` for required tool versions.
