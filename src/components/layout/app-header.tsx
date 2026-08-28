import { Menu as MenuIcon } from 'lucide-react'
import { Menu } from '@/components/ui/menu'
import type { AuthUser } from '@/features/auth/auth-schema'
import { useLogout } from '@/features/auth/session-queries'

/**
 * Header with the burger menu. Both entries end the session and return to the
 * login page, so a different user can sign in.
 */
export function AppHeader({ user }: { user: AuthUser }) {
  const logout = useLogout()

  return (
    <header className="flex items-center justify-end gap-3 border-b border-border px-5 py-2 lg:px-6">
      <span className="truncate text-sm text-muted-foreground">{user.email}</span>
      <Menu
        items={[
          { label: 'Switch User', onSelect: () => logout.mutate() },
          { label: 'Logout', onSelect: () => logout.mutate(), destructive: true },
        ]}
        label="Account menu"
        trigger={<MenuIcon aria-hidden className="size-5" />}
      />
    </header>
  )
}
