import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}))
vi.mock("../../../../packages/site-kit/node_modules/next-auth", () => ({
  getServerSession: mocks.getServerSession,
}))
vi.mock("../../../../packages/site-kit/src/lib/auth", () => ({ authOptions: {} }))
vi.mock("../../../../packages/site-kit/src/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique, findMany: mocks.findMany, count: mocks.count } },
}))
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn() }) }))

import { GET } from "../../app/api/admin/users/route"

describe("admin user API authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getServerSession.mockResolvedValue({ user: { id: "admin-account", isAdmin: true } })
    mocks.findMany.mockResolvedValue([])
    mocks.count.mockResolvedValue(0)
  })

  it("rejects a soft-deleted administrator with a live session", async () => {
    const deletedAdmin = { id: "admin-account", isAdmin: true, deletedAt: new Date() }
    // Model the database's soft-delete filter while retaining the live JWT.
    mocks.findUnique.mockImplementation(({ where }) =>
      where.deletedAt === null ? null : deletedAdmin,
    )
    const response = await GET(new NextRequest("http://localhost/api/admin/users"))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Unauthorized - admin access required" })
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  it("rejects a revoked role even when the session still claims admin", async () => {
    mocks.findUnique.mockResolvedValue({ id: "admin-account", isAdmin: false, deletedAt: null })
    const response = await GET(new NextRequest("http://localhost/api/admin/users"))
    expect(response.status).toBe(401)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  it("allows a current non-deleted administrator", async () => {
    mocks.findUnique.mockResolvedValue({ id: "admin-account", isAdmin: true, deletedAt: null })
    const response = await GET(new NextRequest("http://localhost/api/admin/users"))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ users: [], pagination: { total: 0 } })
  })
})
