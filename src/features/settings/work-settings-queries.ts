import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { errorToast } from '@/components/ui/toast-store'
import { securityAuditKeys } from '@/features/audit/audit-queries'
import { getRepository } from '@/features/storage'
import { errorMessage } from '@/lib/errors'
import { DEFAULT_WORK_SETTINGS, type SaveWorkSettings, type WorkSettings } from './work-settings-schema'

export const workSettingsKeys = { all: ['work-settings'] as const }

export const WORK_SETTINGS_ERROR_TITLE = 'Settings not loaded'
export const WORK_SETTINGS_ERROR_MESSAGE =
  'The settings could not be loaded. The defaults are used until the database is available.'

export function useWorkSettingsQuery() {
  return useQuery({
    queryKey: workSettingsKeys.all,
    queryFn: () => getRepository().getWorkSettings(),
  })
}

/**
 * Persisted general settings; falls back to the defaults while loading. A failed
 * read is reported centrally, so consumers never present defaults as if they
 * were the saved values.
 */
export function useWorkSettings(): WorkSettings {
  const { data, error } = useWorkSettingsQuery()

  useEffect(() => {
    if (error) errorToast(WORK_SETTINGS_ERROR_TITLE, errorMessage(error, WORK_SETTINGS_ERROR_MESSAGE))
  }, [error])

  return data ?? DEFAULT_WORK_SETTINGS
}

export function useUpdateWorkSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: SaveWorkSettings) => getRepository().updateWorkSettings(settings),
    onSuccess: (settings) => {
      queryClient.setQueryData(workSettingsKeys.all, settings)
      // A changed setting appends to the audit trail, an unchanged save does not.
      void queryClient.invalidateQueries({ queryKey: securityAuditKeys.all })
    },
  })
}
