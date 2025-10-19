import type { Course, Player } from '../types/golf'
import { courseHandicapFor } from './handicap'

export interface GameSettings {
  entryFeePerPlayer: number // for prize pool
  // Future: scoringType, strokesAllowance, etc.
  skinsPoolPerPlayer?: number // optional skins side pot
  randomSeed?: number // optional seed to vary balanced team generation
  randomizeTeams?: boolean // when true, assign groups randomly instead of balanced
  paidPlaces?: number // number of finishing places paid out (default 3)
}

export interface PlayerWithCH extends Player {
  courseHandicap: number
}

export interface Team {
  id: number
  players: PlayerWithCH[]
  // A simple team handicap metric; can be adjusted per game type later
  teamHandicap: number // sum of CHs
}

export interface GameResult {
  course: Course
  teams: Team[]
  totalPlayers: number
  prizePool: number
  skinsPool: number
  payouts: { place: number; amount: number }[]
}

export function computePlayerCH(course: Course, p: Player): PlayerWithCH {
  return { ...p, courseHandicap: courseHandicapFor(course, p.handicapIndex, p.tee) }
}

function sortPlayersByTalent(players: PlayerWithCH[]): PlayerWithCH[] {
  // Lower course handicap == better player
  return [...players].sort((a, b) => a.courseHandicap - b.courseHandicap)
}

// Simple seeded PRNG (mulberry32)
function rng(seed: number) {
  let t = seed >>> 0
  return function () {
    t += 0x6D2B79F5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleInPlace<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

function determineTeamSizes(total: number): number[] {
  // No team > 4. Prefer 4s, then 3s. Use 2 only when necessary. Never create 5s.
  if (total <= 4) return [total]

  const sizes: number[] = []
  let n4 = Math.floor(total / 4)
  let rem = total - n4 * 4

  if (rem === 0) {
    for (let i = 0; i < n4; i++) sizes.push(4)
    return sizes
  }

  if (rem === 1) {
    if (n4 >= 2) {
      // Example: total=9 -> 4+4+1 => 3+3+3
      for (let i = 0; i < n4 - 2; i++) sizes.push(4)
      sizes.push(3, 3, 3)
      return sizes
    } else {
      // Example: total=5 -> 3+2
      sizes.push(3, 2)
      return sizes
    }
  }

  if (rem === 2) {
    if (n4 >= 1) {
      // Prefer to avoid a lone group of 2: convert one 4 and the 2 into two 3s
      for (let i = 0; i < n4 - 1; i++) sizes.push(4)
      sizes.push(3, 3)
      return sizes
    } else {
      // No 4s to borrow from (e.g., total=2); must use a 2
      sizes.push(2)
      return sizes
    }
  }

  // rem === 3
  for (let i = 0; i < n4; i++) sizes.push(4)
  sizes.push(3)
  return sizes
}

function basePayoutRatios(places: number, numTeams: number): number[] {
  // Cap places to number of teams and minimum 1
  const n = Math.max(1, Math.min(places, numTeams))
  // Common schedules for up to 5; beyond that, taper with a gentle geometric falloff
  switch (n) {
    case 1: return [1]
    case 2: return [0.6, 0.4]
    case 3: return [0.5, 0.3, 0.2]
    case 4: return [0.4, 0.3, 0.2, 0.1]
    case 5: return [0.35, 0.25, 0.18, 0.12, 0.10]
    default: {
      const ratios: number[] = []
      let remaining = 1
      let share = 0.35
      for (let i = 0; i < n; i++) {
        const v = i === n - 1 ? remaining : Math.max(0.05, share)
        ratios.push(v)
        remaining -= v
        share *= 0.7
      }
      // Normalize to sum 1
      const sum = ratios.reduce((a, b) => a + b, 0)
      return ratios.map(r => r / sum)
    }
  }
}

function roundPayoutsPrefer10Then5(values: number[], total: number): number[] {
  // Try rounding to nearest 10 first, then fallback to 5 if necessary
  const tryRound = (step: number) => {
    const rounded = values.map(v => Math.max(0, Math.round(v / step) * step))
    let diff = total - rounded.reduce((a, b) => a + b, 0)
    // Adjust by distributing +/- step starting from top places
    // To keep descending order, always adjust earlier places first and ensure non-negative
    const dir = Math.sign(diff)
    diff = Math.abs(diff)
    while (diff >= step) {
      let adjusted = false
      for (let i = 0; i < rounded.length && diff >= step; i++) {
        const next = rounded[i] + dir * step
        if (dir > 0 || (dir < 0 && next >= 0)) {
          rounded[i] = next
          diff -= step
          adjusted = true
        }
      }
      if (!adjusted) break
    }
    // Enforce non-increasing order (fix rare edge cases after adjustments)
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i] > rounded[i - 1]) rounded[i] = rounded[i - 1]
    }
    return { rounded, sum: rounded.reduce((a, b) => a + b, 0) }
  }

  const v10 = tryRound(10)
  if (v10.sum === total) return v10.rounded
  const v5 = tryRound(5)
  // If neither matches exactly, choose the closer and adjust last place by remainder safely
  if (v5.sum !== total) {
    const rounded = v5.rounded.slice()
    let diff = total - v5.sum
    if (rounded.length > 0) rounded[0] += diff // adjust top prize to close the gap
    // keep non-increasing
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i] > rounded[i - 1]) rounded[i] = rounded[i - 1]
    }
    return rounded
  }
  return v5.rounded
}

