import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  access,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const nodeModulesPath = join(projectRoot, 'node_modules')
const temporaryPrefix = 'render-start-error-boundary-'
const buildTimeoutMs = 120_000
const startupTimeoutMs = 30_000
const requestTimeoutMs = 5_000
const browserTimeoutMs = 10_000
const shutdownTimeoutMs = 10_000
const cleanupTimeoutMs = 10_000
const outputLimit = 128_000

let phase = 'create the disposable project'
let temporaryRoot
let productionServer
let productionServerExit
let browser
let buildOutput = ''
let runError
const serverOutput = createOutputBuffer(outputLimit)
const cleanupErrors = []

try {
  temporaryRoot = await mkdtemp(join(tmpdir(), temporaryPrefix))
  await createProjectCopy(temporaryRoot)

  const nonce = randomUUID().replaceAll('-', '')
  const loaderSentinel = `ERROR_BOUNDARY_LOADER_${nonce}`
  const rpcSentinel = `ERROR_BOUNDARY_RPC_${nonce}`
  const loaderSourcePath = join(
    temporaryRoot,
    'src/routes/error-boundary-probe.tsx',
  )
  const rpcSourcePath = join(temporaryRoot, 'src/server-demo.functions.ts')

  phase = 'inject the temporary failures'
  await Promise.all([
    writeLoaderProbe(loaderSourcePath, loaderSentinel),
    writeServerFunctionProbe(rpcSourcePath, rpcSentinel),
  ])

  phase = 'build the disposable production app'
  const viteEntry = join(nodeModulesPath, 'vite/bin/vite.js')
  const buildResult = await runBoundedProcess(
    process.execPath,
    [viteEntry, 'build'],
    {
      cwd: temporaryRoot,
      env: process.env,
      timeoutMs: buildTimeoutMs,
    },
  )
  buildOutput = buildResult.output

  const productionEntry = join(temporaryRoot, '.output/server/index.mjs')
  await access(productionEntry)

  phase = 'start the disposable production server'
  const port = await reservePort()
  const origin = `http://127.0.0.1:${port}`
  const serverEnvironment = {
    ...process.env,
    HOST: '0.0.0.0',
    NODE_ENV: 'production',
    PORT: String(port),
  }

  // srvx disables its production signal handlers under test-runner flags.
  delete serverEnvironment.CI
  delete serverEnvironment.TEST

  productionServer = spawn(process.execPath, [productionEntry], {
    cwd: temporaryRoot,
    env: serverEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  productionServerExit = childExit(productionServer)
  productionServer.stdout.on('data', serverOutput.append)
  productionServer.stderr.on('data', serverOutput.append)

  await waitUntilHealthy(`${origin}/health`, productionServerExit)

  phase = 'verify the full SSR error response'
  const loaderResponse = await request(`${origin}/error-boundary-probe`)
  const loaderHtml = await loaderResponse.text()

  assert.equal(loaderResponse.status, 500)
  assert.match(
    loaderResponse.headers.get('content-type') ?? '',
    /^text\/html\b/i,
  )
  assert.match(loaderHtml, /Something interrupted this request\./)
  assert.match(loaderHtml, /This recovery screen stays generic/)
  assert.doesNotMatch(loaderHtml, new RegExp(loaderSentinel))
  assert.equal(
    loaderHtml.includes(loaderSourcePath),
    false,
    'The absolute loader source path leaked into the SSR response.',
  )
  assert.equal(
    loaderHtml.includes(temporaryRoot),
    false,
    'The disposable project path leaked into the SSR response.',
  )
  assertErrorMetadata(loaderHtml)

  phase = 'hydrate and retry the generic error surface'
  browser = await chromium.launch({
    headless: true,
    timeout: browserTimeoutMs,
  })
  const chromiumVersion = browser.version()
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(browserTimeoutMs)
  page.setDefaultTimeout(browserTimeoutMs)

  const browserProblems = []
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      browserProblems.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    browserProblems.push(`pageerror: ${error.stack ?? error.message}`)
  })

  const navigation = await page.goto(`${origin}/error-boundary-probe`, {
    waitUntil: 'domcontentloaded',
  })
  assert.equal(navigation?.status(), 500)

  const errorHeading = page.getByRole('heading', {
    level: 1,
    name: 'Something interrupted this request.',
  })
  await errorHeading.waitFor({ state: 'visible' })
  await page.waitForFunction(
    () => document.activeElement?.id === 'main-content',
  )
  assert.equal(
    (await page.locator('body').innerText()).includes(loaderSentinel),
    false,
    'The loader sentinel appeared in the hydrated user interface.',
  )
  assert.equal(
    await page.evaluate(() =>
      Number(Reflect.get(globalThis, '__renderErrorBoundaryRetryCount') ?? 0),
    ),
    0,
    'The loader unexpectedly reran during hydration.',
  )
  assertNoHydrationProblems(browserProblems)

  const retryButton = page.getByRole('button', { name: 'Try again' })
  await retryButton.click()
  await page.waitForFunction(
    () =>
      Number(Reflect.get(globalThis, '__renderErrorBoundaryRetryCount') ?? 0) >=
      1,
  )
  await errorHeading.waitFor({ state: 'visible' })
  assert.equal(
    (await page.locator('body').innerText()).includes(loaderSentinel),
    false,
    'The loader sentinel appeared in the interface after retry.',
  )
  assertNoHydrationProblems(browserProblems)

  phase = 'verify the server-function error response and CSRF policy'
  const homeNavigation = await page.goto(origin, {
    waitUntil: 'domcontentloaded',
  })
  assert.equal(homeNavigation?.status(), 200)

  const serverButton = page.getByRole('button', {
    name: 'Check the server',
  })
  const rpcResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.origin === origin && url.pathname.startsWith('/_serverFn/')
  })

  await serverButton.click()
  const rpcResponse = await rpcResponsePromise
  const rpcBody = await withTimeout(
    rpcResponse.text(),
    requestTimeoutMs,
    'Timed out while reading the server-function error body.',
  )
  const rpcUrl = rpcResponse.url()

  assert.equal(rpcResponse.request().method(), 'GET')
  assert.equal(
    rpcResponse.status(),
    500,
    `Unexpected server-function response: ${rpcUrl}\n${rpcBody}`,
  )
  assert.equal(
    rpcBody.includes(rpcSentinel),
    false,
    'The server-function sentinel leaked into the RPC response.',
  )
  assert.equal(
    rpcBody.includes(rpcSourcePath),
    false,
    'The server-function source path leaked into the RPC response.',
  )
  assert.equal(
    rpcBody.includes(temporaryRoot),
    false,
    'The disposable project path leaked into the RPC response.',
  )
  await page
    .getByRole('alert')
    .filter({ hasText: 'The server could not respond. Please try again.' })
    .waitFor({ state: 'visible' })
  assert.equal(
    (await page.locator('body').innerText()).includes(rpcSentinel),
    false,
    'The server-function sentinel appeared in the user interface.',
  )
  assert.equal(
    await serverButton.evaluate((button) => button === document.activeElement),
    true,
  )

  const crossSiteResponse = await request(rpcUrl, {
    headers: {
      Origin: 'https://attacker.invalid',
      'Sec-Fetch-Site': 'cross-site',
      'x-tsr-serverFn': 'true',
    },
  })
  const crossSiteBody = await crossSiteResponse.text()
  assert.equal(crossSiteResponse.status, 403)
  assert.equal(
    crossSiteBody.includes(rpcSentinel),
    false,
    'The rejected cross-site response disclosed the RPC sentinel.',
  )

  phase = 'verify the temporary 404 response'
  const notFoundResponse = await request(
    `${origin}/error-boundary-gate-not-found`,
  )
  const notFoundHtml = await notFoundResponse.text()
  assert.equal(notFoundResponse.status, 404)
  assert.match(notFoundHtml, /This route is not part of the starter\./)
  assert.doesNotMatch(notFoundHtml, new RegExp(loaderSentinel))
  assert.doesNotMatch(notFoundHtml, new RegExp(rpcSentinel))

  console.log(
    [
      'Error-boundary disclosure gate passed.',
      'loader=500',
      'rpc=500',
      'cross-site=403',
      'not-found=404',
      `chromium=${chromiumVersion}`,
    ].join(' '),
  )
} catch (error) {
  console.error(
    `Error-boundary disclosure gate failed while trying to ${phase}.`,
  )

  if (temporaryRoot) console.error(`Disposable project: ${temporaryRoot}`)
  if (buildOutput) console.error(`Build output:\n${buildOutput}`)
  if (serverOutput.value()) {
    console.error(`Production server output:\n${serverOutput.value()}`)
  }

  runError = error
} finally {
  if (browser) {
    try {
      await withTimeout(
        browser.close(),
        cleanupTimeoutMs,
        'Chromium did not close within the cleanup timeout.',
      )
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  if (productionServer && productionServerExit) {
    try {
      await stopChild(productionServer, productionServerExit)
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  if (temporaryRoot) {
    try {
      assert.equal(
        basename(temporaryRoot).startsWith(temporaryPrefix),
        true,
        `Refusing to remove an unexpected path: ${temporaryRoot}`,
      )
      await withTimeout(
        rm(temporaryRoot, { force: true, recursive: true }),
        cleanupTimeoutMs,
        `Disposable project cleanup exceeded ${cleanupTimeoutMs}ms.`,
      )
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
}

if (runError && cleanupErrors.length > 0) {
  throw new AggregateError(
    [runError, ...cleanupErrors],
    'Error-boundary gate and cleanup both failed.',
  )
}

if (runError) throw runError

if (cleanupErrors.length > 0) {
  throw new AggregateError(cleanupErrors, 'Error-boundary gate cleanup failed.')
}

async function createProjectCopy(destination) {
  await access(nodeModulesPath)

  await Promise.all([
    cp(join(projectRoot, 'src'), join(destination, 'src'), {
      preserveTimestamps: true,
      recursive: true,
    }),
    cp(join(projectRoot, 'public'), join(destination, 'public'), {
      preserveTimestamps: true,
      recursive: true,
    }),
    ...[
      '.node-version',
      'package-lock.json',
      'package.json',
      'tsconfig.json',
      'tsr.config.json',
      'vite.config.ts',
    ].map((file) => copyFile(join(projectRoot, file), join(destination, file))),
  ])

  const disposableNodeModules = join(destination, 'node_modules')
  await mkdir(disposableNodeModules)

  const dependencyEntries = await readdir(nodeModulesPath, {
    withFileTypes: true,
  })
  await Promise.all(
    dependencyEntries
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) =>
        symlink(
          join(nodeModulesPath, entry.name),
          join(disposableNodeModules, entry.name),
          entry.isDirectory() ? 'dir' : 'file',
        ),
      ),
  )
}

async function writeLoaderProbe(file, sentinel) {
  const message = `${sentinel} source=${file}`
  const source = `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/error-boundary-probe')({
  loader: () => {
    if (typeof window !== 'undefined') {
      const retryCount = Number(
        Reflect.get(globalThis, '__renderErrorBoundaryRetryCount') ?? 0,
      )
      Reflect.set(
        globalThis,
        '__renderErrorBoundaryRetryCount',
        retryCount + 1,
      )
    }

    throw new Error(${JSON.stringify(message)})
  },
  component: () => null,
})
`

  await writeFile(file, source)
}

async function writeServerFunctionProbe(file, sentinel) {
  const message = `${sentinel} source=${file}`
  const source = `import { createServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'

export const getServerProof = createServerFn({ method: 'GET' }).handler(() => {
  setResponseStatus(500)
  throw new Error(${JSON.stringify(message)})
})
`

  await writeFile(file, source)
}

function assertErrorMetadata(html) {
  const titles = [...html.matchAll(/<title\b[^>]*>[\s\S]*?<\/title>/gi)].map(
    ([tag]) => tag,
  )
  assert.deepEqual(titles, [
    '<title>Application error | TanStack Start on Render</title>',
  ])

  const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag)
  const descriptionTags = metaTags.filter(
    (tag) => readHtmlAttribute(tag, 'name') === 'description',
  )
  assert.equal(
    descriptionTags.length,
    1,
    'Expected exactly one description metadata element.',
  )
  assert.equal(
    readHtmlAttribute(descriptionTags[0], 'content'),
    'The requested page could not be rendered.',
  )

  const robotsTags = metaTags.filter(
    (tag) => readHtmlAttribute(tag, 'name') === 'robots',
  )
  assert.equal(
    robotsTags.length,
    1,
    'Expected exactly one robots metadata element.',
  )
  assert.match(
    readHtmlAttribute(robotsTags[0], 'content') ?? '',
    /\bnoindex\b/i,
  )
}

function readHtmlAttribute(tag, attribute) {
  const match = tag.match(
    new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'),
  )
  return match?.[1] ?? match?.[2]
}

function assertNoHydrationProblems(problems) {
  const hydrationProblems = problems.filter((problem) =>
    /hydration failed|hydration mismatch|did not match|server rendered html/i.test(
      problem,
    ),
  )
  assert.deepEqual(hydrationProblems, [], 'Browser hydration diagnostics')
}

async function request(input, init = {}, timeoutMs = requestTimeoutMs) {
  return fetch(input, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs))),
  })
}

