import { create } from 'zustand'

export type Toast = {
  id: number
  title: string
  description?: string
  variant: 'default' | 'destructive'
}

type ToastState = {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id' | 'variant'> & { variant?: Toast['variant'] }) => void
  dismiss: (id: number) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: ({ title, description, variant = 'default' }) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id: Date.now() + state.toasts.length, title, description, variant },
      ],
    })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

export function toast(title: string, description?: string) {
  useToastStore.getState().push({ title, description })
}

export function errorToast(title: string, description?: string) {
  useToastStore.getState().push({ title, description, variant: 'destructive' })
}
