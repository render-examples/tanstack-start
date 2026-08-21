import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="content-page" id="main-content" tabIndex={-1}>
      <header className="content-hero">
        <p className="eyebrow">
          <span className="status-dot" aria-hidden="true" />
          One request path
        </p>
        <h1>How it works</h1>
        <p>
          Render runs one ordinary Node process. Nitro serves TanStack Start's
          server-rendered pages, server functions, and generated assets from the
          same production output.
        </p>
      </header>

      <section className="content-section" aria-labelledby="request-flow-title">
        <div className="section-heading section-heading-compact">
          <p className="section-kicker">Runtime architecture</p>
          <h2 id="request-flow-title">Four layers, one service.</h2>
        </div>
        <ol className="flow-list">
          <li>
            <span>01</span>
            <div>
              <h3>Render web service</h3>
              <p>
                Routes inbound HTTP to the Node process on the injected port.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Nitro server</h3>
              <p>Runs the production entry and serves built client assets.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>TanStack Start</h3>
              <p>
                Handles server rendering, typed routes, and server functions.
              </p>
            </div>
          </li>
          <li>
            <span>04</span>
            <div>
              <h3>Health route</h3>
              <p>
                Returns raw, dependency-free JSON without rendering the app
                shell.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="replace-section" aria-labelledby="replace-title">
        <div>
          <p className="section-kicker">Make it yours</p>
          <h2 id="replace-title">The demonstration has a documented edge.</h2>
        </div>
        <div className="replace-copy">
          <p>
            Replace the two demo routes and server function, then update their
            navigation and content assertions. Keep the router, health route,
            production scripts, smoke harness, and Blueprint as the deployment
            foundation.
          </p>
          <ul className="file-list" aria-label="Demonstration touchpoints">
            <li>
              <code>src/routes/index.tsx</code>
            </li>
            <li>
              <code>src/routes/about.tsx</code>
            </li>
            <li>
              <code>src/server-demo.functions.ts</code>
            </li>
            <li>
              <code>src/routes/__root.tsx</code> <span>· navigation</span>
            </li>
            <li>
              <code>scripts/smoke-production.mjs</code>{' '}
              <span>· demo assertions</span>
            </li>
          </ul>
          <Link className="text-link" to="/">
            Return to the proof app
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  )
}
