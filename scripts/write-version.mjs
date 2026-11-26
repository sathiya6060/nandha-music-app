// Writes a fresh build id on EVERY build so the running app can tell
// whether the live site has a newer deployment (see src/App.jsx version
// check). Runs as the `prebuild` script before `vite build`.
// Output: src/version.json (bundled into the app) + public/version.json
// (served live, fetched with cache: 'no-store').
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const buildId = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
const payload = { buildId, builtAt: new Date().toISOString() }
const body = `${JSON.stringify(payload, null, 2)}\n`

writeFileSync(new URL('../src/version.json', import.meta.url), body)
writeFileSync(new URL('../public/version.json', import.meta.url), body)

// eslint-disable-next-line no-console
console.log(`[version] buildId=${buildId}`)
