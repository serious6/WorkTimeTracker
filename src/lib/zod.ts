import { z, ZodError } from 'zod'

// The webview runs under `script-src 'self'` (`src-tauri/tauri.conf.json`), so it allows no `eval`.
// Zod compiles an object schema with `new Function` where it can, and already the probe for that
// capability is reported as a policy violation, even though Zod catches the error. Selecting the
// interpreted path here — before the first schema is constructed — keeps the console clean.
z.config({ jitless: true })

export { z, ZodError }
