# Contributing to k6-debugger

Thanks for your interest — contributions are welcome. This project is small, so the workflow is light.

## Development setup

```bash
git clone https://github.com/bennobaby/k6-debugger.git
cd k6-debugger
npm install
```

Requires **Node ≥ 18.19** and **`curl`** on `PATH`.

## Running tests

```bash
npm test              # node --test against the test/ suite
npm run smoke         # examples/smoke.js end-to-end through the CLI
```

CI runs `npm test` across Node 18/20/22 on Linux and Windows ([.github/workflows/ci.yml](.github/workflows/ci.yml)). PRs must be green.

## Submitting changes

1. Fork and branch from `master`
2. Make a focused change with a clear commit message
3. Add or update tests in [test/](test/)
4. Run `npm test` locally
5. Open a PR — describe the *why*, not just the *what*

Small, targeted PRs land faster than large refactors. If you want to do something big, open an issue first to align on direction.

## Bug reports

Open an issue at https://github.com/bennobaby/k6-debugger/issues with:

- `k6-debugger --version`
- `node --version` and your OS
- A minimal reproduction script if possible

## Code style

No linter is configured. Follow the existing style:

- ESM throughout (`.mjs` for source, `.js` for k6 stubs)
- 2-space indent
- Comments explain *why*, not *what*
- Prefer small, focused modules

## Releasing (maintainers)

Releases are tag-driven:

```bash
npm version patch    # or minor / major
git push --follow-tags
```

The [release workflow](.github/workflows/release.yml) runs tests and publishes to npm with provenance on any `v*` tag.
