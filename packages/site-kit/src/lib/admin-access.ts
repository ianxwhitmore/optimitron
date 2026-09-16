import { redirect } from "next/navigation"
import { getCurrentUser } from "./auth-utils"
import { ROUTES } from "./routes"

export async function requireAdminPage() {
  const user = await getCurrentUser()
  if (!user || user.deletedAt) {
    redirect(`${ROUTES.signIn}?callbackUrl=${ROUTES.admin}`)
  }
  if (user.isAdmin !== true) redirect(ROUTES.home)
  return user
}
