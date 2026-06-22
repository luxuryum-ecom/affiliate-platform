import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '@/components/admin/product-form'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTariffs } from '@/app/actions/tariffs'
import { getRatesMap } from '@/lib/fx'
import { getTranslations } from 'next-intl/server'
import { normalizeSaleUnit } from '@/lib/units'
import { getCategoryDisplayList } from '@/lib/categories/display'
import type { Product } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.productNew')
  return { title: t('metaTitle') }
}

interface NewProductPageProps {
  searchParams: Promise<{ from_supplier?: string }>
}

export default async function NewProductPage({ searchParams }: NewProductPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const t = await getTranslations('admin.productNew')
  const tc = await getTranslations('admin.common')

  const { from_supplier } = await searchParams

  const [profileResult, tariffs, rates, categories] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    getTariffs(),
    getRatesMap(supabase),
    getCategoryDisplayList(),
  ])

  const profile = profileResult.data as { full_name: string } | null

  // ── Flux « Finaliser » (Option 1) : pré-remplissage des BASIQUES depuis un
  // supplier_product approuvé. AUCUNE donnée d'argent (coût, marge, frais, paliers,
  // sell_price, commission, affiliate_enabled) n'est seedée → l'admin les saisit dans
  // le formulaire déjà audité. id VIDE = nouvelle ligne products (jamais l'id du
  // supplier_product). Le lien anti-doublon passe par `sourceSupplierProductId`.
  let seed: Product | undefined
  let sourceSupplierProductId: string | undefined
  if (from_supplier) {
    const { data: sp } = (await supabase
      .from('supplier_products')
      .select(
        'id, product_name, public_name, description, public_description, category, subcategory, origin_country, stock_quantity, photos, unit, pack_size, pack_unit'
      )
      .eq('id', from_supplier)
      .eq('approval_status', 'approved')
      .maybeSingle()) as {
      data: {
        id: string
        product_name: string
        public_name: string | null
        description: string | null
        public_description: string | null
        category: string | null
        subcategory: string | null
        origin_country: string | null
        stock_quantity: number | null
        photos: string[] | null
        unit: string | null
        pack_size: number | null
        pack_unit: string | null
      } | null
      error: unknown
    }
    if (sp) {
      const photos = sp.photos ?? []
      // Unité de vente reportée depuis l'IA Telegram : une unité RÉELLE seulement
      // (kg/metre/paquet/carton). 'pcs'/null → null = pièce → aucun suffixe (inchangé).
      const seededUnit = normalizeSaleUnit(sp.unit)
      // Graine BASIQUES + unité/conditionnement (P1/P3, affichage). Champs d'argent
      // OMIS → le form les initialise vides. affiliate_enabled = false.
      seed = {
        name: sp.public_name || sp.product_name,
        description: sp.public_description || sp.description,
        category: sp.category,
        subcategory: sp.subcategory,
        origin_country: sp.origin_country,
        availability_type: 'local_stock',
        stock_count: sp.stock_quantity ?? 0,
        affiliate_enabled: false,
        sale_unit: seededUnit === 'piece' ? null : seededUnit,
        pack_size: sp.pack_size,
        pack_unit: sp.pack_unit,
        media: photos.map((url) => ({ url, type: 'image' as const })),
        images: photos,
      } as unknown as Product
      sourceSupplierProductId = sp.id
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/products"
        backLabel={tc('product')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-lg font-semibold text-foreground mb-6">{t('formTitle')}</h1>
        <div className="bg-surface rounded-xl border border-line p-6">
          <ProductForm
            product={seed}
            sourceSupplierProductId={sourceSupplierProductId}
            tariffs={tariffs}
            rates={rates}
            categories={categories}
          />
        </div>
      </main>
    </div>
  )
}
