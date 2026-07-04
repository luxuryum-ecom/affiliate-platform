// ─── LOT 5 — Message d'accueil fournisseur (bot Telegram) ────────────────────
// PUR & testable. Envoyé sur /start (= premier contact Telegram) et /link sans code.
// But : guider l'envoi d'un produit ET recommander le format des paliers dégressifs,
// pour réduire les extractions IA ratées. Ne touche PAS au pipeline d'extraction.
//
// 4 langues selon le `language_code` du client Telegram :
//   'ar-MA'                 → DARIJA (arabe marocain)
//   'ar' ou tout 'ar-*'     → ARABE LITTÉRAIRE (MSA)
//   'fr' ou 'fr-*'          → FRANÇAIS
//   tout le reste (en, tr…) → ANGLAIS (fallback international)
// ⚠️ Ordre : 'ar-MA' testé AVANT 'ar' générique (sinon la darija ne se déclenche jamais).
//
// Devise GÉNÉRIQUE : le fournisseur écrit dans SA devise (aucune unité figée sur les
// exemples de paliers). AUCUN secret : le numéro WhatsApp vient de
// NEXT_PUBLIC_WHATSAPP_PHONE (config publique), injecté par l'appelant. Texte BRUT
// (pas de parse_mode) → les URL wa.me s'auto-linkent. Chiffres en NUMÉRAUX LATINS.

import { formatQty } from '@/lib/utils'

export type WelcomeLang = 'darija' | 'msa' | 'fr' | 'en'

/**
 * Résout la langue du message selon le `language_code` Telegram.
 * 'ar-MA' → darija ; autre 'ar*' → msa ; 'fr*' → fr ; reste → en.
 */
export function pickWelcomeLang(languageCode: string | null | undefined): WelcomeLang {
  const code = (languageCode ?? '').trim().toLowerCase()
  if (code.startsWith('ar-ma')) return 'darija' // AVANT le 'ar' générique
  if (code.startsWith('ar')) return 'msa'
  if (code.startsWith('fr')) return 'fr'
  return 'en'
}

function frenchWelcome(waUrl: string): string {
  return [
    'Bienvenue chez Abdou Baba 👋',
    '',
    'Pour proposer un produit, envoyez-nous ici :',
    '1) Une photo claire du produit.',
    '2) Une courte description : le nom + le prix.',
    '',
    '💰 Le prix — écrivez-le comme ça (ça accélère la validation) :',
    '• Le prix à l’unité, dans votre devise — MAD (DH), AED, ou USD à l’international.',
    '• Puis les prix de gros dégressifs (prix par pièce), dans la même devise : 50 pièces à 18 l’unité, 200 pièces à 16 l’unité, 500 pièces à 14 l’unité.',
    '• Le 1er palier correspond à la quantité minimum de commande.',
    '',
    'Chaque produit est vérifié par un administrateur avant sa publication.',
    '',
    `Besoin d’aide ? Écrivez-nous sur WhatsApp : ${waUrl} — on répond vite ⚡`,
  ].join('\n')
}

function englishWelcome(waUrl: string): string {
  return [
    'Welcome to Abdou Baba 👋',
    '',
    'To offer a product, send us here:',
    '1) A clear photo of the product.',
    '2) A short description: the name + the price.',
    '',
    '💰 The price — write it like this (it speeds up approval):',
    '• The unit price, in your currency — MAD (DH), AED, or USD internationally.',
    '• Then the decreasing wholesale prices (price per piece), in the same currency: 50 pieces at 18 per unit, 200 pieces at 16 per unit, 500 pieces at 14 per unit.',
    '• The 1st tier is the minimum order quantity.',
    '',
    'Every product is checked by an admin before it goes live.',
    '',
    `Need help? Message us on WhatsApp: ${waUrl} — we reply fast ⚡`,
  ].join('\n')
}

function msaWelcome(waUrl: string): string {
  return [
    'مرحباً بك في Abdou Baba 👋',
    '',
    'لعرض منتج، أرسل إلينا هنا:',
    '1) صورة واضحة للمنتج.',
    '2) وصفاً موجزاً: الاسم + السعر.',
    '',
    '💰 السعر — اكتبه بهذا الشكل (لتسريع المراجعة):',
    '• سعر الوحدة بعملتك — الدرهم المغربي (MAD)، الدرهم الإماراتي (AED)، أو الدولار (USD) دولياً.',
    `• ثم أسعار الجملة المتناقصة (السعر لكل وحدة) بنفس العملة: ${formatQty(50)} قطعة بسعر ${formatQty(18)} للوحدة، ${formatQty(200)} قطعة بسعر ${formatQty(16)} للوحدة، ${formatQty(500)} قطعة بسعر ${formatQty(14)} للوحدة.`,
    '• الشريحة الأولى تمثّل الحد الأدنى للطلب.',
    '',
    'يخضع كل منتج لمراجعة المشرف قبل نشره.',
    '',
    `بحاجة إلى مساعدة؟ راسلنا على واتساب: ${waUrl} — نردّ بسرعة ⚡`,
  ].join('\n')
}

function darijaWelcome(waUrl: string): string {
  return [
    'مرحبا بيك فـ Abdou Baba 👋',
    '',
    'باش تعرض منتج، صيفط لنا هنا:',
    '1) تصويرة واضحة ديال المنتج.',
    '2) وصف قصير: السمية + الثمن.',
    '',
    '💰 الثمن — كتبو بهاد الشكل (باش نصادقو عليه بزربة):',
    '• الثمن ديال الوحدة بالعملة ديالك — الدرهم المغربي (MAD)، الدرهم الإماراتي (AED)، ولا الدولار (USD) فالخارج.',
    `• ومن بعد أثمنة الجملة اللي كتنقص (الثمن لكل حبة) بنفس العملة: ${formatQty(50)} حبة بـ ${formatQty(18)} للحبة، ${formatQty(200)} حبة بـ ${formatQty(16)} للحبة، ${formatQty(500)} حبة بـ ${formatQty(14)} للحبة.`,
    '• أول شريحة هي الكمية الدنيا ديال الطلب.',
    '',
    'كل منتج كيتشيك من طرف الأدمين قبل ما يتنشر.',
    '',
    `محتاج مساعدة؟ تواصل معانا فـ واتساب: ${waUrl} — كنجاوبو دغيا ⚡`,
  ].join('\n')
}

/**
 * Construit le message d'accueil selon la langue du client Telegram.
 * @param languageCode `msg.from.language_code` (ex. 'fr', 'ar', 'ar-MA', 'en', 'tr')
 * @param whatsappPhone numéro WhatsApp de contact (chiffres, ex. '212600000000')
 */
export function buildSupplierWelcome(
  languageCode: string | null | undefined,
  whatsappPhone: string,
): string {
  const waUrl = `https://wa.me/${whatsappPhone}`
  switch (pickWelcomeLang(languageCode)) {
    case 'darija':
      return darijaWelcome(waUrl)
    case 'msa':
      return msaWelcome(waUrl)
    case 'fr':
      return frenchWelcome(waUrl)
    default:
      return englishWelcome(waUrl)
  }
}
