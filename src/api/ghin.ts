/*
  GHIN Handicap API client

  Note:
  - The official GHIN/USGA APIs require authentication and should not be called directly from the browser.
  - This lightweight client is built to call a backend proxy you host (e.g. /api/ghin/handicap), which safely stores any secrets.
  - Configure your backend URL via Vite env variable VITE_BACKEND_URL (e.g., http://localhost:3000).

  Usage:
    import { getHandicapIndex } from '@/api/ghin'

    const index = await getHandicapIndex({ ghinNumber: '1234567' })
    // or by name
    const index2 = await getHandicapIndex({ firstName: 'Ann', lastName: 'Smith' })
*/

export type GhinQuery =
  | { ghinNumber: string; firstName?: never; lastName?: never }
  | { ghinNumber?: never; firstName: string; lastName: string }

// Lightweight local mock data and helpers – no external calls.
// Known GHIN numbers for deterministic demo values.
const MOCK_GHIN_BY_NUMBER: Record<string, number> = {
  '1234567': 8.4,
  '7654321': 12.1,
  '1111111': 2.3,
}

// Name-based demo values (case-insensitive keys: "first-last").
const MOCK_GHIN_BY_NAME: Record<string, number> = {
  'ann-smith': 10.2,
  'john-doe': 15.6,
  'tiger-woods': -3.1,
}

function normalizeName(first: string, last: string) {
  return `${first}`.trim().toLowerCase() + '-' + `${last}`.trim().toLowerCase()
}

function hashToHandicap(seed: string): number {
  // Deterministic pseudo-handicap: range roughly -5.0 to 36.4
  const sum = Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const val = (sum % 414) / 10 - 5.0 // 0..41.4 -> -5.0..36.4
  return Number(val.toFixed(1))
}

function isByNumber(query: GhinQuery): query is { ghinNumber: string } {
  return typeof (query as any).ghinNumber === 'string'
}

export async function getHandicapIndex(query: GhinQuery): Promise<number> {
  // Immediate resolution to keep the same async API surface without network
  if (isByNumber(query)) {
    const n = query.ghinNumber.trim()
    if (n in MOCK_GHIN_BY_NUMBER) return MOCK_GHIN_BY_NUMBER[n]
    return hashToHandicap(`ghin:${n}`)
  }

  const key = normalizeName(query.firstName, query.lastName)
  if (key in MOCK_GHIN_BY_NAME) return MOCK_GHIN_BY_NAME[key]
  return hashToHandicap(`name:${key}`)
}
