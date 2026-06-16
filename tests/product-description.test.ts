import { describe, it, expect } from 'vitest'
import { getMeaningfulDescription } from '@/lib/product-media'

describe('getMeaningfulDescription', () => {
  it('returns null for empty/missing description', () => {
    expect(getMeaningfulDescription('Sac Cuir', null)).toBeNull()
    expect(getMeaningfulDescription('Sac Cuir', undefined)).toBeNull()
    expect(getMeaningfulDescription('Sac Cuir', '   ')).toBeNull()
  })

  it('hides description identical to the name (ignoring case/punctuation)', () => {
    expect(getMeaningfulDescription('Sac Cuir Artisan Cabas', 'Sac Cuir Artisan Cabas')).toBeNull()
    expect(getMeaningfulDescription('Sac Cuir', 'sac cuir')).toBeNull()
    expect(getMeaningfulDescription('Sac Cuir', 'Sac  Cuir!')).toBeNull()
  })

  it('hides description that is a prefix of the name (or vice versa)', () => {
    expect(getMeaningfulDescription('Sac Cuir Artisan Cabas', 'Sac Cuir Artisan')).toBeNull()
    expect(getMeaningfulDescription('Sac Cuir', 'Sac Cuir Artisan Cabas')).toBeNull()
  })

  it('keeps a genuinely different description', () => {
    expect(
      getMeaningfulDescription('Sac Cuir Artisan Cabas', 'Cuir pleine fleur, fabriqué à Fès, doublure coton.')
    ).toBe('Cuir pleine fleur, fabriqué à Fès, doublure coton.')
  })

  it('trims the returned description', () => {
    expect(getMeaningfulDescription('Sac', '  Magnifique sac en cuir véritable.  ')).toBe(
      'Magnifique sac en cuir véritable.'
    )
  })
})
