import type { LegalDocument } from './legal-documents'

/**
 * Renders a legal document. The date is shown as the plain ISO day of the
 * document, not a localised timestamp: it identifies a revision, not a moment
 * in the timezone of the reader.
 */
export function LegalDocumentView({ document: legalDocument }: { document: LegalDocument }) {
  const documentSlug = legalDocument.title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
  const documentId = `legal-${documentSlug || 'document'}`
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{legalDocument.title}</h1>
        <p className="text-sm text-muted-foreground">
          Version {legalDocument.version}, last updated {legalDocument.updatedAt}.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{legalDocument.summary}</p>
      </header>
      {legalDocument.sections.map((section, index) => {
        const headingId = `${documentId}-section-${index}-heading`
        return (
          <section aria-labelledby={headingId} className="space-y-2" key={section.heading}>
            <h2 className="text-lg font-semibold" id={headingId}>
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <p
                className="max-w-3xl text-sm text-muted-foreground"
                key={`${headingId}-paragraph-${paragraphIndex}`}
              >
                {paragraph}
              </p>
            ))}
            {section.items ? (
              <ul className="ml-5 max-w-3xl list-disc space-y-1 text-sm text-muted-foreground">
                {section.items.map((item, itemIndex) => (
                  <li key={`${headingId}-item-${itemIndex}`}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