export function generateGame(course: Course, players: Player[], settings: GameSettings): GameResult {
  const enriched = players.map((p) => computePlayerCH(course, p))
  const teamSizes = determineTeamSizes(enriched.length)

  // Group players by linkGroupId; undefined are singleton groups
  type Group = { id: string; members: PlayerWithCH[]; size: number; strength: number }
  const groupsMap = new Map<string, Group>()
  const singletonPrefix = 'single:'
  for (const p of enriched) {
    const gid = p.linkGroupId ?? `${singletonPrefix}${p.id}`
    let g = groupsMap.get(gid)
    if (!g) {
      g = { id: gid, members: [], size: 0, strength: 0 }
      groupsMap.set(gid, g)
    }
    g.members.push(p)
  }
  const groups: Group[] = []
  for (const g of groupsMap.values()) {
    g.size = g.members.length
    // Enforce max group size of 4
    if (g.size > 4) {
      // If a group exceeds 4, we still need a deterministic behavior; split into chunks of max 4
      // This should generally not happen due to UI constraints
      const chunked: PlayerWithCH[][] = []
      for (let i = 0; i < g.members.length; i += 4) chunked.push(g.members.slice(i, i + 4))
      chunked.forEach((chunk, idx) => {
        groups.push({
          id: `${g.id}#${idx + 1}`,
          members: chunk,
          size: chunk.length,
          strength: chunk.reduce((s, m) => s + m.courseHandicap, 0) / chunk.length, // avg CH
        })
      })
      continue
    }
    // Use average course handicap as strength for balancing (lower = stronger)
    g.strength = g.members.reduce((s, m) => s + m.courseHandicap, 0) / Math.max(1, g.members.length)
    groups.push(g)
  }

  // Prepare groups ordering
  let sortedGroups: Group[]
  if (settings.randomizeTeams) {
    // Random order, but place larger groups slightly earlier to reduce fit failures
    sortedGroups = groups.slice()
    const rand = typeof settings.randomSeed === 'number' ? rng(settings.randomSeed) : Math.random
    // Shuffle
    for (let i = sortedGroups.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[sortedGroups[i], sortedGroups[j]] = [sortedGroups[j], sortedGroups[i]]
    }
    // Stable sort tweak: move larger groups forward a bit
    sortedGroups.sort((a, b) => b.size - a.size || a.id.localeCompare(b.id))
  } else {
    // Balanced order: size desc, then strength asc
    sortedGroups = groups.slice().sort((a, b) => {
      if (a.size !== b.size) return b.size - a.size
      if (a.strength !== b.strength) return a.strength - b.strength
      return a.id.localeCompare(b.id)
    })
  }

  // Initialize empty teams with capacity tracking
  const teamsInit: Team[] = teamSizes.map((_, idx) => ({ id: idx + 1, players: [], teamHandicap: 0 }))
  const remaining: number[] = teamSizes.slice()

  // Assign groups while strictly respecting capacities (no team > 4)
  if (settings.randomizeTeams) {
    const rand = typeof settings.randomSeed === 'number' ? rng(settings.randomSeed) : Math.random
    for (const g of sortedGroups) {
      // Try random team indexes until one fits (bounded attempts)
      const order = teamsInit.map((_, i) => i)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
      let placed = false
      for (const idx of order) {
        if (remaining[idx] >= g.size) {
          teamsInit[idx].players.push(...g.members)
          remaining[idx] -= g.size
          placed = true
          break
        }
      }
      if (!placed) {
        // As a fallback, scan in order to find any fit
        for (let k = 0; k < teamsInit.length; k++) {
          if (remaining[k] >= g.size) {
            teamsInit[k].players.push(...g.members)
            remaining[k] -= g.size
            placed = true
            break
          }
        }
      }
      if (!placed) throw new Error(`Unable to place group of size ${g.size} within team capacities`)
    }
  } else {
    for (const g of sortedGroups) {
      // Find the team with the largest remaining capacity that can fit this group
      let bestIdx = -1
      let bestRemain = -1
      for (let k = 0; k < teamsInit.length; k++) {
        const rem = remaining[k]
        if (rem >= g.size && rem > bestRemain) {
          bestRemain = rem
          bestIdx = k
        }
      }
      if (bestIdx === -1) {
        // As a safety, try any team that can fit (shouldn't happen given sizes sum exactly)
        for (let k = 0; k < teamsInit.length; k++) {
          if (remaining[k] >= g.size) { bestIdx = k; break }
        }
      }
      if (bestIdx === -1) {
        // Final guard: do not overflow; if impossible, throw to surface issue
        throw new Error(`Unable to place group of size ${g.size} within team capacities`)
      }
      teamsInit[bestIdx].players.push(...g.members)
      remaining[bestIdx] -= g.size
    }
  }

  // compute teamHandicap as sum of CHs
  for (const t of teamsInit) {
    t.teamHandicap = t.players.reduce((sum, p) => sum + p.courseHandicap, 0)
  }

  const teams = teamsInit
  // Sort teams by size ascending; tie-break by team handicap ascending
  const sortedTeams = teams
    .slice()
    .sort((a, b) => {
      const sizeDiff = a.players.length - b.players.length
      if (sizeDiff !== 0) return sizeDiff
      return a.teamHandicap - b.teamHandicap
    })
    .map((t, idx) => ({ ...t, id: idx + 1 }))

  const prizePool = Math.max(0, Math.round(settings.entryFeePerPlayer * enriched.length))
  const skinsPool = Math.max(0, Math.round((settings.skinsPoolPerPlayer ?? 0) * enriched.length))
  const places = Math.max(1, settings.paidPlaces ?? 3)
  const ratios = basePayoutRatios(places, sortedTeams.length)
  const rawAmounts = ratios.map(r => r * prizePool)
  const finalAmounts = roundPayoutsPrefer10Then5(rawAmounts, prizePool)
  const payouts = finalAmounts.map((amt, i) => ({ place: i + 1, amount: amt }))

  return {
    course,
    teams: sortedTeams,
    totalPlayers: enriched.length,
    prizePool,
    skinsPool,
    payouts,
  }
}
