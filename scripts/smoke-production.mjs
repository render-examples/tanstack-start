import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access } from 'node:fs/promises'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const serverEntry = new URL('../.output/server/index.mjs', import.meta.url)
const startupTimeoutMs = 30_000
const startupRequestTimeoutMs = 1_000
const requestTimeoutMs = 4_500
const shutdownTimeoutMs = 25_000

await access(serverEntry)

const port = await reservePort()
const origin = `http://127.0.0.1:${port}`
const output = []
const serverEnvironment = {
  ...process.env,
  HOST: '0.0.0.0',
  NODE_ENV: 'production',
  PORT: String(port),
}

// Test-runner flags disable srvx's signal handlers. The child should model the
// production Render process, not inherit CI's test-only shutdown behavior.
delete serverEnvironment.CI
delete serverEnvironment.TEST

const child = spawn(process.execPath, [fileURLToPath(serverEntry)], {
  env: serverEnvironment,
  stdio: ['ignore', 'pipe', 'pipe'],
})
const childExit = once(child, 'exit').then(([code, signal]) => ({
  code,
  signal,
}))

child.stdout.on('data', captureOutput)
child.stderr.on('data', captureOutput)

let shutdownComplete = false

try {
  await waitUntilHealthy(`${origin}/health`)

  const healthStartedAt = performance.now()
  const healthResponse = await request(`${origin}/health`)
  const healthDurationMs = performance.now() - healthStartedAt

  assert.equal(healthResponse.status, 200)
  assert.match(
    healthResponse.headers.get('content-type') ?? '',
    /^application\/json\b/i,
  )
  assert.match(
    healthResponse.headers.get('cache-control') ?? '',
    /(?:^|,)\s*no-store\b/i,
  )
  assert.deepEqual(await healthResponse.json(), { status: 'ok' })
  assert.ok(
    healthDurationMs < requestTimeoutMs,
    `/health took ${healthDurationMs.toFixed(0)}ms; expected under ${requestTimeoutMs}ms`,
  )

  const homeResponse = await request(`${origin}/`)
  const homeHtml = await homeResponse.text()
  assert.equal(homeResponse.status, 200)
  assert.match(homeResponse.headers.get('content-type') ?? '', /^text\/html\b/i)
  assert.match(homeHtml, /<h1(?:\s[^>]*)?>TanStack Start on Render<\/h1>/)
  assert.match(homeHtml, /1 native Node service/)
  assert.match(homeHtml, /node \.output\/server\/index\.mjs/)
  assert.match(homeHtml, /Real server function/)
  assert.match(homeHtml, /Check the server/)
  assert.match(homeHtml, /Ready for a same-origin request\./)
  assert.doesNotMatch(homeHtml, /Response received/)

  const assetPath = homeHtml.match(
    /["'](\/assets\/[^"']+\.(?:css|js))["']/,
  )?.[1]
  assert.ok(
    assetPath,
    'Could not discover a built CSS or JavaScript asset in the SSR HTML.',
  )

  const assetResponse = await request(new URL(assetPath, origin))
  assert.equal(assetResponse.status, 200)
  assert.match(
    assetResponse.headers.get('content-type') ?? '',
    /^(?:text\/css|(?:application|text)\/javascript)\b/i,
  )
  assert.ok(
    (await assetResponse.arrayBuffer()).byteLength > 0,
    'Built asset was empty.',
  )

  const faviconResponse = await request(`${origin}/favicon.svg`)
  assert.equal(faviconResponse.status, 200)
  assert.match(
    faviconResponse.headers.get('content-type') ?? '',
    /^image\/svg\+xml\b/i,
  )
  assert.ok(
    (await faviconResponse.arrayBuffer()).byteLength > 0,
    'Favicon asset was empty.',
  )

  const aboutResponse = await request(`${origin}/about`)
  const aboutHtml = await aboutResponse.text()
  assert.equal(aboutResponse.status, 200)
  assert.match(
    aboutResponse.headers.get('content-type') ?? '',
    /^text\/html\b/i,
  )
  assert.match(aboutHtml, /<h1(?:\s[^>]*)?>How it works<\/h1>/)

  const missingResponse = await request(`${origin}/this-route-must-not-exist`)
  const missingHtml = await missingResponse.text()
  assert.equal(missingResponse.status, 404)
  assert.match(
    missingResponse.headers.get('content-type') ?? '',
    /^text\/html\b/i,
  )
  assert.match(missingHtml, /This route is not part of the starter\./)
  assert.match(
    missingHtml,
    /<title>Page not found \| TanStack Start on Render<\/title>/,
  )
  assert.match(missingHtml, /<meta name="robots" content="noindex"/)

  const shutdownStartedAt = performance.now()
  assert.equal(
    child.kill('SIGTERM'),
    true,
    'Could not send SIGTERM to the production server.',
  )
  const exit = await withTimeout(
    childExit,
    shutdownTimeoutMs,
    `Production server did not exit within ${shutdownTimeoutMs}ms after SIGTERM.`,
  )
  shutdownComplete = true

  assert.deepEqual(exit, { code: 0, signal: null })

  console.log(
    [
      'Production smoke passed.',
      `port=${port}`,
      `health=${healthDurationMs.toFixed(0)}ms`,
      `asset=${assetPath}`,
      'favicon=/favicon.svg',
      'routes=/,/about,404',
      `shutdown=${(performance.now() - shutdownStartedAt).toFixed(0)}ms`,
    ].join(' '),
  )
} catch (error) {
  if (output.length > 0) {
    console.error(`Production server output:\n${output.join('')}`)
  }
  throw error
} finally {
  if (
    !shutdownComplete &&
    child.exitCode === null &&
    child.signalCode === null
  ) {
    child.kill('SIGTERM')

    try {
      await withTimeout(childExit, 5_000, 'Cleanup timeout')
    } catch {
      child.kill('SIGKILL')
      await withTimeout(
        childExit,
        5_000,
        'Production server cleanup failed after SIGKILL.',
      )
    }
  }
}

function captureOutput(chunk) {
  if (output.join('').length < 32_000) {
    output.push(chunk.toString())
  }
}

async function request(input, timeoutMs = requestTimeoutMs) {
  return fetch(input, {
    signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs))),
  })
}

async function reservePort() {
  const probe = createServer()
  probe.unref()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')

  const address = probe.address()
  assert.ok(address && typeof address === 'object')
  const { port: availablePort } = address

  probe.close()
  await once(probe, 'close')

  return availablePort
}

async function waitUntilHealthy(url) {
  const deadline = performance.now() + startupTimeoutMs

  while (true) {
    const waitRemainingMs = deadline - performance.now()
    if (waitRemainingMs <= 0) break

    const exited = await Promise.race([
      childExit.then((result) => result),
      new Promise((resolve) =>
        setTimeout(() => resolve(null), Math.min(200, waitRemainingMs)),
      ),
    ])

    assert.equal(
      exited,
      null,
      `Production server exited before becoming healthy: ${JSON.stringify(exited)}`,
    )

    const requestRemainingMs = deadline - performance.now()
    if (requestRemainingMs <= 0) break

    try {
      const response = await request(
        url,
        Math.min(startupRequestTimeoutMs, requestRemainingMs),
      )
      if (response.status === 200 && performance.now() <= deadline) return
    } catch {
      // The socket is expected to refuse connections until Nitro is ready.
    }
  }

  throw new Error(
    `Production server did not become healthy within ${startupTimeoutMs}ms.`,
  )
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
