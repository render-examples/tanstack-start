import { createServerFn } from '@tanstack/react-start'

export const getServerProof = createServerFn({ method: 'GET' }).handler(() => ({
  ok: true,
  source: 'TanStack Start server function',
  serverTime: new Date().toISOString(),
}))
