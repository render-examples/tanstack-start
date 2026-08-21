# Contributing

Thanks for helping make the smallest dependable TanStack Start path to Render
better. Contributions should improve first-deploy success, maintainability, or
clarity without turning the default path into a general-purpose starter kit.

## Before you begin

- Search existing issues before opening a new one.
- For a feature, describe the user problem and why it belongs in every generated
  repository. Optional infrastructure should stay outside the default template.
- Do not include credentials, private URLs, personal data, or sensitive
  security details in an issue or pull request.

## Local setup

Use the Node version in `.node-version` and the npm version in
`package.json#packageManager`, then install the lockfile exactly:

```sh
npm ci --include=dev
npm run dev
```

The development server listens on `http://localhost:3000`.

## Make a focused change

- Preserve one native Node service and zero required application secrets unless
  an approved proposal explicitly changes the product scope.
- Prefer a standard framework or platform contract over a wrapper.
- Keep deployment behavior synchronized across `render.yaml`, `package.json`,
  the README, and the verification scripts.
- Treat route-loader results and `VITE_*` variables as client-visible. Keep
  secrets inside per-request server-only boundaries.
- Preserve `src/start.ts`'s public Error adapter and explicit filtered CSRF
  middleware together. Any change must retain the cross-site browser assertion
  and the root-error disclosure check.
- Throw `Error`, `Response`, redirect, or not-found values. Do not throw a
  secret-bearing primitive/plain object or render raw error details; the Error
  adapter does not sanitize arbitrary data or application logs.
- Do not edit `src/routeTree.gen.ts` by hand or run a separate `tsr generate`
  step. `npm run build` is the canonical generator.

## Verify the result

Run the application checks in the same order as CI:

```sh
npm ci --include=dev
git diff --exit-code -- package.json package-lock.json
npm run quality
npm run typecheck
npm run build
git diff --exit-code
npm run smoke:production
npm run validate:blueprint
npm run test:browser:install
npm run test:error-boundary
npm run test:browser
git diff --exit-code
git status --short
```

`smoke:production` and `test:browser` require the current production build.
`test:error-boundary` makes and removes a disposable project copy, performs its
own production build, and requires the installed Chromium. `validate:blueprint`
needs internet access to retrieve Render's public schema, but it needs no
Render credential.

After a route change, review and commit an intentional
`src/routeTree.gen.ts` diff. Before submitting, confirm `git diff --check` is
clean. Run the verification sequence from a committed tree so each
`git diff --exit-code` succeeds and the final `git status --short` output is
empty. No `.output`, test artifact, browser binary, credential, or `.env` file
may be committed.

## Pull requests

Keep a pull request small enough to explain and review as one change. Include:

- the user problem and chosen scope;
- the commands you ran and their results;
- screenshots for visible changes;
- any production-contract, security, accessibility, or free-tier impact; and
- the documentation changes a first-time user needs.

A maintainer-authorized Render canary is required for changes to runtime,
install, build, start, host/port, health, or Blueprint behavior. Contributors do
not need to create external Render resources on their own.

By submitting a contribution, you agree that it is licensed under the
project's [MIT License](LICENSE).
