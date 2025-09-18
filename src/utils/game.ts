import type { Course, Player } from '../types/golf'
import { courseHandicapFor } from './handicap'

export interface GameSettings {
  entryFeePerPlayer: number // for prize pool
  // Future: scoringType, strokesAllowance, etc.
  skinsPoolPerPlayer?: number // optional skins side pot
  randomSeed?: number // optional seed to vary balanced team generation
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
  // Handle very small groups directly
  if (total <= 4) return [total]

  // We never want teams larger than 4. Prefer as many 4s as possible, then 3s.
  // Compute the minimum number of teams needed so that no team exceeds 4.
  const numTeams = Math.ceil(total / 4)

  // Start everyone at size 3 to avoid creating 5s when distributing extras.
  // We will then add 1 to the first `extras` teams to make them 4.
  const sizes = new Array<number>(numTeams).fill(3)
  const extras = total - numTeams * 3 // number of teams that should have 4 instead of 3
  for (let i = 0; i < extras; i++) {
    sizes[i] = 4
  }

  // At this point, sizes are a mix of 4s and 3s (and never > 4).
  // Edge case: if total == numTeams*3, all 3s; if total == numTeams*4, all 4s.
  return sizes
}

function snakeDistribute(players: PlayerWithCH[], teamSizes: number[], seed?: number): Team[] {
  // Create empty teams
  const teams: Team[] = teamSizes.map((_, idx) => ({ id: idx + 1, players: [], teamHandicap: 0 }))
  // Sort by talent ascending (best first)
  const sorted = sortPlayersByTalent(players)

  // To introduce variability while keeping balance, shuffle within equal-CH buckets
  if (typeof seed === 'number') {
    const rand = rng(seed)
    // 1) Shuffle strictly equal CH buckets for stability with duplicates
    let i = 0
    while (i < sorted.length) {
      const ch = sorted[i].courseHandicap
      let j = i + 1
      while (j < sorted.length && sorted[j].courseHandicap === ch) j++
      const slice = sorted.slice(i, j)
      shuffleInPlace(slice, rand)
      for (let k = i; k < j; k++) sorted[k] = slice[k - i]
      i = j
    }

    // 2) Apply a gentle local perturbation within small forward windows
    // This preserves overall balance but adds variance between runs.
    const window = 3 // max lookahead positions to swap within
    for (let a = 0; a < sorted.length - 1; a++) {
      const maxJ = Math.min(sorted.length - 1, a + window)
      const b = a + Math.floor(rand() * (maxJ - a + 1))
      if (b !== a) {
        const tmp = sorted[a]
        sorted[a] = sorted[b]
        sorted[b] = tmp
      }
    }
  }

  // Snake draft assignment across teams to balance skill
  // Randomize initial direction a bit for added variance when a seed is provided
  let forward = typeof seed === 'number' ? rng(seed)() < 0.5 : true
  let teamIndex = 0
  for (const p of sorted) {
    // find next team that still needs players
    while (teams[teamIndex].players.length >= teamSizes[teamIndex]) {
      if (forward) {
        teamIndex++
        if (teamIndex >= teams.length) {
          teamIndex = teams.length - 1
          forward = false
        }
      } else {
        teamIndex--
        if (teamIndex < 0) {
          teamIndex = 0
          forward = true
        }
      }
    }

    teams[teamIndex].players.push(p)
    // advance index for next assignment
    if (forward) {
      teamIndex++
      if (teamIndex >= teams.length) {
        teamIndex = teams.length - 1
        forward = false
      }
    } else {
      teamIndex--
      if (teamIndex < 0) {
        teamIndex = 0
        forward = true
      }
    }
  }

  // compute teamHandicap as sum of CHs
  for (const t of teams) {
    t.teamHandicap = t.players.reduce((sum, p) => sum + p.courseHandicap, 0)
  }

  return teams
}

function payoutSchedule(numTeams: number): number[] {
  // Limit payouts to top 3 teams max and normalize to 100%
  if (numTeams <= 1) return [1.0]
  if (numTeams === 2) return [0.6, 0.4]
  // For 3 or more teams, pay top 3: 50/30/20
  return [0.5, 0.3, 0.2]
}

export function generateGame(course: Course, players: Player[], settings: GameSettings): GameResult {
  const enriched = players.map((p) => computePlayerCH(course, p))
  const teamSizes = determineTeamSizes(enriched.length)
  const teams = snakeDistribute(enriched, teamSizes, settings.randomSeed)
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
  const schedule = payoutSchedule(sortedTeams.length)
  const payouts = schedule.map((pct, i) => ({ place: i + 1, amount: Math.round(prizePool * pct) }))

  return {
    course,
    teams: sortedTeams,
    totalPlayers: enriched.length,
    prizePool,
    skinsPool,
    payouts,
  }
}
