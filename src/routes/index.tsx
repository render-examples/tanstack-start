import { createFileRoute, Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { getServerProof } from '../server-demo.functions'

export const Route = createFileRoute('/')({
  loader: () => ({
    deploymentFacts: [
      '1 native Node service',
      '0 required secrets',
      'Free-plan default',
    ],
    runtimeContract: [
      { label: 'Runtime', value: 'Node 24' },
      { label: 'Build', value: 'npm run build' },
      { label: 'Start', value: 'node .output/server/index.mjs' },
      { label: 'Health', value: 'GET /health' },
    ],
  }),
  component: Home,
})

function Home() {
  const { deploymentFacts, runtimeContract } = Route.useLoaderData()

  return (
    <main className="home-page" id="main-content" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" aria-hidden="true" />
            Production-shaped starter
          </p>
          <h1 id="hero-title">TanStack Start on Render</h1>
          <p className="hero-lede">
            One Node service delivers server-rendered React, typed routes, a
            real server function, client assets, and a dedicated health
            check—without a database or required secrets.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#server-proof">
              Try the server function
            </a>
            <Link className="text-link" to="/about">
              How it works
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ul className="signal-list" aria-label="Template constraints">
            {deploymentFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>

        <aside className="runtime-card" aria-label="Render runtime contract">
          <div className="runtime-card-bar">
            <span className="window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>render.yaml</span>
          </div>
          <dl className="runtime-list">
            {runtimeContract.map(({ label, value }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="runtime-status">
            <span aria-hidden="true">✓</span>
            Production contract encoded
          </p>
        </aside>
      </section>

      <section
        className="proof-section"
        id="server-proof"
        aria-labelledby="proof-title"
      >
        <div className="section-heading">
          <p className="section-kicker">What this proves</p>
          <h2 id="proof-title">The important boundaries already work.</h2>
          <p>
            The demo stays intentionally small so every moving part is visible,
            replaceable, and tested in the same production shape Render runs.
          </p>
        </div>

        <div className="proof-grid">
          <ServerProof />
          <article className="proof-card">
            <span className="proof-index">02</span>
            <h3>Typed route</h3>
            <p>
              Follow a client-side link, then reload the destination to prove
              both navigation paths.
            </p>
            <Link className="card-link" to="/about">
              Open How it works
              <span aria-hidden="true">→</span>
            </Link>
          </article>
          <article className="proof-card">
            <span className="proof-index">03</span>
            <h3>Raw health route</h3>
            <p>
              Render checks a dependency-free endpoint that returns 200 JSON
              with a no-store policy.
            </p>
            <a className="card-link" href="/health">
              Open /health
              <span aria-hidden="true">→</span>
            </a>
          </article>
        </div>
      </section>
    </main>
  )
}

type ServerProofState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; result: Awaited<ReturnType<typeof getServerProof>> }
  | { status: 'error' }

function ServerProof() {
  const checkServer = useServerFn(getServerProof)
  const [state, setState] = useState<ServerProofState>({ status: 'idle' })

  async function handleCheck() {
    if (state.status === 'pending') return

    setState({ status: 'pending' })

    try {
      const result = await checkServer()
      setState({ status: 'success', result })
    } catch {
      setState({ status: 'error' })
    }
  }

  return (
    <article className="proof-card proof-card-interactive">
      <span className="proof-index">01</span>
      <h3>Real server function</h3>
      <p>
        Trigger a read-only round trip. The timestamp is created on the server
        only after you ask for it.
      </p>
      <button
        className="button server-button"
        type="button"
        aria-disabled={state.status === 'pending'}
        onClick={handleCheck}
      >
        {state.status === 'pending' ? 'Checking…' : 'Check the server'}
      </button>
      <div className="server-result" aria-live="polite" aria-atomic="true">
        {state.status === 'idle' && <p>Ready for a same-origin request.</p>}
        {state.status === 'pending' && <p>Waiting for the server response…</p>}
        {state.status === 'error' && (
          <p role="alert">The server could not respond. Please try again.</p>
        )}
        {state.status === 'success' && (
          <dl>
            <div>
              <dt>Status</dt>
              <dd>
                {state.result.ok ? 'Response received' : 'Unexpected response'}
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{state.result.source}</dd>
            </div>
            <div>
              <dt>Server time</dt>
              <dd>
                <time dateTime={state.result.serverTime}>
                  {state.result.serverTime}
                </time>
              </dd>
            </div>
          </dl>
        )}
      </div>
    </article>
  )
}
