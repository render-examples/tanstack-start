## Summary

<!-- What changed? Keep this outcome-focused. -->

## User problem

<!-- Why does this belong in the default template? -->

## Verification

- [ ] `npm ci --include=dev`
- [ ] `git diff --exit-code -- package.json package-lock.json`
- [ ] `npm run quality`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `git diff --exit-code`
- [ ] `npm run smoke:production`
- [ ] `npm run validate:blueprint`
- [ ] `npm run test:browser:install`
- [ ] `npm run test:error-boundary`
- [ ] `npm run test:browser`
- [ ] `git status --short` is empty.
- [ ] I reviewed any generated `src/routeTree.gen.ts` change.

## Contract review

- [ ] The change keeps one service and zero required application secrets, or an approved proposal explains the scope change.
- [ ] Build, start, host/port, health, and environment changes are synchronized across the Blueprint, README, and tests.
- [ ] I considered keyboard, responsive, error-state, and server/client trust boundaries.
- [ ] I added no credential, `.env` file, generated build output, or private data.
- [ ] I identified whether this change requires an owner-run Render canary before release.

## Visual evidence

<!-- Add before/after screenshots for visible changes; otherwise write “Not applicable.” -->
