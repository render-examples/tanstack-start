import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
} from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: ({ matches }) => {
    const isError = matches.some((match) => match.status === 'error')
    const isNotFound = matches.some(
      (match) => match.status === 'notFound' || match._notFound,
    )
    const isAbout = matches.some((match) => match.pathname === '/about')
    const title = isError
      ? 'Application error | TanStack Start on Render'
      : isNotFound
        ? 'Page not found | TanStack Start on Render'
        : isAbout
          ? 'How it works | TanStack Start on Render'
          : 'TanStack Start on Render | SSR starter'
    const description = isError
      ? 'The requested page could not be rendered.'
      : isNotFound
        ? 'The requested path is not included in this TanStack Start template.'
        : isAbout
          ? 'Follow the one-service request path and learn which demonstration files to replace first.'
          : 'A continuously verified TanStack Start SSR template for one native Render Node service, with no required secrets.'
    const socialTitle = isError
      ? 'Application error'
      : isNotFound
        ? 'Page not found'
        : isAbout
          ? 'How TanStack Start runs on Render'
          : 'TanStack Start on Render'

    return {
      meta: [
        {
          charSet: 'utf-8',
        },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
        {
          title,
        },
        {
          name: 'description',
          content: description,
        },
        ...(isError || isNotFound
          ? [
              {
                name: 'robots',
                content: 'noindex',
              },
            ]
          : []),
        {
          name: 'theme-color',
          content: '#f4f3ee',
        },
        {
          property: 'og:title',
          content: socialTitle,
        },
        {
          property: 'og:description',
          content: description,
        },
        {
          property: 'og:type',
          content: 'website',
        },
        {
          name: 'twitter:card',
          content: 'summary',
        },
        {
          name: 'twitter:title',
          content: socialTitle,
        },
        {
          name: 'twitter:description',
          content: description,
        },
      ],
      links: [
        {
          rel: 'stylesheet',
          href: appCss,
        },
        {
          rel: 'icon',
          type: 'image/svg+xml',
          href: '/favicon.svg',
        },
      ],
    }
  },
  component: RootContent,
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function RootContent() {
  return <Outlet />
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <RouteFocusManager />
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="site-shell">
          <header className="site-header">
            <Link
              aria-label="TanStack Start on Render home"
              className="brand"
              to="/"
            >
              <span className="brand-mark" aria-hidden="true" />
              <span>Start on Render</span>
            </Link>
            <nav className="site-nav" aria-label="Primary navigation">
              <Link to="/" activeOptions={{ exact: true }}>
                Home
              </Link>
              <Link to="/about">How it works</Link>
              <a href="/health">Health JSON</a>
            </nav>
          </header>
          {children}
          <footer className="site-footer">
            <p>TanStack Start × Render</p>
            <p>One service. No required secrets.</p>
          </footer>
        </div>
        <Scripts />
      </body>
    </html>
  )
}

function RouteFocusManager() {
  const router = useRouter()

  useEffect(() => {
    let frame: number | undefined
    const unsubscribe = router.subscribe('onRendered', (event) => {
      if (!event.pathChanged) return

      frame = requestAnimationFrame(() => {
        document.getElementById('main-content')?.focus()
      })
    })

    return () => {
      unsubscribe()
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [router])

  return null
}

function NotFound() {
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    mainRef.current?.focus()
  }, [])

  return (
    <main className="state-page" id="main-content" ref={mainRef} tabIndex={-1}>
      <p className="state-code">404 / route not found</p>
      <h1>This route is not part of the starter.</h1>
      <p>
        Check the address, return to the proof app, or inspect the raw health
        response instead.
      </p>
      <div className="state-actions">
        <Link className="button button-primary" to="/">
          Back home
        </Link>
        <a className="text-link" href="/health">
          Open /health
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </main>
  )
}
