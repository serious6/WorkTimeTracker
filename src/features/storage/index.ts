import { isTauri } from '@tauri-apps/api/core'
import { localRepository } from './local-repository'
import type { Repository } from './repository'
import { tauriRepository } from './tauri-repository'

export const repository: Repository = isTauri() ? tauriRepository : localRepository
export type { Repository } from './repository'
