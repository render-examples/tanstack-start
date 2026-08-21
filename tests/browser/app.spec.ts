import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, type TestInfo, test } from '@playwright/test'

const notFoundPath = '/this-route-must-not-exist'
const wcag22AaTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test('the production app proves its deployment boundaries', async ({
  baseURL,
  page,
  request,
}, testInfo) => {
  if (!baseURL) throw new Error('Playwright baseURL is required.')

  const appOrigin = new URL(baseURL).origin
  const notFoundUrl = new URL(notFoundPath, baseURL).href
  const consoleProblems: Array<{
    type: string
    text: string
    url: string
    lineNumber: number
    columnNumber: number
  }> = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() !== 'warning' && message.type() !== 'error') return

    consoleProblems.push({
      type: message.type(),
      text: message.text(),
      ...message.location(),
    })
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.stack ?? error.message)
  })

  await test.step('serves meaningful raw SSR and public assets', async () => {
    const homeResponse = await request.get('/')
    const homeHtml = await homeResponse.text()

    expect(homeResponse.status()).toBe(200)
    expect(homeResponse.headers()['content-type']).toMatch(/^text\/html\b/i)
    expect(homeHtml).toMatch(/<h1\b[^>]*>TanStack Start on Render<\/h1>/)
    expect(homeHtml).toContain('Check the server')
    expect(homeHtml).toContain('Ready for a same-origin request.')
    expect(homeHtml).not.toContain('Response received')
    expect(homeHtml).toContain('/favicon.svg')

    const stylesheetPath = homeHtml.match(/\/assets\/[^"'\s>]+\.css/)?.[0]
    if (!stylesheetPath) {
      throw new Error(
        'Could not discover the built stylesheet in the SSR HTML.',
      )
    }

    const stylesheetResponse = await request.get(stylesheetPath)
    expect(stylesheetResponse.status()).toBe(200)
    expect(stylesheetResponse.headers()['content-type']).toMatch(
      /^text\/css\b/i,
    )
    expect((await stylesheetResponse.body()).byteLength).toBeGreaterThan(0)

    const faviconResponse = await request.get('/favicon.svg')
    expect(faviconResponse.status()).toBe(200)
    expect(faviconResponse.headers()['content-type']).toMatch(
      /^image\/svg\+xml\b/i,
    )
    expect((await faviconResponse.body()).byteLength).toBeGreaterThan(0)
  })

  await test.step('hydrates and completes a same-origin server function GET', async () => {
    const navigation = await page.goto('/')
    expect(navigation?.status()).toBe(200)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'TanStack Start on Render',
      }),
    ).toBeVisible()

    const checkServer = page.getByRole('button', { name: 'Check the server' })
    await expect(checkServer).toBeEnabled()

    const rpcResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.origin === appOrigin && url.pathname.startsWith('/_serverFn/')
    })
    await checkServer.click()
    const rpcResponse = await rpcResponsePromise
    const rpcUrl = new URL(rpcResponse.url())

    expect(rpcResponse.request().method()).toBe('GET')
    expect(rpcResponse.status()).toBe(200)
    expect(rpcUrl.origin).toBe(appOrigin)
    expect(rpcUrl.pathname.slice('/_serverFn/'.length)).not.toBe('')
    await expect(checkServer).toBeEnabled()
    await expect(checkServer).toBeFocused()
    await expect(
      page.getByText('Response received', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('TanStack Start server function', { exact: true }),
    ).toBeVisible()

    const serverTime = await page
      .locator('.server-result time')
      .getAttribute('datetime')
    if (!serverTime)
      throw new Error('The server response did not include a time.')
    expect(Number.isFinite(Date.parse(serverTime))).toBe(true)

    const crossSiteResponse = await request.get(rpcUrl.href, {
      headers: {
        Origin: 'https://attacker.invalid',
        'Sec-Fetch-Site': 'cross-site',
      },
    })
    expect(crossSiteResponse.status()).toBe(403)

    await expectNoAxeViolations(page, testInfo, 'home-success')
  })

  await test.step('uses typed client navigation and supports direct SSR', async () => {
    await page.evaluate(() => {
      Reflect.set(globalThis, '__tanstackClientNavigationProbe', true)
    })
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'How it works', exact: true })
      .click()

    await expect(page).toHaveURL(new URL('/about', baseURL).href)
    expect(
      await page.evaluate(() =>
        Reflect.get(globalThis, '__tanstackClientNavigationProbe'),
      ),
    ).toBe(true)
    await expect(
      page.getByRole('heading', { level: 1, name: 'How it works' }),
    ).toBeVisible()
    await expect(page).toHaveTitle('How it works | TanStack Start on Render')
    await expect(page.locator('#main-content')).toBeFocused()

    const directResponse = await page.reload()
    expect(directResponse?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { level: 1, name: 'How it works' }),
    ).toBeVisible()
    await expect(page).toHaveTitle('How it works | TanStack Start on Render')
  })

  await test.step('provides a visible keyboard skip path', async () => {
    await page.goto('/')
    const skipLink = page.getByRole('link', { name: 'Skip to content' })

    await page.keyboard.press('Tab')
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toBeInViewport()
    const outline = await skipLink.evaluate((element) => {
      const styles = getComputedStyle(element)
      return {
        style: styles.outlineStyle,
        width: Number.parseFloat(styles.outlineWidth),
      }
    })
    expect(outline.style).not.toBe('none')
    expect(outline.width).toBeGreaterThanOrEqual(2)

    await page.keyboard.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
  })

  await test.step('reflows without horizontal scrolling at 320 CSS pixels', async () => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/')
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'TanStack Start on Render',
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Check the server' }),
    ).toBeVisible()

    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ),
    }))
    expect(dimensions.viewportWidth).toBe(320)
    expect(dimensions.documentWidth).toBeLessThanOrEqual(
      dimensions.viewportWidth,
    )
  })

  await test.step('returns and renders the custom 404 surface', async () => {
    const missingResponse = await page.goto(notFoundPath)
    expect(missingResponse?.status()).toBe(404)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'This route is not part of the starter.',
      }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back home' })).toBeVisible()
    await expect(page.locator('#main-content')).toBeFocused()
    await expect(page).toHaveTitle('Page not found | TanStack Start on Render')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex',
    )
    await expectNoAxeViolations(page, testInfo, 'not-found')
  })

  expect(pageErrors, 'uncaught browser exceptions').toEqual([])
  expect(
    consoleProblems.filter(
      (problem) =>
        !(
          problem.type === 'error' &&
          problem.url === notFoundUrl &&
          problem.lineNumber === 0 &&
          problem.columnNumber === 0 &&
          problem.text.startsWith('Failed to load resource:')
        ),
    ),
    'browser console warnings/errors',
  ).toEqual([])
})

async function expectNoAxeViolations(
  page: Page,
  testInfo: TestInfo,
  surface: string,
) {
  const results = await new AxeBuilder({ page })
    .withTags(wcag22AaTags)
    .analyze()

  if (results.violations.length > 0) {
    await testInfo.attach(`${surface}-axe-results`, {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    })
  }

  expect(results.violations, `${surface} axe violations`).toEqual([])
}
