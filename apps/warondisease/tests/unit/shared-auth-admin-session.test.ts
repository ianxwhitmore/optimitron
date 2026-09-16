import type { Session } from "next-auth"
import type { JWT } from "next-auth/jwt"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }))
vi.mock("../../../../packages/site-kit/src/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}))
vi.mock("../../../../packages/site-kit/src/lib/auth-adapter", () => ({
  createAuthAdapter: () => ({}),
}))
vi.mock("../../../../packages/site-kit/src/lib/email", () => ({
  sendSignupConfirmationEmail: vi.fn(),
}))
vi.mock("../../../../packages/site-kit/src/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    NEXTAUTH_SECRET: "local-auth-unit-test-secret-not-for-production",
    NEXTAUTH_URL: "http://localhost:3001",
  },
}))

import { authOptions } from "../../../../packages/site-kit/src/lib/auth"

const jwt = authOptions.callbacks!.jwt as (args: { token: JWT }) => Promise<JWT>
const session = authOptions.callbacks!.session as (args: {
  token: JWT
  session: Session
}) => Promise<Session>

async function refreshSession(token: JWT) {
  return session({
    token: await jwt({ token }),
    session: { user: {}, expires: "2099-01-01T00:00:00Z" } as Session,
  })
}

beforeEach(() => {
  mocks.findUnique.mockReset()
})

describe("shared admin session refresh", () => {
  it("adds the current admin role to an older session", async () => {
    mocks.findUnique.mockResolvedValue({ id: "user_1", isAdmin: true })
    expect((await refreshSession({ id: "user_1" })).user.isAdmin).toBe(true)
  })

  it("removes admin navigation when the role is revoked", async () => {
    mocks.findUnique.mockResolvedValue({ id: "user_1", isAdmin: false })
    expect((await refreshSession({ id: "user_1", isAdmin: true })).user.isAdmin).toBe(false)
  })

  it("excludes soft-deleted admins from the identity lookup", async () => {
    const deletedUser = { id: "user_1", isAdmin: true, deletedAt: new Date("2026-01-01") }
    mocks.findUnique.mockImplementation(async ({ where }) =>
      where.deletedAt === null ? null : deletedUser,
    )
    expect((await refreshSession({ id: "user_1", isAdmin: true })).user.isAdmin).toBe(false)
  })

  it("clears the admin claim when the account no longer exists", async () => {
    mocks.findUnique.mockResolvedValue(null)
    expect((await refreshSession({ id: "user_1", isAdmin: true })).user.isAdmin).toBe(false)
  })

  it("does not preserve an admin claim without a user identity", async () => {
    expect((await refreshSession({ isAdmin: true })).user.isAdmin).toBe(false)
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })
})
