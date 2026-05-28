import { redirect } from 'next/navigation'

/** Legacy route — affiliate dashboard moved to /affiliate/dashboard */
export default function LegacyDashboardRedirect() {
  redirect('/affiliate/dashboard')
}
