// ─── Passe IA UNIQUE (Haiku) — extraction fiche produit depuis photo+légende ──
// Une seule requête par produit soumis (pas de boucle). Modèle économique Haiku.
// Sortie forcée via tool-use (structurée + robuste). Taxonomie en cache (prompt
// caching) car stable d'un appel à l'autre.

import Anthropic from '@anthropic-ai/sdk'
import { CATEGORY_TAXONOMY } from '@/lib/taxonomy'
import { aiExtractionRawSchema, buildCleanExtraction, type CleanExtraction } from './schema'

const MODEL = 'claude-haiku-4-5'

function renderTaxonomy(): string {
  return Object.entries(CATEGORY_TAXONOMY)
    .map(([cat, subs]) => `- ${cat} : ${(subs as readonly string[]).join(', ')}`)
    .join('\n')
}

// Stable → mis en cache. (Construit une fois au chargement du module.)
const SYSTEM_INSTRUCTIONS = `Tu es un assistant d'extraction de fiches produit pour une marketplace B2B marocaine.
On te donne UNE photo de produit et une légende courte écrite par un fournisseur (français, arabe ou darija).
Extrait une fiche produit structurée en appelant l'outil "record_product".

Règles STRICTES :
- "category" DOIT être l'une des catégories listées ci-dessous, copiée à l'identique. Si incertain → "Autres".
- "subcategory" DOIT appartenir à la catégorie choisie, copiée à l'identique. Si incertain → "".
- "price" : prix de gros TEL QU'ÉCRIT par le fournisseur (nombre seul, sans devise ni conversion) s'il figure, sinon null.
  Le fournisseur saisit dans SA devise locale — ne convertis rien, ne suppose aucune devise. Ne JAMAIS inventer ni estimer un prix.
- "product_name" : nom court et clair (max ~80 caractères), sans marque contrefaite.
- "description" : 1 à 2 phrases neutres décrivant le produit.
- "stock_quantity" : quantité en stock (entier ≥ 0) UNIQUEMENT si elle figure dans la légende, sinon null.
  Exemples : « stock 50 », « 50 en stock », darija « كاين 50 فالستوك », arabe « مخزون 50 » → 50. Ne JAMAIS inventer.
- "lead_time_days" : délai de livraison EN JOURS (entier ≥ 0) UNIQUEMENT s'il figure, sinon null.
  Convertis en jours : « délai 20j » / « livraison 20 jours » / arabe « مدة 20 يوم » → 20 ; « 2 semaines » → 14 ; « 1 mois » → 30. Ne JAMAIS inventer.
- "unit" : UNITÉ DE VENTE = l'unité dans laquelle le prix est exprimé, devinée d'après la légende.
  Valeurs autorisées (copie EXACTE) : "metre", "kg", "gramme", "litre", "ml", "paquet", "carton", "piece".
  Exemples : « 40 dh le mètre » / « le metro » / arabe « متر » → "metre" ; « 12 dh le kg » / « le kilo » / « كيلو » → "kg" ;
  « 12 dh le gramme » / « le g » / arabe « غرام » → "gramme" ; « 80 dh le litre » / « le L » / arabe « لتر » → "litre" ;
  « 150 dh les 100 ml » / « le millilitre » / arabe « مل » → "ml" ;
  « 8 dh le carton » / « la caisse » / « كرطونة » → "carton" ; « le paquet » / « le sac » / « كيس » → "paquet".
  Si l'unité n'est PAS explicite dans la légende → "piece" (défaut). Ne JAMAIS deviner au-delà de ce qui est écrit.
- "pack_size" + "pack_unit" : CONDITIONNEMENT si la légende le précise (« carton de 50 boîtes », « sac de 25 kg », « كرطونة فيها 50 علبة »).
  pack_size = nombre d'unités dans le conditionnement (entier, ex. 50) ; pack_unit = nom de cette unité (ex. "boîte", "kg", "علبة").
  Si AUCUN conditionnement n'est mentionné → pack_size = null ET pack_unit = null. Ne JAMAIS inventer.

Catégories et sous-catégories autorisées :
${renderTaxonomy()}`

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

  const captionText = input.caption?.trim()
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: 'text', text: SYSTEM_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
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
  return buildCleanExtraction(validated)
}
