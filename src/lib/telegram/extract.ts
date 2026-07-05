// ─── Passe IA UNIQUE (Haiku) — extraction fiche produit depuis photo+légende ──
// Une seule requête par produit soumis (pas de boucle). Modèle économique Haiku.
// Sortie forcée via tool-use (structurée + robuste). La taxonomie autorisée est
// lue DEPUIS LA BASE au runtime (sous-lot 2, cache + fallback fail-closed) et
// injectée dans le prompt (toujours mis en cache Anthropic car stable).

import Anthropic from '@anthropic-ai/sdk'
import { getCategoryContext } from '@/lib/categories'
import {
  aiExtractionRawSchema,
  buildCleanExtraction,
  sanitizeExtractedPrice,
  sanitizeMoqTiers,
  type CleanExtraction,
  type SanitizedMoqTier,
} from './schema'

const MODEL = 'claude-haiku-4-5'

// Le bloc taxonomie est désormais lu DEPUIS LA BASE au runtime (sous-lot 2), avec
// fallback fail-closed sur taxonomy.ts. Le prompt est construit par appel ; il reste
// stable d'un appel à l'autre (DB stable) → prompt caching Anthropic toujours actif.
function buildSystemInstructions(taxonomyBlock: string): string {
  return `Tu es un assistant d'extraction de fiches produit pour une marketplace B2B marocaine.
On te donne UNE photo de produit et une légende courte écrite par un fournisseur (français, arabe ou darija).
Extrait une fiche produit structurée en appelant l'outil "record_product".

Règles STRICTES :
- "category" DOIT être l'une des catégories listées ci-dessous, copiée à l'identique. Si incertain → "Autres".
- "subcategory" DOIT appartenir à la catégorie choisie, copiée à l'identique. Si incertain → "".
- "price" : prix de gros TEL QU'ÉCRIT par le fournisseur (nombre seul, sans devise ni conversion) s'il figure, sinon null.
  Le fournisseur saisit dans SA devise locale — ne convertis rien, ne suppose aucune devise. Ne JAMAIS inventer ni estimer un prix.
- "moq_tiers" : PALIERS DE GROS DÉGRESSIFS = liste de couples { min_quantity, unit_price } quand le fournisseur donne des prix qui BAISSENT selon la quantité commandée.
  RÈGLE DE DÉSAMBIGUÏSATION (cruciale — ne pas confondre palier, stock, prix de base) :
  • Une quantité ASSOCIÉE À UN PRIX = un palier → { min_quantity: la quantité, unit_price: le prix à cette quantité }.
    Ex. « 50=18, 100=16 » / « à partir de 50 : 18 » / « 50 pièces 18 dh » / « 30 pièces à 120 dh l'unité, 200 pièces à 110 dh l'unité » / arabe « 50 قطعة ب 18 » / « 30 قطعة بسعر 120 درهم للوحدة » / darija « 30 حبة بـ 120 درهم للحبة » → capture CHAQUE couple quantité→prix par unité (ex. {50,18}, {100,16}, {30,120}, {200,110}).
  • Une quantité SEULE, SANS prix = du STOCK (→ "stock_quantity"), JAMAIS un palier ni un minimum.
    Ex. « quantité 500 » / « 500 disponibles » / darija/arabe « الكمية 500 » / « كمية 500 » → stock_quantity=500 ; moq_tiers ne le contient PAS.
  • Un prix SEUL sans quantité rattachée = le "price" de base, PAS un palier.
  • Le MINIMUM de commande = la plus petite quantité qui a un prix (= le 1er palier). Ne l'invente pas ; s'il n'y a aucun couple quantité→prix, laisse moq_tiers=[].
  • Sois TOLÉRANT : capture TOUS les couples quantité→prix, même formulés librement. NE JUGE PAS la cohérence (ordre, décroissance, doublons) — un autre système validera. Ne convertis aucune devise. Aucun palier → [].
- "product_name" : nom court et clair (max ~80 caractères), sans marque contrefaite.
- "description" : 1 à 2 phrases neutres décrivant le produit.
- "stock_quantity" : quantité en stock (entier ≥ 0) UNIQUEMENT si elle figure dans la légende, sinon null.
  Exemples : « stock 50 », « 50 en stock », darija « كاين 50 فالستوك », arabe « مخزون 50 » → 50. Ne JAMAIS inventer.
- "lead_time_days" : délai de livraison EN JOURS (entier ≥ 0) UNIQUEMENT s'il figure, sinon null.
  Convertis en jours : « délai 20j » / « livraison 20 jours » / arabe « مدة 20 يوم » → 20 ; « 2 semaines » → 14 ; « 1 mois » → 30. Ne JAMAIS inventer.
- "unit" : UNITÉ DE VENTE = COMMENT le produit est vendu / facturé À L'UNITÉ (l'unité dans laquelle le prix est exprimé).
  TEXTE LIBRE — écris l'unité TELLE QUELLE, un seul mot au singulier, minuscules, dans la langue du fournisseur : le fournisseur peut vendre en "gramme", "kg", "litre", "ml", "mètre", "paquet", "carton", "pièce", MAIS AUSSI en n'importe quelle unité ("botte", "sachet", "rouleau", "bouquet", "plaque"…). N'IMPOSE PAS une liste figée : si l'unité écrite n'est pas courante, RECOPIE-LA telle quelle.
  Exemples : « 40 dh le mètre » / « le metro » / arabe « متر » → "mètre" ; « 12 dh le kg » / « le kilo » → "kg" ; « 12 dh le gramme » / arabe « غرام » → "gramme" ; « 80 dh le litre » → "litre" ; « 150 dh les 100 ml » → "ml" ; « 5 dh la botte » → "botte" ; « 8 dh le sachet » → "sachet".
  IMPORTANT — quand le prix porte sur un CONTENANT (sac, carton, paquet, lot…), l'unité de vente est CE CONTENANT, pas son contenu.
  Ex : « 90 dh le sac de 10 kg » → unit="sac" (on vend LE SAC à 90 dh), surtout PAS "kg".
  « 280 dh le carton de 50 boîtes » → unit="carton" (on vend LE CARTON), pas "boîte".
  Si l'unité n'est PAS explicite dans la légende → "pièce" (défaut). Ne JAMAIS inventer une unité au-delà de ce qui est écrit.
  Un mot d'unité GÉNÉRIQUE (« l'unité », « la pièce », « à l'unité », « /u ») = "pièce" — NE le remplace PAS par le nom du produit (« œufs à l'unité » → unit="pièce", surtout PAS "œuf"). En revanche, si le fournisseur ÉCRIT explicitement une unité propre (« l'œuf », « la botte », « le bouquet »), recopie-la telle quelle.
- "pack_size" + "pack_unit" : CONDITIONNEMENT = un emballage qui GROUPE plusieurs sous-unités D'UNE NATURE DIFFÉRENTE de l'unité de vente.
  RÈGLE CONTENANT/CONTENU (anti-inversion) : pack_unit = ce qu'il y a À L'INTÉRIEUR (le CONTENU) ; pack_size = COMBIEN il y en a. Le CONTENANT est déjà l'unité de vente (unit), on ne le répète PAS dans pack_unit.
    ✅ « carton de 50 boîtes » → unit="carton", pack_size=50, pack_unit="boîte" (le carton CONTIENT 50 boîtes).
    ✅ « sac de 10 kg » → unit="paquet", pack_size=10, pack_unit="kg" (le sac CONTIENT 10 kg).
    ❌ INTERDIT (inversé) « sac de 10 kg » → unit="kg", pack_unit="sac" : le sac est le CONTENANT (= unit), kg le contenu.
  RÈGLE ANTI-REDONDANCE : si le conditionnement aurait la MÊME unité que l'unité de vente → laisse pack_size ET pack_unit = null (ne crée pas de conditionnement).
    ✅ « huile 100 ml » / « les 100 ml » → unit="ml", pack_size=null, pack_unit=null (JAMAIS « ml de 100 ml »).
    ✅ « tissu au mètre, rouleau de 100 m » → unit="metre", pack_size=null, pack_unit=null (vendu AU MÈTRE ; JAMAIS « mètre de 100 mètres » ; le « rouleau » peut être ignoré).
    ❌ INTERDIT (redondant) « tissu au mètre, rouleau de 100 m » → unit="metre", pack_size=100, pack_unit="mètre".
  Si AUCUN conditionnement de nature différente n'est mentionné → pack_size = null ET pack_unit = null. Ne JAMAIS inventer.
- "suggested_category" : NOUVELLE catégorie proposée, UNIQUEMENT si AUCUNE catégorie de la liste ci-dessous ne convient vraiment au produit.
  Dans ce cas : mets "category"="Autres" ET propose dans "suggested_category" un nom de catégorie COURT, générique et réutilisable (1 à 3 mots, ex. "Électroménager", "Quincaillerie", "Animalerie"), pas un nom de produit.
  Si une catégorie de la liste convient → "suggested_category"=null (NE propose RIEN). Ne propose jamais un nom déjà présent dans la liste. En cas de doute → null.

Catégories et sous-catégories autorisées :
${taxonomyBlock}`
}

