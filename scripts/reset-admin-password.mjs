// scripts/reset-admin-password.mjs
// Récupération de compte admin — exécution ponctuelle, hors flux applicatif.
// Secrets chargés par Node via --env-file (jamais en argv, jamais loggés).
// Le nouveau mot de passe est lu sur stdin EN MODE MASQUÉ (pas d'écho, pas d'historique, pas d'argv).
//
// Usage :
//   node --env-file=.env.local scripts/reset-admin-password.mjs
import { createClient } from '@supabase/supabase-js'

const TARGET_EMAIL = 'abdou.bougjdi1@gmail.com'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('❌ Variables manquantes (.env.local non chargé ? utilise --env-file=.env.local)')
  process.exit(1)
}

// --- Lecture masquée du mot de passe sur stdin (aucun écho terminal) ---
// On compare des CODES de touche (charCodeAt) pour éviter tout caractère de contrôle littéral.
function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    if (!stdin.isTTY) {
      reject(
        new Error(
          "stdin n'est pas un terminal interactif — lance la commande directement dans ton terminal (préfixe ! dans Claude Code)."
        )
      )
      return
    }
    process.stdout.write(prompt)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let buf = ''
    stdin.on('data', function onData(ch) {
      const code = ch.charCodeAt(0)
      if (code === 13 || code === 10 || code === 4) {
        // Entrée (CR/LF) ou EOT : fin de saisie
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(buf)
      } else if (code === 3) {
        // Ctrl-C : annulation
        process.stdout.write('\n')
        process.exit(1)
      } else if (code === 127 || code === 8) {
        // Backspace / Delete
        buf = buf.slice(0, -1)
      } else {
        buf += ch
      }
    })
  })
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 1) Résoudre l'email -> user id (pagination de sécurité)
let userId = null
for (let page = 1; page <= 20 && !userId; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
  if (error) {
    console.error('❌ listUsers:', error.message)
    process.exit(1)
  }
  const u = data.users.find((x) => x.email?.toLowerCase() === TARGET_EMAIL.toLowerCase())
  if (u) userId = u.id
  if (data.users.length < 200) break
}
if (!userId) {
  console.error(`❌ Aucun utilisateur pour ${TARGET_EMAIL}`)
  process.exit(1)
}
console.log(`✓ Utilisateur trouvé : ${TARGET_EMAIL} (id ${userId})`)

// 2) Lire le nouveau mot de passe (masqué), double saisie
const pw1 = await readHidden('Nouveau mot de passe : ')
const pw2 = await readHidden('Confirmer            : ')
if (pw1.length < 8) {
  console.error('❌ Minimum 8 caractères')
  process.exit(1)
}
if (pw1 !== pw2) {
  console.error('❌ Les deux saisies diffèrent')
  process.exit(1)
}

// 3) Mise à jour via service_role
const { error } = await admin.auth.admin.updateUserById(userId, { password: pw1 })
if (error) {
  console.error('❌ updateUserById:', error.message)
  process.exit(1)
}
console.log('✅ Mot de passe mis à jour. Le mot de passe n’a jamais été affiché ni loggé.')
process.exit(0)
