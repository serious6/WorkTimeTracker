import type { PropsWithChildren } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: PropsWithChildren<{
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}>) {
  return (
    <Dialog description={description} onClose={onClose} open={open} title={title}>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
        <Button
          onClick={() => {
            onConfirm()
            onClose()
          }}
          variant="destructive"
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
