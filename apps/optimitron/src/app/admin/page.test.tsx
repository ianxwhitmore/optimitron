import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth-utils", () => ({ getCurrentUser: mocks.getCurrentUser }));

import AdminPage from "./page";

describe("AdminPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    mocks.getCurrentUser.mockReset();
  });

  it("sends anonymous visitors to sign in with the admin return path", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(AdminPage()).rejects.toMatchObject({
      digest: expect.stringContaining("/auth/signin?callbackUrl=%2Fadmin"),
    });
  });

  it.each([false, undefined])("denies a user with isAdmin=%s", async (isAdmin) => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user_1", isAdmin });
    await expect(AdminPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/;307;",
    });
  });

  it("shows the existing management destinations to an admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin_1", isAdmin: true });
    const html = renderToStaticMarkup(await AdminPage());

    expect(html).toContain('href="/admin/organizations"');
    expect(html).toContain('href="/admin/referendum-positions"');
    expect(html).toContain('href="/admin/communications"');
    expect(html).toContain('href="/admin/task-payouts"');
  });
});