async function reservePort() {
  const probe = createServer()
  probe.unref()
  probe.listen(0, '127.0.0.1')
  await withTimeout(
    once(probe, 'listening'),
    requestTimeoutMs,
    'Timed out while reserving a localhost port.',
  )

  const address = probe.address()
  assert.ok(address && typeof address === 'object')
  const { port } = address

  probe.close()
  await withTimeout(
    once(probe, 'close'),
    requestTimeoutMs,
    'Timed out while releasing the reserved localhost port.',
  )

  return port
}

async function waitUntilHealthy(url, exitPromise) {
  const deadline = performance.now() + startupTimeoutMs

  while (true) {
    const waitRemainingMs = deadline - performance.now()
    if (waitRemainingMs <= 0) break

    const exited = await Promise.race([
      exitPromise,
      new Promise((resolve) =>
        setTimeout(() => resolve(null), Math.min(150, waitRemainingMs)),
      ),
    ])
    assert.equal(
      exited,
      null,
      `Production server exited before health was ready: ${JSON.stringify(exited)}`,
    )

    const requestRemainingMs = deadline - performance.now()
    if (requestRemainingMs <= 0) break

    try {
      const response = await request(
        url,
        {},
        Math.min(requestTimeoutMs, requestRemainingMs),
      )
      if (response.status === 200 && performance.now() <= deadline) return
    } catch {
      // Connection refusal is expected until Nitro starts listening.
    }
  }

  throw new Error(
    `Production server did not become healthy within ${startupTimeoutMs}ms.`,
  )
}

function childExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

async function runBoundedProcess(command, args, options) {
  const output = createOutputBuffer(outputLimit)
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const exitPromise = childExit(child)
  child.stdout.on('data', output.append)
  child.stderr.on('data', output.append)

  let result
  try {
    result = await withTimeout(
      exitPromise,
      options.timeoutMs,
      `Process exceeded ${options.timeoutMs}ms: ${command} ${args.join(' ')}`,
    )
  } catch (error) {
    const processError = new Error(`${error.message}\n${output.value()}`, {
      cause: error,
    })

    try {
      await stopChild(child, exitPromise)
    } catch (shutdownError) {
      throw new AggregateError(
        [processError, shutdownError],
        'Bounded process execution and cleanup both failed.',
      )
    }

    throw processError
  }

  assert.deepEqual(
    result,
    { code: 0, signal: null },
    `Process failed: ${command} ${args.join(' ')}\n${output.value()}`,
  )

  return { ...result, output: output.value() }
}

async function stopChild(child, exitPromise) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return exitPromise
  }

  child.kill('SIGTERM')

  try {
    return await withTimeout(
      exitPromise,
      shutdownTimeoutMs,
      `Child process did not exit within ${shutdownTimeoutMs}ms after SIGTERM.`,
    )
  } catch (error) {
    child.kill('SIGKILL')
    await withTimeout(
      exitPromise,
      cleanupTimeoutMs,
      `Child process did not exit within ${cleanupTimeoutMs}ms after SIGKILL.`,
    )
    throw error
  }
}

function createOutputBuffer(limit) {
  let output = ''
  let truncated = false

  return {
    append(chunk) {
      if (output.length >= limit) {
        truncated = true
        return
      }

      const value = chunk.toString()
      const remaining = limit - output.length
      output += value.slice(0, remaining)
      if (value.length > remaining) truncated = true
    },
    value() {
      return truncated ? `${output}\n[output truncated]` : output
    },
  }
}

async function withTimeout(promise, timeoutMs, message) {
  let timeout

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}
