# CLAUDE.md — SaaS Affiliation

> Lu automatiquement par Claude Code à chaque session.
> Définit le contexte, les règles et les rôles.
> La stack exacte et le schéma DB seront complétés par l'audit de la PHASE 0.

## 🛑 RÈGLES ABSOLUES — JAMAIS D'EXCEPTION
> En tête volontairement. Ces règles priment sur tout le reste. Issues d'une régression réelle :
> le chantier design a passé une **fonction** à un Client Component (`stockAvailable`), cassant
> `/wholesale/marketplace/[id]` — invisible pour `tsc`, le build ET les 115 tests.

1. **DESIGN = COULEURS / TEXTES / STYLES UNIQUEMENT.** Lors d'un changement visuel, il est
   **INTERDIT** de toucher à la logique : data récupérée, props transmises, callbacks, calculs,
   conditions, types. Si une retouche visuelle « oblige » à changer la logique → **STOP**, c'est
   que ce n'est plus du design. On ne reformate pas le passage des données pour faire joli.
2. **JAMAIS de fonction ni d'objet-callback passé à un Client Component.** Résoudre les strings
   **côté serveur** (les arguments sont connus au rendu) et ne transmettre que des **strings/données
   sérialisables**. C'est la cause exacte de la régression `stockAvailable`. Pattern correct :
   `stockAvailable: count != null ? t('key', { count, unit }) : ''` — pas `(c, u) => t(...)`.
3. **INTERDIT DE COMMIT** sans, dans l'ordre, **TOUT vert** :
   - `npx tsc --noEmit` → **0 erreur** ;
   - `npx next build` → **OK** ;
   - `npx vitest run` → **tests verts** ;
   - `pnpm smoke` → **rendu des routes principales sans erreur** (le filet qui a manqué).
   Le hook **pre-commit** (husky) bloque physiquement sur typecheck + tests. Le **pre-push** ajoute
   build + smoke. Ne **jamais** contourner avec `--no-verify`.
4. **LOTS PETITS** : **max 3-4 pages par lot** → vérifier (les 4 checks) → commit → lot suivant.
   Pas de gros lot fourre-tout : c'est ce qui a noyé la régression.
5. **CHANGEMENTS FINANCIERS** (ledger, commissions, devises, livraison, COD) : circuit complet
   **`@finance` + `@security-reviewer` + validation Abdou** AVANT commit. Inchangé, rappelé ici.

## 🧭 AUTONOMIE DE DÉCISION
> But : avancer sans interruptions inutiles. Abdou n'est sollicité que sur ce qui compte vraiment.

1. **Décide seul** toute décision technique qui ne touche **NI l'argent, NI la sécurité, NI une
   suppression de données, NI un push/merge** : prends l'option **recommandée par `@architect`**,
   note la décision + sa justification **en une ligne dans `FEUILLE_DE_ROUTE.md`**, et continue
   **sans demander**.
2. **N'interromps Abdou QUE pour** : changements **financiers** (circuit `@finance` complet),
   **failles de sécurité**, **suppressions de données**, **push/merge**, ou un **vrai blocage**
   sans option raisonnable.
3. **Fin de chantier** : **un seul rapport** avec — ce qui est fait, les **décisions prises seul**,
   et **LA prochaine action** s'il y en a une.

## Contexte projet
SaaS d'affiliation **Mozouna Group** avec gestion de commissions et flux financiers importants.
Développé sous Claude Code. **~80 % déjà construit et FONCTIONNEL** : on ne reconstruit pas, on finit.

**Périmètre métier :**
- Affiliation **COD (Cash On Delivery) Maroc** + **B2B gros** + **sourcing international**.
- **Multi-pays / multi-devises**, devise pivot = **MAD** (dirham marocain).

## Stack (à confirmer/compléter par l'audit Phase 0)
- Frontend : React — cible Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Backend / DB : Supabase (Postgres, Auth, RLS, Edge Functions)
- Versioning : GitHub (MCP connecté)

## RÈGLES D'OR — non négociables
1. NE JAMAIS réécrire un module qui fonctionne déjà sans validation explicite d'Abdou.
2. NE JAMAIS travailler sur `main`. Une branche par feature. Commit checkpoint avant toute tâche lourde.
3. Plan AVANT édition. Toute feature non triviale : proposer le plan, attendre validation.
4. ARGENT = `numeric` Postgres ou entiers (centimes). JAMAIS de float.
5. Toute opération financière : clé d'idempotence + écriture dans une table ledger append-only.
6. RLS activé sur CHAQUE table, deny par défaut. La clé `service_role` ne touche JAMAIS le client.
7. Toute écriture sensible passe par le serveur (server action / Edge Function) avec validation zod.
   Jamais d'écriture directe depuis le navigateur.
8. Une seule chose à la fois. Checkpoint + validation Abdou entre chaque phase.

