import type { ReactNode } from "react"
import { requireAdminPage } from "../../lib/admin-access"
import { Layout } from "../layout"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage()

  return <Layout>{children}</Layout>
}
