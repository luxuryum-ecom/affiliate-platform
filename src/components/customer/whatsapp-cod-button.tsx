import { formatMAD } from '@/lib/utils'

interface WhatsAppCodButtonProps {
  productName: string
  sellPrice: number
  phone?: string
}

export function WhatsAppCodButton({
  productName,
  sellPrice,
  phone = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000',
}: WhatsAppCodButtonProps) {
  const message = encodeURIComponent(
    `Bonjour, je souhaite commander "${productName}" (${formatMAD(sellPrice)}/unité) en paiement à la livraison.`
  )
  const href = `https://wa.me/${phone.replace(/\D/g, '')}?text=${message}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 w-full py-3 border border-green-200 bg-green-50 text-green-800 font-medium rounded-xl hover:bg-green-100 transition-colors text-sm"
    >
      <span aria-hidden>💬</span>
      Commander via WhatsApp
    </a>
  )
}
