// Charge .env.local dans process.env sans dépendance externe (dotenv absent).
// No-op si le fichier n'existe pas — les rôles sans identifiants seront alors « skip ».
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let loaded = false

export function loadEnvLocal() {
  if (loaded) return
  loaded = true
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    // retire les guillemets entourants éventuels
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}
