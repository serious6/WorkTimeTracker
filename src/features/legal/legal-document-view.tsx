import type { LegalDocument } from './legal-documents'

/**
 * Renders a legal document. The date is shown as the plain ISO day of the
 * document, not a localised timestamp: it identifies a revision, not a moment
 * in the timezone of the reader.
 */
export function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{document.title}</h1>
        <p className="text-sm text-muted-foreground">
          Version {document.version}, last updated {document.updatedAt}.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{document.summary}</p>
      </header>
      {document.sections.map((section) => (
        <section aria-labelledby={`${section.heading}-heading`} className="space-y-2" key={section.heading}>
          <h2 className="text-lg font-semibold" id={`${section.heading}-heading`}>
            {section.heading}
          </h2>
          {section.paragraphs.map((paragraph) => (
            <p className="max-w-3xl text-sm text-muted-foreground" key={paragraph}>
              {paragraph}
            </p>
          ))}
          {section.items ? (
            <ul className="ml-5 max-w-3xl list-disc space-y-1 text-sm text-muted-foreground">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  )
}
