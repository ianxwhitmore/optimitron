import { describe, expect, it, vi } from "vitest"
import AdminLayout from "../../app/admin/layout"

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }))
vi.mock("../../../../packages/site-kit/src/lib/auth-utils", () => mocks)
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) },
}))

describe("campaign admin layout", () => {
  it("sends signed-out visitors from other sites to sign in for the admin hub", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    await expect(AdminLayout({ children: "Protected tools" })).rejects.toThrow(
      "REDIRECT:/auth/signin?callbackUrl=/admin",
    )
  })

  it("lets database failures reach error handling instead of sending users home", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("database unavailable"))
    await expect(AdminLayout({ children: "Protected tools" })).rejects.toThrow(
      "database unavailable",
    )
  })
})
