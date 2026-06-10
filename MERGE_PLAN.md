# MERGE_PLAN.md — Plan de merge jalonné vers `main` (Option B)

> ⚠️ **AVERTISSEMENT — NE JAMAIS EXÉCUTER AUTOMATIQUEMENT.**
> Ce document est un **plan**, pas un script à lancer. Chaque commande ci-dessous
> ne doit être exécutée **que sur décision explicite d'Abdou**, étape par étape,
> en vérifiant le résultat entre chaque. Aucun agent ne doit merger ni pousser
> de sa propre initiative. En cas de doute → STOP et demander.

---

## Contexte (au moment de la rédaction)

- **Tout est un stack LINÉAIRE.** `feat/habillage-premium` contient déjà
  l'intégralité du travail ; toutes les autres branches en sont des ancêtres.
- `origin/main` = `6505e97` (28 mai) — très en retard, c'est la base réelle.
- `main` local = `15a671f` (= phase 2) — **jamais poussé**.
- Comme la ligne est linéaire et que `origin/main` est ancêtre de toutes les
  branches : **aucun conflit possible**. Les merges `--no-ff` ne servent qu'à
  créer un **commit de jalon lisible par phase** sur `main`.

**But de l'Option B :** un historique `main` propre, un point de merge par phase,
le tout aboutissant à un `main` identique à `feat/habillage-premium`.

---

## Pré-vol (lecture seule — à faire avant tout)

```bash
cd ~/AI-FACTORY/affiliate-platform
git fetch --all --prune

# Vérifier que rien n'a divergé depuis la rédaction de ce plan :
git rev-parse --short origin/main            # attendu : 6505e97
git rev-parse --short feat/habillage-premium # attendu : 997c9f9 (+ commit de maj de ce plan)
git status -sb                               # working tree doit être propre
git stash list                               # idéalement vide
```

> Si `origin/main` n'est plus `6505e97`, ou si la working tree n'est pas propre,
> **STOP** : ce plan doit être recalculé.

---

## Étape 0 — Aligner `main` local sur `origin/main`

`main` local pointe sur `15a671f` (non poussé). Pour bâtir un historique jalonné
depuis la vraie base distante, on repart de `origin/main`.

```bash
git checkout main
git reset --hard origin/main   # main local → 6505e97
```

> 🔒 **Sécurité** : le `reset --hard` abandonne le `15a671f` local non poussé,
> mais **rien n'est perdu** — `15a671f` reste accessible via la branche
> `fix/phase2-ledger-atomic-payout` (et via `feat/habillage-premium`).
> Vérifier après : `git rev-parse --short main` → `6505e97`.

---

## Étapes de merge jalonnées (`--no-ff`, dans CET ordre)

Exécuter **une étape à la fois**, vérifier `git log --oneline -1` et `git status`
entre chaque. Chaque merge doit être **sans conflit** (sinon STOP).

### 1. PHASE 1 — Sécurité socle (RLS)
```bash
git merge --no-ff fix/phase1-rls-orders-clicks-prices \
  -m "merge: PHASE 1 — RLS socle (F1/F2/F3, écritures via service_role)"
```

### 2. PHASE 2 — Moteur finance (ledger)
```bash
git merge --no-ff fix/phase2-ledger-atomic-payout \
  -m "merge: PHASE 2 — ledger append-only + paiement atomique idempotent"
```

### 3. ÉTAPE 1 — Référentiel pays + devises
```bash
git merge --no-ff feat/etape1-country-currency-reference \
  -m "merge: ÉTAPE 1 — référentiel pays + devises (migration 050)"
```

### 4. ÉTAPE 2 — Multi-devise sur le devis
```bash
git merge --no-ff feat/etape2-quote-multicurrency \
  -m "merge: ÉTAPE 2 — multi-devise circuit devis (migration 051)"
```

### 5. ÉTAPE 3 — Devise dans le ledger
```bash
git merge --no-ff feat/etape3-ledger-currency \
  -m "merge: ÉTAPE 3 — devise dans le ledger (migration 052)"
```

### 6. Design premium + i18n + ÉTAPE #1 commission
```bash
git merge --no-ff feat/habillage-premium \
  -m "merge: design premium + i18n FR/AR/EN + lot multi-devise fournisseur (053→055, Telegram/web/CSV)"
```

> Après l'étape 6, l'arbre de `main` est **identique** à
> `feat/habillage-premium` (`git diff main feat/habillage-premium` → vide).

---

## Vérification finale (avant push)

```bash
git diff --stat main feat/habillage-premium   # doit être VIDE (arbres identiques)
git log --oneline --graph -12                 # doit montrer les 6 commits de jalon
node_modules/.bin/vitest run                   # 115/115 attendu
node_modules/.bin/tsc --noEmit                 # typecheck OK attendu
```

---

## Étape finale — Push de `main`

> ⚠️ Action irréversible côté distant. **Uniquement sur GO explicite d'Abdou.**

```bash
git push origin main
```

> Comme `origin/main` (`6505e97`) est ancêtre du nouveau `main`, ce push est un
> **fast-forward** propre (pas de `--force`).
> Si un `--force` était réclamé par git → **STOP**, quelque chose a divergé.

---

## Action métier liée (rappel, hors git)

Après mise en ligne, dans **Admin → Logistique** : passer
`logistics_settings.default_delivery_fee_mad` de **40 à 35** (le code planche à
35 mais la ligne en base reste à 40 — cf. décision D5, aucune migration).

---

## Nettoyage post-merge — branches devenues supprimables

Une fois `main` à jour et poussé, ces branches sont **entièrement contenues**
dans `main` → supprimables (vérifier d'abord `git branch --merged main`).

```bash
# Branches LOCALES
git branch -d fix/phase1-rls-orders-clicks-prices
git branch -d fix/phase2-ledger-atomic-payout
git branch -d feat/etape1-country-currency-reference
git branch -d feat/etape2-quote-multicurrency
git branch -d feat/etape3-ledger-currency
git branch -d chore/agent-operating-system
git branch -d dev-agents
# feat/habillage-premium : peut être supprimée APRÈS merge, mais c'est la branche
# de travail courante — ne la supprimer qu'une fois sûr (et après PR #1 close).

# Branches DISTANTES (si présentes sur origin)
git push origin --delete chore/agent-operating-system
# (les autres feat/etape*, fix/phase* ne semblent pas poussées — vérifier via
#  `git branch -r` avant toute suppression distante.)
```

> ℹ️ La **PR #1** (`feat/habillage-premium` → `main`) se fermera automatiquement
> comme « merged » une fois `main` poussé avec ce contenu, si la PR vise bien
> cette base. Vérifier son état après le push.

---

*Document de planification — généré en lecture seule. Aucune commande ici n'a été exécutée.*
