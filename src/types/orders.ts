/** Shared across order actions and components. */
export type ActionState = { error: string | null; success: boolean }

export type OrderFormState = {
  error: string | null
  success: boolean
  orderId: string | null
}

export const LOW_STOCK_THRESHOLD = 5
