# Accessibility verification

The browser test covers repeatable cross-boundary checks. Complete the short
manual section before a release or after a material layout, navigation, or
error-state change.

## Automated coverage

Run the production build before the browser journey:

```sh
npm run build
npm run test:browser
```

The single Chromium journey checks:

- meaningful server-rendered HTML before hydration;
- no unexpected browser console warnings or uncaught errors;
- keyboard access to the skip link and a visible focus indicator;
- focus transfer to the destination main landmark after typed navigation;
- focus retention while the server-function control changes state;
- a 320 CSS-pixel viewport without horizontal page scrolling;
- the custom 404 status, focus, title, and `noindex` metadata; and
- axe rules tagged for WCAG 2 A/AA, WCAG 2.1 A/AA, and WCAG 2.2 AA on the
  reachable home and 404 states.

Automated checks find only some accessibility problems. They do not replace
the manual checks below.

## Manual release checks

- [ ] Use only the keyboard from a fresh page load. Confirm the skip link is
      the first focus target, all navigation and controls are reachable in a
      sensible order, focus is always visible, and no keyboard trap exists.
- [ ] Trigger **Check the server** with a screen reader. Confirm its pending and
      result text is announced without moving focus away from the button.
- [ ] Follow **How it works** with a screen reader. Confirm focus reaches the
      new main landmark and the page has one clear level-one heading with a
      logical heading sequence.
- [ ] Zoom a desktop browser to 200%. Confirm text and controls remain readable,
      content does not overlap, and no two-dimensional scrolling is needed for
      normal reading.
- [ ] Enable the operating system's reduced-motion preference. Confirm the site
      remains understandable and does not rely on animation to communicate
      state.
- [ ] Inspect text, focus indicators, disabled-looking states, and links in
      forced-colors or a comparable high-contrast mode.
- [ ] Temporarily throw from an existing child-route loader in a local working
      copy, build the production app, and inspect the router-wide error
      fallback. Confirm HTTP 500, generic copy, the application-error title,
      `noindex`, focus on `#main-content`, and no diagnostic or source path in
      the complete SSR payload. Use an `Error` sentinel, not a primitive throw.
      Revert the temporary throw and rebuild before committing.

## Recording release evidence

Record completed manual checks in the release pull request, including the
browser, operating system, assistive technology, and findings. Do not treat DOM
automation as evidence for checks that require a screen reader, physical browser
zoom, or an operating-system accessibility mode.
