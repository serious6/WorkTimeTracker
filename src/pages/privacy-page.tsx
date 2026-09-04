import { LegalDocumentView } from '@/features/legal/legal-document-view'
import { privacyPolicy } from '@/features/legal/legal-documents'

export function PrivacyPage() {
  return <LegalDocumentView document={privacyPolicy} />
}
