/** App-owned links consumed by the shared navigation UI. URLs are explicit. */
export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  description?: string;
  emoji?: string;
  isHashLink?: boolean;
  requiresScrollHandler?: boolean;
  isExternal?: boolean;
  adminOnly?: boolean;
}

export interface NavigationSection {
  id: string;
  label: string;
  resolvedItems: NavigationItem[];
}

export interface AppNavigation {
  topLevelItems: NavigationItem[];
  sidebarSections: NavigationSection[];
  footerSections: NavigationSection[];
  legalItems: NavigationItem[];
}

export function visibleNavigationItems(items: NavigationItem[], isAdmin: boolean) {
  return items.filter((item) => !item.adminOnly || isAdmin);
}

/** Inventory public internal routes without inferring ownership across apps. */
export function getInternalNavigationRoutes(navigation: AppNavigation, defaultRoute = "/") {
  const routes = new Map([[defaultRoute, { label: "Home", path: defaultRoute }]]);
  const items = [
    ...navigation.topLevelItems,
    ...navigation.sidebarSections.flatMap((section) => section.resolvedItems),
    ...navigation.footerSections.flatMap((section) => section.resolvedItems),
    ...navigation.legalItems,
  ];
  for (const item of visibleNavigationItems(items, false)) {
    if (item.isExternal || !item.path.startsWith("/") || item.path.startsWith("//")) continue;
    const path = item.path.split(/[?#]/, 1)[0] || "/";
    if (!routes.has(path)) routes.set(path, { label: item.label, path });
  }
  return [...routes.values()];
}
