import { describe, expect, it } from "vitest";
import { getInternalNavigationRoutes, visibleNavigationItems, type AppNavigation } from "../../../../packages/site-kit/src/lib/app-navigation";

describe("app navigation boundaries", () => {
  const admin = { id: "admin", label: "Admin", path: "/admin", adminOnly: true };

  it("shows restricted links only to administrators", () => {
    const publicLink = { id: "about", label: "About", path: "/about" };
    expect(visibleNavigationItems([publicLink, admin], false)).toEqual([publicLink]);
    expect(visibleNavigationItems([publicLink, admin], true)).toEqual([publicLink, admin]);
  });

  it("keeps inventory within the app and excludes restricted or duplicate destinations", () => {
    const navigation: AppNavigation = {
      topLevelItems: [
        { id: "mcp", label: "MCP", path: "/mcp?source=menu#connect" },
        { id: "other", label: "Other MCP", path: "https://dfda.earth/mcp", isExternal: true },
        { id: "protocol-relative", label: "External", path: "//example.org/page" },
        admin,
      ],
      sidebarSections: [],
      footerSections: [{ id: "tools", label: "Tools", resolvedItems: [{ id: "mcp-footer", label: "Tools", path: "/mcp" }] }],
      legalItems: [],
    };
    expect(getInternalNavigationRoutes(navigation)).toEqual([
      { label: "Home", path: "/" },
      { label: "MCP", path: "/mcp" },
    ]);
  });
});
