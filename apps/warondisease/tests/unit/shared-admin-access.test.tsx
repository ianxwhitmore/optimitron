import { describe, expect, it, vi } from "vitest"
import AdminPage from "../../../../packages/site-kit/src/components/admin/admin-page"
import AdminLayout from "../../../../packages/site-kit/src/components/admin/admin-layout"

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }))
vi.mock("../../../../packages/site-kit/src/lib/auth-utils", () => mocks)
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) },
}))

describe.each([
  ["page", () => AdminPage()],
  ["layout", () => AdminLayout({ children: "Protected tools" })],
] as const)("admin %s access", (_name, renderPage) => {
  it.each([
    ["anonymous", null, "/auth/signin?callbackUrl=/admin"],
    ["non-admin", { id: "user", isAdmin: false }, "/"],
    ["missing admin role", { id: "user" }, "/"],
    ["deleted admin", { id: "user", isAdmin: true, deletedAt: new Date("2026-01-01") }, "/auth/signin?callbackUrl=/admin"],
  ])("blocks %s before returning admin content", async (_label, user, destination) => {
    mocks.getCurrentUser.mockResolvedValue(user)
    await expect(renderPage()).rejects.toThrow(`REDIRECT:${destination}`)
  })

  it("allows an active admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", isAdmin: true, deletedAt: null })
    expect(await renderPage()).toBeTruthy()
  })

  it("does not turn a database error into an authentication redirect", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("database unavailable"))
    await expect(renderPage()).rejects.toThrow("database unavailable")
  })
})
