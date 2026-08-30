/** Offers generated export data as a file download in the current window. */
export function downloadFile(name: string, data: string | Uint8Array, mimeType: string): void {
  const blob = new Blob([data as BlobPart], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
