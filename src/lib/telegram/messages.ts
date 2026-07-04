// ─── Messages du bot fournisseur (4 langues) ─────────────────────────────────
// PUR & testable. Miroir de `welcome.ts` : routage par `language_code` via le MÊME
// `pickWelcomeLang` (ar-MA→darija, ar→fus'ha, fr→FR, autre→EN). On ne réécrit PAS
// le routage. Ton simple/direct (fournisseurs parfois peu alphabétisés). Chaque
// message d'erreur est GUIDANT : il finit par l'action à faire. Emojis conservés
// pour la clarté visuelle. Chiffres en NUMÉRAUX LATINS. La logique du bot
// (ingest.ts) n'est pas touchée : ce module ne fournit QUE des chaînes de texte.

import { pickWelcomeLang, type WelcomeLang } from './welcome'
import { formatQty } from '@/lib/utils'
import { matchKnownSaleUnit, type SaleUnit } from '@/lib/units'

type Table = Record<WelcomeLang, string>

/** Sélectionne la variante linguistique selon le language_code Telegram. */
function t(languageCode: string | null | undefined, table: Table): string {
  return table[pickWelcomeLang(languageCode)]
}

// ── LIAISON (/link) ──────────────────────────────────────────────────────────

// 1 — Code au mauvais format → renvoyer vers le bouton du site.
export function msgLinkCodeInvalid(lc: string | null | undefined): string {
  return t(lc, {
    fr: '❌ Ce lien n\'est pas valide. Retournez sur le site Abdou Baba et cliquez sur « Activer sur Telegram » pour obtenir un nouveau lien.',
    en: '❌ This link isn\'t valid. Go back to the Abdou Baba site and tap “Activate on Telegram” to get a new link.',
    msa: '❌ هذا الرابط غير صالح. ارجع إلى موقع Abdou Baba واضغط «التفعيل عبر تيليغرام» للحصول على رابط جديد.',
    darija: '❌ هاد الرابط ماشي صالح. رجع لموقع Abdou Baba وكليكي على «التفعيل عبر تيليغرام» باش تاخد رابط جديد.',
  })
}

// 2 — Compte déjà lié → dire quoi faire ensuite (envoyer une photo).
export function msgAlreadyLinked(lc: string | null | undefined): string {
  return t(lc, {
    fr: '✅ Votre compte est déjà connecté. Envoyez directement une photo de produit avec son prix.',
    en: '✅ Your account is already connected. Just send a product photo with its price.',
    msa: '✅ حسابك متصل بالفعل. أرسل مباشرةً صورة المنتج مع سعره.',
    darija: '✅ حسابك راه متصل من قبل. صيفط دغيا تصويرة ديال المنتج مع الثمن ديالو.',
  })
}

// 3 — Code introuvable → renvoyer vers le bouton du site.
export function msgCodeNotFound(lc: string | null | undefined): string {
  return t(lc, {
    fr: '❌ Ce lien est introuvable. Retournez sur le site Abdou Baba et cliquez sur « Activer sur Telegram » pour obtenir un nouveau lien.',
    en: '❌ This link wasn\'t found. Go back to the Abdou Baba site and tap “Activate on Telegram” to get a new link.',
    msa: '❌ هذا الرابط غير موجود. ارجع إلى موقع Abdou Baba واضغط «التفعيل عبر تيليغرام» للحصول على رابط جديد.',
    darija: '❌ هاد الرابط ما لقيناهش. رجع لموقع Abdou Baba وكليكي على «التفعيل عبر تيليغرام» باش تاخد رابط جديد.',
  })
}

// 4 — Code expiré → recliquer sur le bouton du site.
export function msgCodeExpired(lc: string | null | undefined): string {
  return t(lc, {
    fr: '⏱️ Votre lien a expiré. Retournez sur le site Abdou Baba et cliquez à nouveau sur « Activer sur Telegram ».',
    en: '⏱️ Your link has expired. Go back to the Abdou Baba site and tap “Activate on Telegram” again.',
    msa: '⏱️ انتهت صلاحية رابطك. ارجع إلى موقع Abdou Baba واضغط «التفعيل عبر تيليغرام» من جديد.',
    darija: '⏱️ الرابط ديالك سالات صلاحيتو. رجع لموقع Abdou Baba وكليكي عاود على «التفعيل عبر تيليغرام».',
  })
}

// 5 — Liaison impossible (collision) → contacter le support.
export function msgLinkFailed(lc: string | null | undefined): string {
  return t(lc, {
    fr: '⚠️ Connexion impossible (ce compte Telegram est peut-être déjà utilisé). Contactez le support Abdou Baba pour qu\'on vous aide.',
    en: '⚠️ Couldn\'t connect (this Telegram account may already be in use). Contact Abdou Baba support and we\'ll help you.',
    msa: '⚠️ تعذّر الاتصال (قد يكون حساب تيليغرام هذا مستعملًا بالفعل). تواصل مع دعم Abdou Baba وسنساعدك.',
    darija: '⚠️ ما قدرناش نربطو (يمكن هاد الحساب ديال تيليغرام مستعمل من قبل). تواصل مع دعم Abdou Baba باش نعاونوك.',
  })
}

// 6 — Liaison réussie + consigne d'envoi.
export function msgLinkedSuccess(lc: string | null | undefined): string {
  return t(lc, {
    fr: '✅ Compte connecté ! Envoyez maintenant une photo du produit avec son nom et son prix. Un administrateur la vérifie avant publication.',
    en: '✅ Account connected! Now send a product photo with its name and price. An admin checks it before publication.',
    msa: '✅ تم ربط الحساب! أرسل الآن صورة المنتج مع اسمه وسعره. يراجعها المشرف قبل النشر.',
    darija: '✅ تربط الحساب! دابا صيفط تصويرة ديال المنتج مع السمية والثمن. الأدمين كيشيكها قبل النشر.',
  })
}

// ── ENVOI PRODUIT — garde-fous ───────────────────────────────────────────────

// 7 — Photo envoyée mais compte non lié → connecter puis renvoyer la photo.
export function msgNotLinkedYet(lc: string | null | undefined): string {
  return t(lc, {
    fr: '📸 Photo bien reçue, mais votre compte n\'est pas encore connecté. Retournez sur le site Abdou Baba, cliquez sur « Activer sur Telegram », puis renvoyez votre photo.',
    en: '📸 Photo received, but your account isn\'t connected yet. Go back to the Abdou Baba site, tap “Activate on Telegram”, then send your photo again.',
    msa: '📸 وصلت الصورة، لكن حسابك غير متصل بعد. ارجع إلى موقع Abdou Baba واضغط «التفعيل عبر تيليغرام»، ثم أعد إرسال صورتك.',
    darija: '📸 وصلات التصويرة، ولكن حسابك مازال ماشي متصل. رجع لموقع Abdou Baba وكليكي على «التفعيل عبر تيليغرام»، ومن بعد عاود صيفط التصويرة.',
  })
}

// 8 — Rate-limit → patienter puis renvoyer.
export function msgRateLimited(lc: string | null | undefined): string {
  return t(lc, {
    fr: '⏳ Vous avez envoyé beaucoup de produits d\'un coup. Patientez une heure, puis renvoyez vos photos.',
    en: '⏳ You\'ve sent many products at once. Please wait an hour, then send your photos again.',
    msa: '⏳ أرسلت منتجات كثيرة دفعة واحدة. انتظر ساعة، ثم أعد إرسال صورك.',
    darija: '⏳ صيفطي بزاف ديال المنتجات مرة وحدة. تسنى ساعة، ومن بعد عاود صيفط التصاور.',
  })
}

// 9 — Pays/devise non configuré → régler le pays puis renvoyer.
export function msgNoCountry(lc: string | null | undefined): string {
  return t(lc, {
    fr: '🌍 Avant d\'envoyer un produit, choisissez votre PAYS dans votre profil sur le site Abdou Baba (il fixe votre devise). Ensuite, renvoyez votre photo.',
    en: '🌍 Before sending a product, set your COUNTRY in your profile on the Abdou Baba site (it sets your currency). Then send your photo again.',
    msa: '🌍 قبل إرسال منتج، حدّد بلدك في ملفك على موقع Abdou Baba (فهو يحدّد عملتك). ثم أعد إرسال صورتك.',
    darija: '🌍 قبل ما تصيفط منتج، ختار البلد ديالك فالبروفيل ديالك على موقع Abdou Baba (هو اللي كيحدد العملة). ومن بعد عاود صيفط التصويرة.',
  })
}

// 10 — Limite du plan atteinte (variables) → passer à un plan supérieur.
export function msgLimitReached(
  lc: string | null | undefined,
  vars: { current: number; max: number; plan: string },
): string {
  const { current, max, plan } = vars
  const c = String(current)
  const m = String(max)
  return t(lc, {
    fr: `🚫 Vous avez atteint votre limite de produits (${c}/${m} — plan ${plan}). Passez à un plan supérieur sur le site pour en ajouter.`,
    en: `🚫 You've reached your product limit (${c}/${m} — ${plan} plan). Upgrade your plan on the site to add more.`,
    msa: `🚫 بلغت الحد الأقصى للمنتجات (${c}/${m} — خطة ${plan}). ترقَّ إلى خطة أعلى على الموقع لإضافة المزيد.`,
    darija: `🚫 وصلتي للحد الأقصى ديال المنتجات (${c}/${m} — خطة ${plan}). بدّل لخطة أعلى فالموقع باش تزيد.`,
  })
}

// ── RÉSULTAT PRODUIT ─────────────────────────────────────────────────────────

// 11a — Ligne prix : convertie en MAD.
export function msgPriceWithMad(
  lc: string | null | undefined,
  vars: {
    price: string | number | null | undefined
    currency: string | null | undefined
    mad: string | number | null | undefined
  },
): string {
  const price = vars.price ?? '?'
  const currency = vars.currency ?? ''
  const mad = vars.mad ?? '?'
  return t(lc, {
    fr: `Prix : ${price} ${currency} ≈ ${mad} DH`,
    en: `Price: ${price} ${currency} ≈ ${mad} MAD`,
    msa: `السعر: ${price} ${currency} ≈ ${mad} درهم`,
    darija: `الثمن: ${price} ${currency} ≈ ${mad} درهم`,
  })
}

// 11b — Ligne prix : taux de change non encore configuré.
export function msgPriceNoRate(
  lc: string | null | undefined,
  vars: { price: string | number | null | undefined; currency: string | null | undefined },
): string {
  const price = vars.price ?? '?'
  const currency = vars.currency ?? ''
  return t(lc, {
    fr: `Prix : ${price} ${currency} (taux pas encore configuré — l'admin le fixera)`,
    en: `Price: ${price} ${currency} (exchange rate not set yet — the admin will set it)`,
    msa: `السعر: ${price} ${currency} (سعر الصرف غير محدّد بعد — سيحدّده المشرف)`,
    darija: `الثمن: ${price} ${currency} (سعر الصرف مازال ما تحددش — الأدمين غادي يحددو)`,
  })
}

// 11c — Ligne prix : non détecté.
export function msgPriceUnknown(lc: string | null | undefined): string {
  return t(lc, {
    fr: 'Prix : non détecté (à compléter)',
    en: 'Price: not detected (to be completed)',
    msa: 'السعر: غير مكتشف (يُستكمل لاحقًا)',
    darija: 'الثمن: ما تلقاش (خاصو يتكمل)',
  })
}

// 11 — Accusé de réception du produit (composite). La ligne prix est fournie déjà
// résolue par l'appelant (msgPriceWithMad / msgPriceNoRate / msgPriceUnknown) — la
// SÉLECTION de la variante reste dans ingest.ts (dépend des données de pricing).
export function msgProductReceived(
  lc: string | null | undefined,
  vars: { productName: string; category: string; subcategory?: string | null; priceLine: string },
): string {
  const { productName, category, subcategory, priceLine } = vars
  const lang = pickWelcomeLang(lc)
  const header: Table = {
    fr: 'Produit reçu ✅',
    en: 'Product received ✅',
    msa: 'تم استلام المنتج ✅',
    darija: 'توصلنا بالمنتج ✅',
  }
  const catLabel: Table = {
    fr: 'Catégorie :',
    en: 'Category:',
    msa: 'الفئة:',
    darija: 'الصنف:',
  }
  const footer: Table = {
    fr: '⏳ En attente de validation par un administrateur avant publication.',
    en: '⏳ Waiting for an admin to approve it before publication.',
    msa: '⏳ في انتظار موافقة المشرف قبل النشر.',
    darija: '⏳ كيتسنّى موافقة الأدمين قبل النشر.',
  }
  const catLine = `${catLabel[lang]} ${category}${subcategory ? ' / ' + subcategory : ''}`
  return `${header[lang]}\n• ${productName}\n• ${catLine}\n• ${priceLine}\n${footer[lang]}`
}

// 12 — Échec de l'analyse du produit → renvoyer une photo nette.
export function msgAnalysisFailed(lc: string | null | undefined): string {
  return t(lc, {
    fr: '😕 Je n\'ai pas réussi à lire ce produit. Renvoyez une photo bien nette avec le nom et le prix.',
    en: '😕 I couldn\'t read this product. Send a clear photo again with the name and the price.',
    msa: '😕 لم أتمكن من قراءة هذا المنتج. أعد إرسال صورة واضحة مع الاسم والسعر.',
    darija: '😕 ما قدرتش نقرا هاد المنتج. عاود صيفط تصويرة واضحة مع السمية والثمن.',
  })
}

// ── BRIQUE 3 — CONVERSATION (le bot demande l'info manquante, 1 question à la fois) ──

// 14-bis — Produit reçu, PRIX manquant → TOUT expliquer d'un coup (fini le ping-pong).
// Le fournisseur peut répondre en une seule fois : prix (obligatoire) + paliers (option).
export function msgAskPriceAndTiers(lc: string | null | undefined, vars: { name: string }): string {
  const { name } = vars
  return t(lc, {
    fr: `J'ai bien reçu votre ${name} 📸\nPour le publier, envoyez-moi :\n💰 Le PRIX unitaire (obligatoire, ex : 160 dh)\n📦 Vos prix de gros si vous en avez — prix PAR PIÈCE, dégressif (ex : 30 pièces à 120 dh l'unité, 200 pièces à 110 dh l'unité). Sinon ignorez.\n\n👉 Vous pouvez tout écrire d'un coup, exemple :\n« 160 dh, 30 pièces à 120 dh l'unité, 200 pièces à 110 dh l'unité »`,
    en: `I've received your ${name} 📸\nTo publish it, send me:\n💰 The unit PRICE (required, e.g. 160 dh)\n📦 Your wholesale prices if you have any — price PER PIECE, decreasing (e.g. 30 pieces at 120 dh per unit, 200 pieces at 110 dh per unit). Otherwise skip.\n\n👉 You can write it all at once, example:\n"160 dh, 30 pieces at 120 dh per unit, 200 pieces at 110 dh per unit"`,
    msa: `استلمت ${name} 📸\nلنشره، أرسل لي:\n💰 سعر الوحدة (إلزامي، مثال: ${formatQty(160)} درهم)\n📦 أسعار الجملة إن وُجدت — السعر لكل وحدة، يتناقص كلما زادت الكمية (مثال: ${formatQty(30)} قطعة بسعر ${formatQty(120)} درهم للوحدة، ${formatQty(200)} قطعة بسعر ${formatQty(110)} درهم للوحدة). وإلا تجاوز.\n\n👉 يمكنك كتابة كل شيء دفعة واحدة، مثال:\n«${formatQty(160)} درهم، ${formatQty(30)} قطعة بسعر ${formatQty(120)} درهم للوحدة، ${formatQty(200)} قطعة بسعر ${formatQty(110)} درهم للوحدة»`,
    darija: `توصلت بـ ${name} 📸\nباش ننشرو، صيفط لي:\n💰 الثمن ديال الوحدة (إجباري، مثال: ${formatQty(160)} درهم)\n📦 أثمنة الجملة إلا كانو عندك — الثمن لكل حبة، كينقص ملي كتزيد الكمية (مثال: ${formatQty(30)} حبة بـ ${formatQty(120)} درهم للحبة، ${formatQty(200)} حبة بـ ${formatQty(110)} درهم للحبة). وإلا ماتكتبش.\n\n👉 تقدر تكتب كلشي مرة وحدة، مثال:\n«${formatQty(160)} درهم، ${formatQty(30)} حبة بـ ${formatQty(120)} درهم للحبة، ${formatQty(200)} حبة بـ ${formatQty(110)} درهم للحبة»`,
  })
}

// 14-ter — Fournisseur PERDU (« je comprends pas », « ? », « kifach ») → ré-expliquer simple.
export function msgReexplain(lc: string | null | undefined, vars: { name: string }): string {
  const { name } = vars
  return t(lc, {
    fr: `Pas de souci 🙂 Envoyez-moi juste le PRIX de votre ${name} (ex : 160 dh). Si vous avez des prix de gros, ajoutez-les après (ex : 160, 50 = 140). Sinon, le prix suffit.`,
    en: `No worries 🙂 Just send me the PRICE of your ${name} (e.g. 160 dh). If you have wholesale prices, add them after (e.g. 160, 50 = 140). Otherwise, the price is enough.`,
    msa: `لا تقلق 🙂 أرسل لي فقط سعر ${name} (مثال: 160 درهم). إن كانت لديك أسعار جملة، أضفها بعده (مثال: 160، 50 = 140). وإلا يكفي السعر.`,
    darija: `ماكاين مشكل 🙂 صيفط لي غير الثمن ديال ${name} (مثال: 160 درهم). إلا عندك أثمنة الجملة، زيدهم من بعد (مثال: 160، 50 = 140). وإلا الثمن كافي.`,
  })
}

// ── C1a — CONFIRMATION DE L'UNITÉ DE VENTE ───────────────────────────────────
// Le bot confirme l'unité détectée par l'IA ; le fournisseur valide (« oui ») ou
// écrit la bonne unité (texte LIBRE). Unité CONNUE → label traduit ; unité LIBRE
// (« botte ») → verbatim identique dans les 4 langues. En arabe, l'unité est
// ISOLÉE (FSI U+2068 / PDI U+2069) pour que l'ordre RTL reste correct même si
// c'est un mot latin (« botte »). Textes VALIDÉS par Abdou (capture RTL).

/** Libellés d'unités CONNUES pour le bot, par langue (verbatim si inconnue). */
const BOT_UNIT_LABELS: Record<SaleUnit, Record<WelcomeLang, string>> = {
  piece: { fr: 'pièce', en: 'piece', msa: 'قطعة', darija: 'حبة' },
  gramme: { fr: 'gramme', en: 'gram', msa: 'غرام', darija: 'غرام' },
  kg: { fr: 'kilo', en: 'kilo', msa: 'كيلوغرام', darija: 'كيلو' },
  metre: { fr: 'mètre', en: 'metre', msa: 'متر', darija: 'متر' },
  ml: { fr: 'ml', en: 'ml', msa: 'ملّيلتر', darija: 'ميلي' },
  litre: { fr: 'litre', en: 'litre', msa: 'لتر', darija: 'لتر' },
  paquet: { fr: 'paquet', en: 'pack', msa: 'حزمة', darija: 'كيس' },
  carton: { fr: 'carton', en: 'carton', msa: 'كرطونة', darija: 'كرطونة' },
}

/** Label d'unité pour le bot : unité connue → traduite ; libre → texte brut verbatim. */
function unitLabelForLang(rawUnit: string | null | undefined, lang: WelcomeLang): string {
  const canon = matchKnownSaleUnit(rawUnit)
  if (canon) return BOT_UNIT_LABELS[canon][lang]
  return (rawUnit ?? '').trim()
}

/** Isolat bidi (FSI…PDI) — garde un mot (latin ou arabe) à sa place en contexte RTL. */
function isolate(s: string): string {
  return `⁨${s}⁩`
}

// C1a — le bot CONFIRME l'unité détectée. Réponse « oui » = valider ; sinon = corriger.
export function msgConfirmUnit(lc: string | null | undefined, vars: { unit: string }): string {
  const lang = pickWelcomeLang(lc)
  const label = unitLabelForLang(vars.unit, lang)
  const u = isolate(label) // version isolée pour l'arabe (RTL)
  switch (lang) {
    case 'fr':
      return `📏 J'ai compris que ton unité de vente est : ${label}. Le prix s'affichera « par ${label} ». C'est bien ça ?\nRéponds « oui », ou écris la bonne unité (ex : gramme, litre, mètre, botte…).`
    case 'en':
      return `📏 I understood your sale unit is: ${label}. The price will show as "per ${label}". Is that right?\nReply "yes", or write the correct unit (e.g. gram, litre, metre, bunch…).`
    case 'msa':
      return `📏 فهمت أن وحدة البيع عندك هي: ${u}. سيظهر السعر «لكل ${u}». هل هذا صحيح؟\nأجب «نعم»، أو اكتب الوحدة الصحيحة (مثال: غرام، لتر، متر…).`
    case 'darija':
      return `📏 فهمت بلي وحدة البيع ديالك هي: ${u}. غادي يبان الثمن «لكل ${u}». واش هاكا؟\nجاوب «واه»، ولا كتب الوحدة الصحيحة (مثال: غرام، لتر، متر…).`
  }
}

// C1a — réponse à la confirmation d'unité inexploitable → redemander UNE fois, simplement.
export function msgReaskUnit(lc: string | null | undefined): string {
  return t(lc, {
    fr: 'Je n\'ai pas bien compris 🙏. Écris juste ton unité de vente (ex : gramme, litre, mètre, pièce, botte…).',
    en: 'I didn\'t quite get that 🙏. Just write your sale unit (e.g. gram, litre, metre, piece, bunch…).',
    msa: 'لم أفهم جيداً 🙏. اكتب فقط وحدة البيع (مثال: غرام، لتر، متر، قطعة…).',
    darija: 'ما فهمتش مزيان 🙏. كتب غير وحدة البيع ديالك (مثال: غرام، لتر، متر، حبة…).',
  })
}

// 14 — (conservé, compat) Produit reçu mais PRIX manquant → demander le prix unitaire.
export function msgAskPrice(lc: string | null | undefined, vars: { name: string }): string {
  const { name } = vars
  return t(lc, {
    fr: `J'ai bien reçu votre ${name} 📸. Quel est son prix unitaire ? (ex : 250 dh)`,
    en: `I've received your ${name} 📸. What's its unit price? (e.g. 250 dh)`,
    msa: `استلمت ${name} 📸. ما هو سعر الوحدة؟ (مثال: 250 درهم)`,
    darija: `توصلت بـ ${name} 📸. شحال الثمن ديال الوحدة؟ (مثال: 250 درهم)`,
  })
}

// 15 — Prix présent mais AUCUN palier → proposer jusqu'à 3 niveaux (suggérés, pas obligés).
export function msgAskTiers(lc: string | null | undefined, vars: { name: string }): string {
  const { name } = vars
  return t(lc, {
    fr: `Avez-vous de meilleurs prix pour de grosses quantités de ${name} ? Donnez jusqu'à 3 niveaux — écrivez : quantité = prix (ex : 50 = 140, 200 = 120, 500 = 100). Ou tapez « non ».`,
    en: `Do you have better prices for large quantities of ${name}? Give up to 3 levels — write: quantity = price (e.g. 50 = 140, 200 = 120, 500 = 100). Or type "no".`,
    msa: `هل لديك أسعار أفضل للكميات الكبيرة من ${name}؟ أعطِ حتى 3 مستويات — اكتب: الكمية = السعر (مثال: 50 = 140، 200 = 120، 500 = 100). أو اكتب «لا».`,
    darija: `واش عندك أثمنة حسن للكميات الكبيرة ديال ${name}؟ عطي حتى 3 مستويات — كتب: الكمية = الثمن (مثال: 50 = 140، 200 = 120، 500 = 100). ولا كتب «لا».`,
  })
}

// 15-bis — Réponse = prix SANS quantité (« 140 ») → demander la quantité (prix échoé).
export function msgAskTierQty(lc: string | null | undefined, vars: { price: string | number }): string {
  const { price } = vars
  return t(lc, {
    fr: `Pour quelle quantité minimum ce prix de ${price} s'applique-t-il ? Écrivez la quantité et le prix ensemble (ex : 50 = ${price}).`,
    en: `For what minimum quantity does this price of ${price} apply? Write the quantity and the price together (e.g. 50 = ${price}).`,
    msa: `لأي كمية دنيا ينطبق هذا السعر ${price}؟ اكتب الكمية والسعر معاً (مثال: 50 = ${price}).`,
    darija: `لأينا كمية دنيا كيطبق هاد الثمن ${price}؟ كتب الكمية والثمن مع بعض (مثال: 50 = ${price}).`,
  })
}

// 16 — Réponse prix inexploitable → redemander UNE fois, plus simplement.
export function msgReaskPrice(lc: string | null | undefined): string {
  return t(lc, {
    fr: 'Je n\'ai pas bien compris le prix 🙏. Envoyez juste le montant (ex : 250 dh).',
    en: 'I didn\'t quite get the price 🙏. Just send the amount (e.g. 250 dh).',
    msa: 'لم أفهم السعر جيداً 🙏. أرسل المبلغ فقط (مثال: 250 درهم).',
    darija: 'ما فهمتش الثمن مزيان 🙏. صيفط غير المبلغ (مثال: 250 درهم).',
  })
}

// 17 — Réponse paliers inexploitable → redemander UNE fois (ou « non »).
export function msgReaskTiers(lc: string | null | undefined): string {
  return t(lc, {
    fr: 'Je n\'ai pas bien compris 🙏. Donnez les prix de gros (ex : 50 = 220) ou répondez « non ».',
    en: 'I didn\'t quite get that 🙏. Give the wholesale prices (e.g. 50 = 220) or reply "no".',
    msa: 'لم أفهم جيداً 🙏. أعطِ أسعار الجملة (مثال: 50 = 220) أو أجب «لا».',
    darija: 'ما فهمتش مزيان 🙏. عطي أثمنة الجملة (مثال: 50 = 220) ولا جاوب «لا».',
  })
}

// 18 — Relance UNIQUE (~1h) quand le fournisseur n'a pas répondu (prix attendu).
export function msgReminderPrice(lc: string | null | undefined, vars: { name: string }): string {
  const { name } = vars
  return t(lc, {
    fr: `Votre ${name} attend son prix pour être publié 🙂. Répondez avec le prix quand vous voulez.`,
    en: `Your ${name} is waiting for its price to be published 🙂. Reply with the price whenever you like.`,
    msa: `${name} في انتظار سعره ليُنشر 🙂. أرسل السعر متى شئت.`,
    darija: `${name} كيتسنى الثمن ديالو باش يتنشر 🙂. صيفط الثمن فاش بغيتي.`,
  })
}

// 19 — Relance UNIQUE (~1h) quand paliers attendus (le prix est déjà là).
export function msgReminderTiers(lc: string | null | undefined, vars: { name: string }): string {
  const { name } = vars
  return t(lc, {
    fr: `Votre ${name} est presque prêt 🙂. Avez-vous des prix de gros ? Sinon répondez « non ».`,
    en: `Your ${name} is almost ready 🙂. Do you have wholesale prices? Otherwise reply "no".`,
    msa: `${name} شبه جاهز 🙂. هل لديك أسعار جملة؟ وإلا أجب «لا».`,
    darija: `${name} تقريباً واجد 🙂. واش عندك أثمنة ديال الجملة؟ وإلا جاوب «لا».`,
  })
}

// ── GUIDAGE ──────────────────────────────────────────────────────────────────

// 13 — Message texte sans commande → comment ajouter un produit / se connecter.
export function msgGuide(lc: string | null | undefined): string {
  return t(lc, {
    fr: '📸 Pour ajouter un produit, envoyez une photo avec son nom et son prix. Pas encore connecté ? Cliquez sur « Activer sur Telegram » sur le site Abdou Baba.',
    en: '📸 To add a product, send a photo with its name and price. Not connected yet? Tap “Activate on Telegram” on the Abdou Baba site.',
    msa: '📸 لإضافة منتج، أرسل صورة مع اسمه وسعره. لم تتصل بعد؟ اضغط «التفعيل عبر تيليغرام» على موقع Abdou Baba.',
    darija: '📸 باش تزيد منتج، صيفط تصويرة مع السمية والثمن. مازال ما تصلتيش؟ كليكي على «التفعيل عبر تيليغرام» فموقع Abdou Baba.',
  })
}
