import licenseData from '@/data/licenses.json'

type LicensePackage = {
  name: string
  version: string
  license: string
  publisher: string | null
  repository: string | null
  licenseText: string
}

function PackageNotice({ item }: { item: LicensePackage }) {
  return (
    <details className="rounded-md border border-border p-4">
      <summary className="cursor-pointer font-medium">
        {item.name} {item.version} <span className="text-muted-foreground">({item.license})</span>
      </summary>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[7rem_1fr]">
        <dt className="font-medium">Publisher</dt>
        <dd>{item.publisher ?? 'Not specified'}</dd>
        <dt className="font-medium">Repository</dt>
        <dd>
          {item.repository ? (
            <a className="text-primary underline" href={item.repository} rel="noreferrer" target="_blank">
              {item.repository}
            </a>
          ) : (
            'Not specified'
          )}
        </dd>
        <dt className="font-medium">License text</dt>
        <dd>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-sans text-xs">
            {item.licenseText}
          </pre>
        </dd>
      </dl>
    </details>
  )
}

export function LicensesPage() {
  const sections = [
    ['npm packages', licenseData.npm],
    ['Rust crates', licenseData.rust],
  ] as const

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Third-Party Licenses</h1>
        <p className="text-sm text-muted-foreground">
          Dependencies for version {licenseData.appVersion}, generated on{' '}
          {new Date(licenseData.generatedAt).toLocaleDateString()}.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          This release includes production dependencies only; development-only tools are not shipped.
        </p>
      </header>
      {sections.map(([title, items]) => (
        <section aria-labelledby={`${title}-heading`} className="space-y-3" key={title}>
          <h2 className="text-lg font-semibold" id={`${title}-heading`}>
            {title} ({items.length})
          </h2>
          {items.map((item) => (
            <PackageNotice item={item} key={`${item.name}@${item.version}`} />
          ))}
        </section>
      ))}
    </div>
  )
}