const RECORD_PRODUCT_TOOL: Anthropic.Tool = {
  name: 'record_product',
  description: 'Enregistre la fiche produit extraite de la photo et de la légende.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      product_name: { type: 'string', description: 'Nom court et clair du produit.' },
      category: { type: 'string', description: 'Catégorie parente (valeur exacte de la taxonomie).' },
      subcategory: { type: 'string', description: 'Sous-catégorie (valeur exacte) ou chaîne vide.' },
      description: { type: 'string', description: '1 à 2 phrases descriptives neutres.' },
      price: {
        type: ['number', 'null'],
        description: "Prix de gros TEL QU'ÉCRIT (nombre seul, sans devise ni conversion) si présent, sinon null.",
      },
      stock_quantity: {
        type: ['integer', 'null'],
        description: 'Quantité en stock (entier ≥ 0) si indiquée dans la légende, sinon null.',
      },
      lead_time_days: {
        type: ['integer', 'null'],
        description: 'Délai de livraison EN JOURS (entier ≥ 0) si indiqué, sinon null.',
      },
      unit: {
        type: ['string', 'null'],
        description:
          'Unité de vente en TEXTE LIBRE, un seul mot au singulier dans la langue du fournisseur (ex. "gramme", "kg", "litre", "mètre", "paquet", "carton", "botte", "sachet", "rouleau"…). Recopie l\'unité écrite telle quelle. Non explicite → "pièce" (défaut).',
      },
      pack_size: {
        type: ['integer', 'null'],
        description: 'Conditionnement : nb d\'unités dans le lot (ex. 50) si mentionné, sinon null.',
      },
      pack_unit: {
        type: ['string', 'null'],
        description: 'Conditionnement : nom de l\'unité du lot (ex. "boîte") si mentionné, sinon null.',
      },
      suggested_category: {
        type: ['string', 'null'],
        description:
          'NOUVELLE catégorie proposée (1-3 mots, générique) UNIQUEMENT si aucune catégorie de la liste ne convient (alors category="Autres"). Sinon null.',
      },
      moq_tiers: {
        type: 'array',
        description:
          'Paliers de gros dégressifs : liste de { min_quantity, unit_price } quand le fournisseur donne des prix qui BAISSENT selon la quantité. [] si aucun palier.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            min_quantity: {
              type: ['integer', 'null'],
              description: 'Quantité seuil du palier (entier > 0).',
            },
            unit_price: {
              type: ['number', 'null'],
              description: "Prix unitaire À CE PALIER, tel qu'écrit (sans devise ni conversion).",
            },
          },
          required: ['min_quantity', 'unit_price'],
        },
      },
    },
    required: [
      'product_name',
      'category',
      'subcategory',
      'description',
      'price',
      'stock_quantity',
      'lead_time_days',
      'unit',
      'pack_size',
      'pack_unit',
      'suggested_category',
      'moq_tiers',
    ],
  } as Anthropic.Tool['input_schema'],
}

