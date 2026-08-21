import {
  createRouter as createTanStackRouter,
  Link,
  useRouter,
} from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: AppErrorFallback,
  })

  return router
}

function AppErrorFallback() {
  const router = useRouter()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    mainRef.current?.focus()
  }, [])

  return (
    <main
      aria-labelledby="application-error-title"
      className="state-page"
      id="main-content"
      ref={mainRef}
      tabIndex={-1}
    >
      <p className="state-code">Application error</p>
      <h1 id="application-error-title">Something interrupted this request.</h1>
      <p>
        This recovery screen stays generic, and Error details are redacted in
        transit. Keep secrets out of thrown values and application logs.
      </p>
      <div className="state-actions">
        <button
          className="button button-primary"
          type="button"
          onClick={() => void router.invalidate()}
        >
          Try again
        </button>
        <Link className="text-link" to="/">
          Back home
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </main>
  )
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
