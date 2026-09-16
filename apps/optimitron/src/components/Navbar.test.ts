import { describe, expect, it } from "vitest";

import {
  adminLink,
  collectionsLink,
  documentsLink,
  editProfileLink,
  publicProfileLink,
} from "@/lib/routes";
import { getAuthenticatedProfileLinks } from "./Navbar";

describe("Navbar profile links", () => {
  it("shows the admin destination only with an explicit admin permission", () => {
    expect(getAuthenticatedProfileLinks(null, true)).toContainEqual(adminLink);
    expect(getAuthenticatedProfileLinks(null, false)).not.toContainEqual(adminLink);
    expect(getAuthenticatedProfileLinks(null)).not.toContainEqual(adminLink);
  });

  it("keeps profile editing reachable when a public profile exists", () => {
    expect(getAuthenticatedProfileLinks(null)).toEqual([
      documentsLink,
      collectionsLink,
      editProfileLink,
    ]);

    expect(getAuthenticatedProfileLinks("/people/mike")).toEqual([
      documentsLink,
      collectionsLink,
      editProfileLink,
      {
        ...publicProfileLink,
        href: "/people/mike",
      },
    ]);
  });
});