export type ExtractInput = {
  caption: string | null
  imageBase64: string
  imageMediaType: 'image/jpeg' | 'image/png' | 'image/webp'
}

/**
 * Une seule passe Haiku. Renvoie une fiche déjà nettoyée/validée (catégorie dans
 * la taxonomie, prix sain ou null). Lève si la clé API manque ou si la réponse
 * n'est pas exploitable — l'appelant journalise l'échec en staging.
 */
export async function extractProductFromTelegram(input: ExtractInput): Promise<CleanExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant')

  const client = new Anthropic({ apiKey })

  // Taxonomie lue depuis la base (fail-closed → taxonomy.ts si DB injoignable/vide).
  const { source: taxonomySource, promptBlock } = await getCategoryContext()
  const systemInstructions = buildSystemInstructions(promptBlock)

  const captionText = input.caption?.trim()
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: 'text', text: systemInstructions, cache_control: { type: 'ephemeral' } },
    ],
    tools: [RECORD_PRODUCT_TOOL],
    tool_choice: { type: 'tool', name: 'record_product' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: input.imageMediaType, data: input.imageBase64 },
          },
          {
            type: 'text',
            text: captionText
              ? `Légende du fournisseur : « ${captionText} »`
              : "Aucune légende fournie. Décris la fiche d'après la photo, price = null.",
          },
        ],
      },
    ],
  })

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  )
  if (!toolUse) throw new Error('Réponse IA sans tool_use')

  const validated = aiExtractionRawSchema.parse(toolUse.input)
  return buildCleanExtraction(validated, taxonomySource)
}

// ─── BRIQUE 3 — Extraction d'une RÉPONSE TEXTE (prix / paliers) ───────────────
// Passe IA text-only (pas d'image) : le fournisseur répond à une question du bot
// (« 250 dh », « 50=220, 100=200 », « non »…). On ne veut QUE le prix + les
// paliers ; les sanitizers existants (mêmes règles que la photo) valident.

