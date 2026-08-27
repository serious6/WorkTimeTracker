import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repository } from '@/features/storage'
import { DEFAULT_WORK_SETTINGS, type WorkSettings } from './work-settings-schema'

export const workSettingsKeys = { all: ['work-settings'] as const }

export function useWorkSettings(): WorkSettings {
  const { data } = useQuery({
    queryKey: workSettingsKeys.all,
    queryFn: repository.getWorkSettings,
  })
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
