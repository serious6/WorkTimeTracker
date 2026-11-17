import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const workflow = readFileSync(new URL('../.github/workflows/publish-licenses.yml', import.meta.url), 'utf8')

test('reads the workflow_run payload from the runner-provided event path', () => {
  expect(workflow).toContain("fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')")
  expect(workflow).not.toContain('github.event_path')
})
