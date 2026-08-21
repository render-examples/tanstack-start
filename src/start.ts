import { createSerializationAdapter } from '@tanstack/react-router'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

const PUBLIC_ERROR_MESSAGE = 'The request could not be completed.'

const publicErrorAdapter = createSerializationAdapter({
  key: 'render-start/public-error',
  test: (value): value is Error => value instanceof Error,
  toSerializable: () => null,
  fromSerializable: () => new Error(PUBLIC_ERROR_MESSAGE),
})

// Defining a Start instance replaces the framework's implicit CSRF default,
// so preserve the same server-function-only protection explicitly.
const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  serializationAdapters: [publicErrorAdapter],
  requestMiddleware: [csrfMiddleware],
}))
