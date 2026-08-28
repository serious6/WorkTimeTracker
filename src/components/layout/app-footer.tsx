import { useAppVersion } from '@/features/app-info/use-app-version'

export function AppFooter() {
  const version = useAppVersion()

  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-border px-5 py-3 text-xs text-muted-foreground lg:px-6">
      <span>Build with ❤️ in Hamburg</span>
      {version ? <span>v{version}</span> : null}
    </footer>
  )
}
