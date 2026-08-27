<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Test-driven development

Use TDD for every new feature, behavior change, and bug fix. Before writing a
test, identify the public behavior seam and confirm that seam with the user.
Then work in vertical slices: write one failing behavior test, implement only
enough production code to make it pass, and repeat. Refactor only after the
behavior is covered and the test suite is green.

## Agent skills

### Issue tracker

Issues and specs are tracked as local Markdown under `.scratch/`. See
`docs/agents/issue-tracker.md`.

### Triage labels

The project uses the default engineering-skill triage vocabulary. See
`docs/agents/triage-labels.md`.

### Domain docs

The project uses a single-context domain layout. See `docs/agents/domain.md`.
