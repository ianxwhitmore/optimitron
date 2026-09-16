import { requireAdminPage } from "../../lib/admin-access"
import { AdminHome } from "./admin-home"

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  await requireAdminPage()

  return <AdminHome />
}
