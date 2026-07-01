// ─── Passe IA UNIQUE (Haiku) — extraction fiche produit depuis photo+légende ──
// Une seule requête par produit soumis (pas de boucle). Modèle économique Haiku.
// Sortie forcée via tool-use (structurée + robuste). La taxonomie autorisée est
// lue DEPUIS LA BASE au runtime (sous-lot 2, cache + fallback fail-closed) et
// injectée dans le prompt (toujours mis en cache Anthropic car stable).

import Anthropic from '@anthropic-ai/sdk'
import { getCategoryContext } from '@/lib/categories'
import { aiExtractionRawSchema, buildCleanExtraction, type CleanExtraction } from './schema'

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
    Ex. « 50=18, 100=16 » / « à partir de 50 : 18 » / « 50 pièces 18 dh » / arabe « 50 قطعة ب 18 » → paliers {50,18} et {100,16}.
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
  Valeurs autorisées (copie EXACTE) : "metre", "kg", "gramme", "litre", "ml", "paquet", "carton", "piece".
  Exemples : « 40 dh le mètre » / « le metro » / arabe « متر » → "metre" ; « 12 dh le kg » / « le kilo » / « كيلو » → "kg" ;
  « 12 dh le gramme » / « le g » / arabe « غرام » → "gramme" ; « 80 dh le litre » / « le L » / arabe « لتر » → "litre" ;
  « 150 dh les 100 ml » / « le millilitre » / arabe « مل » → "ml" ;
  « 8 dh le carton » / « la caisse » / « كرطونة » → "carton" ; « le paquet » / « كيس » → "paquet".
  IMPORTANT — quand le prix porte sur un CONTENANT (sac, carton, paquet, lot…), l'unité de vente est CE CONTENANT, pas son contenu.
  Ex : « 90 dh le sac de 10 kg » → unit="paquet" (on vend LE SAC à 90 dh ; "sac" → "paquet" car non listé), surtout PAS "kg".
  « 280 dh le carton de 50 boîtes » → unit="carton" (on vend LE CARTON), pas "boîte".
  Si l'unité n'est PAS explicite dans la légende → "piece" (défaut). Ne JAMAIS deviner au-delà de ce qui est écrit.
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
          'Unité de vente : "metre", "kg", "gramme", "litre", "ml", "paquet", "carton" si explicite dans la légende, sinon "piece" (défaut).',
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