const RECORD_REPLY_TOOL: Anthropic.Tool = {
  name: 'record_reply',
  description: "Enregistre le prix et/ou les paliers de gros lus dans la réponse du fournisseur.",
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      price: {
        type: ['number', 'null'],
        description: "Prix unitaire TEL QU'ÉCRIT (nombre seul, sans devise ni conversion) si présent, sinon null.",
      },
      moq_tiers: {
        type: 'array',
        description:
          'Paliers de gros dégressifs { min_quantity, unit_price } si le fournisseur en donne (prix qui BAISSE quand la quantité monte). [] sinon.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            min_quantity: { type: ['integer', 'null'], description: 'Quantité seuil (entier > 0).' },
            unit_price: { type: ['number', 'null'], description: "Prix à ce palier, tel qu'écrit." },
          },
          required: ['min_quantity', 'unit_price'],
        },
      },
    },
    required: ['price', 'moq_tiers'],
  } as Anthropic.Tool['input_schema'],
}

const REPLY_SYSTEM = `Tu extrais UNIQUEMENT un prix et/ou des paliers de gros depuis une courte réponse de fournisseur, en FRANÇAIS, ANGLAIS, ARABE ou DARIJA (arabe marocain). Appelle l'outil "record_reply".

Règles STRICTES :
- "price" : le prix unitaire TEL QU'ÉCRIT (nombre seul, sans devise ni conversion) s'il figure, sinon null. Ne JAMAIS inventer ni estimer.
  Exemples prix : « 150 dh » / « الثمن 150 » / « 150 درهم » / « ب 150 » → price = 150. Un simple nombre « 140 » → price = 140.
- "moq_tiers" : couples { min_quantity, unit_price } quand des prix BAISSENT selon la quantité. [] si aucun.
  ACCEPTE TOUS LES FORMATS, y compris libres : « 50=140 », « 50 140 », « 50 pièces 140 », « 50pcs=140dh », plusieurs d'un coup « 50=140, 200=120, 500=100 », arabe « 50 = 140 درهم » / « من 50 : 140 » / « 50 قطعة 140 ».
  Le fournisseur peut donner 0, 1, 2 ou 3 paliers — capture-les TOUS.
- CHIFFRES ARABES : convertis toujours ٠١٢٣٤٥٦٧٨٩ (et ۰۱۲۳۴۵۶۷۸۹) en chiffres latins (ex. « ٥٠ = ١٤٠ » → { min_quantity: 50, unit_price: 140 }).
- Une quantité SEULE sans prix n'est PAS un palier. Un prix SEUL sans quantité (« 140 ») → price = 140, moq_tiers = [] (un autre système demandera la quantité).
- « non / no / لا / والو / makayn / ماكاين » = aucun prix, aucun palier (price = null, moq_tiers = []).
- Ne convertis aucune devise. Ne juge pas la cohérence (ordre, décroissance) — un autre système validera.`

// Chiffres arabes (Arabic-Indic ٠-٩ U+0660–0669 et Perso/Eastern ۰-۹ U+06F0–06F9)
// → chiffres latins. Ceinture+bretelles : Haiku les gère déjà (tool = number), mais
// on normalise en amont pour robustesse + cohérence de tout parsing déterministe.
export function normalizeArabicDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

export type ReplyExtraction = { price_source: number | null; moq_tiers: SanitizedMoqTier[] }

/**
 * Lit une réponse texte du fournisseur → { price_source, moq_tiers } déjà nettoyés
 * par les MÊMES sanitizers que la photo. Lève si la clé API manque ou si la réponse
 * IA est inexploitable (l'appelant journalise / redemande).
 */
export async function extractProductReply(text: string): Promise<ReplyExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant')

  const client = new Anthropic({ apiKey })
  // Normalise les chiffres arabes en amont (robustesse ; Haiku les gère aussi).
  const norm = normalizeArabicDigits(text.trim())
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: [{ type: 'text', text: REPLY_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [RECORD_REPLY_TOOL],
    tool_choice: { type: 'tool', name: 'record_reply' },
    messages: [
      { role: 'user', content: [{ type: 'text', text: `Réponse du fournisseur : « ${norm} »` }] },
    ],
  })

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  )
  if (!toolUse) throw new Error('Réponse IA sans tool_use')

  const input = toolUse.input as { price: unknown; moq_tiers: unknown }
  const price_source = sanitizeExtractedPrice(input.price)
  // basePrice = prix unitaire → garantit que le 1er palier == prix de base (règle
  // sanitizeMoqTiers), cohérent avec le flux photo.
  const moq_tiers = sanitizeMoqTiers(input.moq_tiers, price_source)
  return { price_source, moq_tiers }
}
