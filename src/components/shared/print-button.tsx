'use client'

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-sm font-medium text-indigo-700 border border-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
    >
      {label}
    </button>
  )
}
