import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-utils";
import { getRouteMetadata } from "@/lib/metadata";
import { adminLink, getSignInPath, ROUTES } from "@/lib/routes";

export const dynamic = "force-dynamic";
export const metadata = getRouteMetadata(adminLink, {
  robots: { index: false, follow: false },
});

const adminTools = [
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/referendum-positions", label: "Referendum positions" },
  { href: "/admin/communications", label: "Communications" },
  { href: "/admin/task-payouts", label: "Task payouts" },
];

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect(getSignInPath(ROUTES.admin));
  if (user.isAdmin !== true) redirect(ROUTES.home);

  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-black uppercase">Admin</h1>
      <nav aria-label="Admin tools" className="grid gap-3 sm:grid-cols-2">
        {adminTools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="border-2 border-foreground px-4 py-4 font-bold transition-colors hover:bg-muted"
          >
            {tool.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
