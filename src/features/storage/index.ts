import { isTauri } from '@tauri-apps/api/core'
import { createLocalRepository } from './local-repository'
import type { Repository } from './repository'
import { tauriRepository } from './tauri-repository'

let injected: Repository | null = null
let resolved: Repository | null = null

/**
 * Resolves the repository on first use instead of at module load, so tests can
 * replace it and a production desktop build never constructs the browser
 * fallback (`createLocalRepository` refuses to run outside development).
 */
export function getRepository(): Repository {
  if (injected) return injected
  resolved ??= isTauri() ? tauriRepository : createLocalRepository()
  return resolved
}

/** Replaces the repository for a test; `null` restores the resolved default. */
export function setRepository(repository: Repository | null): void {
  injected = repository
  if (!repository) resolved = null
}

export type { Repository } from './repository'
