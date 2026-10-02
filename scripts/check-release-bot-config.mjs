import { pathToFileURL } from 'node:url'

export function releaseBotConfigErrors({ clientId, privateKey }) {
  const errors = []
  if (typeof clientId !== 'string' || !clientId.trim()) {
    errors.push('RELEASE_BOT_CLIENT_ID is missing or blank. Set it as a variable in the production environment.')
  }
  if (typeof privateKey !== 'string' || !privateKey.trim()) {
    errors.push('RELEASE_BOT_PRIVATE_KEY is missing or blank. Set it as a secret in the production environment.')
  }
  return errors
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = releaseBotConfigErrors({
    clientId: process.env.RELEASE_BOT_CLIENT_ID,
    privateKey: process.env.RELEASE_BOT_PRIVATE_KEY,
  })
  for (const error of errors) console.error(`::error::${error}`)
  if (errors.length > 0) process.exitCode = 1
}
