import { LegalDocumentView } from '@/features/legal/legal-document-view'
import { termsOfService } from '@/features/legal/legal-documents'

export function TermsPage() {
  return <LegalDocumentView document={termsOfService} />
}