## MÉTHODE DE TRAVAIL — règles de collaboration (Abdou)
> À relire en début de chaque session. Une reprise dans une nouvelle session ne doit RIEN louper.

- **Ne JAMAIS reconstruire ce qui existe.** Vérifier l'existant AVANT de construire quoi que ce soit.
- **Avancer par petites étapes focalisées**, validées une par une. Pas de gros lots.
- **Tout ce qui touche à l'ARGENT** (ledger, commissions, devises, livraison) : **plan d'abord**, puis **audit `@finance` + `@security-reviewer`**, PUIS commit. Jamais dans la précipitation.
- **Toujours travailler en branches.** Ne **pas pousser ni merger** sans accord explicite d'Abdou.
- **Fin de chaque session** : mettre à jour `FEUILLE_DE_ROUTE.md` + commit.
- **🌍 RÈGLE D'OR — i18n OBLIGATOIRE** : Tout nouveau texte visible par l'utilisateur (composant, page, bouton, message, libellé, réponse de bot) DOIT être créé directement avec ses clés de traduction **FR + AR (فصحى) + EN**, et câblé via `getTranslations`/`useTranslations`. **JAMAIS de texte en dur.** Les chiffres restent en numéraux latins `1234567890`. Le **RTL** doit fonctionner. Un composant livré avec du texte en dur est considéré comme **NON terminé**. Cette règle s'applique à chaque ajout ET à toute modification touchant du texte existant.

### Modèle de commission affilié (référence)
```
commission = prix_vente − coût_usine − marge_plateforme − livraison(ville) − confirmation − emballage
```
- La **livraison est TOUJOURS payée par l'affilié**, **jamais zéro**.
- Le coût de livraison dépend de la **ville** de destination.

## Équipe d'agents (dans .claude/agents/)
- `@architect` (Opus) — planifie et conçoit. Ne code pas. (lecture seule / plan mode)
- `@finance` (Opus) — moteur ledger + commissions + COD. Le cœur argent, le plus critique.
- `@security-reviewer` (Opus, lecture seule) — audite chaque feature avant merge.
- `@backend-db` (Sonnet) — Supabase, SQL, RLS, Edge Functions, API serveur.
- `@frontend` (Sonnet) — React/Next/Tailwind/shadcn. UI uniquement.
- `@tester` (Sonnet) — écrit et lance les tests, vérifie que ça marche vraiment.

## Stratégie modèles & tokens (optimisation)
- **Session principale (chef d'orchestre) : Opus.** C'est le plus gros poste de tokens car son contexte vit longtemps → discipline obligatoire (voir règles ci-dessous).
- **Opus = raisonnement court, isolé, à fort enjeu** : `@architect`, `@finance`, `@security-reviewer`. Ils tournent brièvement dans un contexte isolé et ne renvoient qu'un rapport compact → peu coûteux en cumul, et ils évitent les erreurs chères (argent, failles).
- **Sonnet = exécution lourde** (beaucoup d'I/O fichiers) : `@backend-db`, `@frontend`, `@tester`.

### Règles anti-gaspillage de tokens
- Déléguer toute lecture lourde (gros fichiers, exploration) à un subagent → la session principale reste légère.
- `/compact` entre chaque phase ; repartir d'une session fraîche par grande feature.
- Plan mode avant chaque feature → pas de tokens brûlés dans une mauvaise direction.
- Ne jamais laisser le contexte de la session principale dépasser ~70 %.

## 💸 DISCIPLINE TOKENS — non négociable
1. **`@finance` et `@security-reviewer` UNIQUEMENT pour la logique financière et la sécurité.**
   **Jamais** pour du design, un bug visuel, un correctif CSS/i18n ou une régression de rendu.
   Ce sont des agents Opus chers : les invoquer à tort, c'est brûler des tokens pour rien.
2. **Ne JAMAIS re-explorer du code déjà documenté.** Lire d'abord `FEUILLE_DE_ROUTE.md` et
   `CLAUDE.md` — l'existant, les fichiers critiques, les décisions y sont déjà consignés. On
   n'envoie un agent d'exploration QUE si l'info n'y est pas.
3. **1 chantier = 1 session.** Fin de chantier → mise à jour de `FEUILLE_DE_ROUTE.md` + commit,
   pour un redémarrage propre. On ne traîne pas plusieurs chantiers dans un contexte qui gonfle.
4. **Plan court validé AVANT toute écriture.** Pas de réécriture massive non demandée : on touche
   le minimum nécessaire (cf. RÈGLES ABSOLUES).

## Workflow standard d'une feature
1. `@architect` propose le plan → Abdou valide
2. L'agent spécialiste implémente sur une branche dédiée
3. `@tester` écrit/lance les tests (vert obligatoire)
4. `@security-reviewer` audite (read-only)
5. Abdou valide → merge
