import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repository } from '@/features/storage'
import { DEFAULT_WORK_SETTINGS, type WorkSettings } from './work-settings-schema'

export const workSettingsKeys = { all: ['work-settings'] as const }

export function useWorkSettingsQuery() {
  return useQuery({
    queryKey: workSettingsKeys.all,
    queryFn: repository.getWorkSettings,
  })
}

/** Persisted general settings; falls back to the defaults while loading. */
export function useWorkSettings(): WorkSettings {
  const { data } = useWorkSettingsQuery()
  return data ?? DEFAULT_WORK_SETTINGS
}

export function useUpdateWorkSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: WorkSettings) => repository.updateWorkSettings(settings),
    onSuccess: (settings) => {
      queryClient.setQueryData(workSettingsKeys.all, settings)
    },
  })
}
