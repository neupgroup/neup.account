// Exports a single shared Prisma client instance for the entire application.
// Uses a PostgreSQL connection pool via pg + @prisma/adapter-pg for better
// connection management under Next.js serverless/edge conditions.
// In development, the instance is attached to globalThis to survive hot reloads
// without creating a new connection pool on every file change.

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../prisma/generated/client/client'

const connectionString = process.env.DATABASE_URL

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)

const prismaClientSingleton = () => {
  return new PrismaClient({ adapter })
}

// Guards against using a stale cached client that is missing newer models.
// If the cached instance doesn't have all expected delegates, a fresh one is created.
function hasRequiredDelegates(client: ReturnType<typeof prismaClientSingleton> | undefined): boolean {
  if (!client) return false

  const candidate = client as any
  return Boolean(
    candidate.portfolio &&
    candidate.portfolioAsset &&
    candidate.member &&
    // New/renamed delegates in the generated client
    (candidate.authnSession || candidate.authSession) &&
    (candidate.authnRequest || candidate.authRequest) &&
    (candidate.authnMethod || candidate.authMethod) &&
    (candidate.member || candidate.portfolioRole) &&
    candidate.systemConfig,
  )
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = hasRequiredDelegates(globalThis.prisma)
  ? globalThis.prisma!
  : prismaClientSingleton()

export default prisma

// Persist the instance on globalThis in development to avoid exhausting the connection pool
if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma
