// ─── Libellés i18n des relevés PDF (module Livreurs, Lot F) ──────────────────
//
// Les PDF sont générés dans la langue demandée (FR / AR / EN) — y compris le RTL
// arabe (cf. pdf-fonts.ts). Les CHIFFRES restent en numéraux latins 1234567890
// (règle i18n du projet). Aucun texte en dur dans les renderers : tout passe ici.

export type StatementLocale = 'fr' | 'ar' | 'en'

export function normalizeStatementLocale(input?: string | null): StatementLocale {
  const base = (input ?? 'fr').split('-')[0].toLowerCase()
  return base === 'ar' ? 'ar' : base === 'en' ? 'en' : 'fr'
}

export function isRtl(locale: StatementLocale): boolean {
  return locale === 'ar'
}

// ── Relevé affilié (au payout) ───────────────────────────────────────────────
export interface PayoutLabels {
  docTitle: string
  affiliate: string
  period: string
  paidAt: string
  method: string
  reference: string
  methods: Record<string, string>
  colRef: string
  colDate: string
  colOrder: string
  colCommission: string
  total: string
  footer: string
  emptyLines: string
}

const PAYOUT: Record<StatementLocale, PayoutLabels> = {
  fr: {
    docTitle: 'Relevé de paiement affilié',
    affiliate: 'Affilié',
    period: 'Période couverte',
    paidAt: 'Date de paiement',
    method: 'Méthode',
    reference: 'Référence',
    methods: { virement: 'Virement', cash: 'Espèces', cheque: 'Chèque', autre: 'Autre' },
    colRef: 'Réf. commande',
    colDate: 'Date',
    colOrder: 'Montant commande',
    colCommission: 'Commission',
    total: 'Total commissions payées',
    footer: 'Relevé émis par voie électronique — Mozouna Group. Document figé au paiement.',
    emptyLines: 'Aucune commission sur ce paiement.',
  },
  ar: {
    docTitle: 'كشف دفع الموزّع',
    affiliate: 'الموزّع',
    period: 'الفترة المشمولة',
    paidAt: 'تاريخ الدفع',
    method: 'طريقة الدفع',
    reference: 'المرجع',
    methods: { virement: 'تحويل بنكي', cash: 'نقداً', cheque: 'شيك', autre: 'أخرى' },
    colRef: 'مرجع الطلب',
    colDate: 'التاريخ',
    colOrder: 'مبلغ الطلب',
    colCommission: 'العمولة',
    total: 'مجموع العمولات المدفوعة',
    footer: 'كشف صادر إلكترونياً — مجموعة مزونة. وثيقة مجمّدة عند الدفع.',
    emptyLines: 'لا توجد عمولات في هذا الدفع.',
  },
  en: {
    docTitle: 'Affiliate payout statement',
    affiliate: 'Affiliate',
    period: 'Period covered',
    paidAt: 'Payment date',
    method: 'Method',
    reference: 'Reference',
    methods: { virement: 'Bank transfer', cash: 'Cash', cheque: 'Cheque', autre: 'Other' },
    colRef: 'Order ref.',
    colDate: 'Date',
    colOrder: 'Order amount',
    colCommission: 'Commission',
    total: 'Total commissions paid',
    footer: 'Statement issued electronically — Mozouna Group. Frozen at payment.',
    emptyLines: 'No commission on this payout.',
  },
}

export function payoutLabels(locale: StatementLocale): PayoutLabels {
  return PAYOUT[locale]
}

// ── Relevé livreur signable ──────────────────────────────────────────────────
export interface CourierLabels {
  docTitle: string
  subtitle: string
  courier: string
  kind: string
  type: Record<string, string>
  period: string
  generatedAt: string
  activityTitle: string
  pickups: string
  deliveries: string
  cashCollected: string
  returnsDepot: string
  returnsCompany: string
  losses: string
  cashRemitted: string
  balanceTitle: string
  cashOwed: string
  productDebt: string
  finalBalance: string
  finalHint: string
  sigCourier: string
  sigCompany: string
  sigLine: string
  footer: string
}

const COURIER: Record<StatementLocale, CourierLabels> = {
  fr: {
    docTitle: 'Relevé livreur',
    subtitle: 'Document de rapprochement — preuve en cas de litige',
    courier: 'Livreur',
    kind: 'Type',
    type: { company: 'Société', personal: 'Personnel' },
    period: 'Période',
    generatedAt: 'Établi le',
    activityTitle: 'Activité de la période',
    pickups: 'Colis ramassés',
    deliveries: 'Colis livrés',
    cashCollected: 'Cash encaissé (livraisons)',
    returnsDepot: 'Retours confirmés dépôt',
    returnsCompany: 'Retours confirmés société',
    losses: 'Pertes (créances produit)',
    cashRemitted: 'Cash versé',
    balanceTitle: 'Solde (grand livre)',
    cashOwed: 'Cash dû',
    productDebt: 'Créances produit',
    finalBalance: 'SOLDE FINAL',
    finalHint: 'Solde issu du grand livre au moment de l’établissement du relevé.',
    sigCourier: 'Livreur (lu et approuvé)',
    sigCompany: 'Mozouna / responsable',
    sigLine: 'Nom + signature + date',
    footer: 'Relevé figé — Mozouna Group. Les montants proviennent du grand livre.',
  },
  ar: {
    docTitle: 'كشف حساب الحامل',
    subtitle: 'وثيقة تسوية — إثبات في حالة النزاع',
    courier: 'الحامل',
    kind: 'النوع',
    type: { company: 'شركة', personal: 'شخصي' },
    period: 'الفترة',
    generatedAt: 'حُرّر في',
    activityTitle: 'نشاط الفترة',
    pickups: 'الطرود المستلمة',
    deliveries: 'الطرود المسلّمة',
    cashCollected: 'النقد المحصّل (التسليمات)',
    returnsDepot: 'المرتجعات المؤكّدة بالمستودع',
    returnsCompany: 'المرتجعات المؤكّدة بالشركة',
    losses: 'الخسائر (ديون المنتج)',
    cashRemitted: 'النقد المسلّم',
    balanceTitle: 'الرصيد (دفتر الأستاذ)',
    cashOwed: 'النقد المستحق',
    productDebt: 'ديون المنتج',
    finalBalance: 'الرصيد النهائي',
    finalHint: 'الرصيد مأخوذ من دفتر الأستاذ لحظة تحرير الكشف.',
    sigCourier: 'الحامل (اطّلع ووافق)',
    sigCompany: 'مزونة / المسؤول',
    sigLine: 'الاسم + التوقيع + التاريخ',
    footer: 'كشف مجمّد — مجموعة مزونة. المبالغ من دفتر الأستاذ.',
  },
  en: {
    docTitle: 'Courier statement',
    subtitle: 'Reconciliation document — proof in case of dispute',
    courier: 'Courier',
    kind: 'Type',
    type: { company: 'Company', personal: 'Personal' },
    period: 'Period',
    generatedAt: 'Issued on',
    activityTitle: 'Period activity',
    pickups: 'Parcels picked up',
    deliveries: 'Parcels delivered',
    cashCollected: 'Cash collected (deliveries)',
    returnsDepot: 'Returns confirmed at depot',
    returnsCompany: 'Returns confirmed at company',
    losses: 'Losses (product debts)',
    cashRemitted: 'Cash remitted',
    balanceTitle: 'Balance (ledger)',
    cashOwed: 'Cash owed',
    productDebt: 'Product debts',
    finalBalance: 'FINAL BALANCE',
    finalHint: 'Balance from the ledger at the moment the statement was issued.',
    sigCourier: 'Courier (read and approved)',
    sigCompany: 'Mozouna / manager',
    sigLine: 'Name + signature + date',
    footer: 'Frozen statement — Mozouna Group. Amounts come from the ledger.',
  },
}

export function courierLabels(locale: StatementLocale): CourierLabels {
  return COURIER[locale]
}

// ── Formatage des montants (numéraux latins, MAD, sans isolat bidi) ──────────
export function fmtMad(n: number): string {
  const v = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(n)
  return `${v} MAD`
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function fmtInt(n: number): string {
  return new Intl.NumberFormat('en-US', { useGrouping: true }).format(n)
}
