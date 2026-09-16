import Link from "next/link"
import { getSiteConfig } from "../../lib/site-config"
import { VARIANTS } from "../../lib/site-variant-types"
import { ROUTES } from "../../lib/routes"

export function AdminHome() {
  const isCampaignSite = getSiteConfig().domain === VARIANTS.WAR_ON_DISEASE
  const campaignUrl = (path: string) =>
    isCampaignSite ? path : `https://warondisease.org${path}`
  const tools = [
    { label: "Organizations", href: campaignUrl(ROUTES.adminOrganizations) },
    { label: "Users", href: campaignUrl(ROUTES.adminUsers) },
    { label: "Page scorecard", href: campaignUrl("/admin/page-scorecard") },
    { label: "Communications", href: "https://optimitron.com/admin/communications" },
    { label: "Task payouts", href: "https://optimitron.com/admin/task-payouts" },
    { label: "Referendum positions", href: "https://optimitron.com/admin/referendum-positions" },
  ]

  return (
    <main className="mx-auto min-h-[60vh] max-w-4xl px-4 py-12">
      <h1 className="mb-8 text-4xl font-black uppercase">Admin</h1>
      <nav aria-label="Admin tools" className="grid gap-4 sm:grid-cols-2">
        {tools.map(({ label, href }) => (
          <Link
            key={label}
            href={href}
            className="border-4 border-primary bg-background p-5 font-bold hover:bg-brutal-yellow"
          >
            {label}
          </Link>
        ))}
      </nav>
    </main>
  )
}
