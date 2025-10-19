// Utilities to persist and retrieve saved courses, players, and holes via localStorage
// Storage key versioned for future migrations

import type { SavedCourses, SavedCourseData, SavedPlayer, SavedHole } from '../types/saved'

const STORAGE_KEY = 'savedCourses.v1'

export function loadSavedCourses(): SavedCourses {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as SavedCourses
  } catch {}
  return {}
}

export function persistSavedCourses(db: SavedCourses): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {}
}

function ensureCourse(db: SavedCourses, courseName: string): SavedCourseData {
  if (!db[courseName]) db[courseName] = { Players: [], Holes: [] }
  return db[courseName]
}

export function upsertPlayers(courseName: string, players: SavedPlayer[]): void {
  const db = loadSavedCourses()
  const course = ensureCourse(db, courseName)
  // merge-dedupe by firstName+lastName (case-insensitive) and keep the most recent tee/HI
  const key = (p: SavedPlayer) => `${(p.firstName||'').trim().toLowerCase()}|${(p.lastName||'').trim().toLowerCase()}`
  const map = new Map<string, SavedPlayer>()
  for (const p of course.Players) map.set(key(p), p)
  for (const p of players) map.set(key(p), p)
  course.Players = Array.from(map.values()).sort((a, b) => {
    const ln = (a.lastName||'').localeCompare(b.lastName||'')
    if (ln !== 0) return ln
    return a.firstName.localeCompare(b.firstName)
  })
  persistSavedCourses(db)
}

export function searchPlayers(courseName: string, query: string): SavedPlayer[] {
  const db = loadSavedCourses()
  const course = db[courseName]
  if (!course || !query.trim()) return []
  const q = query.trim().toLowerCase()
  return course.Players.filter(p => `${p.firstName} ${p.lastName||''}`.toLowerCase().includes(q)).slice(0, 10)
}

export function upsertHoles(courseName: string, holes: SavedHole[]): void {
  const db = loadSavedCourses()
  const course = ensureCourse(db, courseName)
  // replace holes by number (1..18 typically)
  const byNo = new Map<number, SavedHole>()
  for (const h of course.Holes) byNo.set(h.number, h)
  for (const h of holes) byNo.set(h.number, h)
  course.Holes = Array.from(byNo.values()).sort((a, b) => a.number - b.number)
  persistSavedCourses(db)
}

export function exportSavedCourses(): string {
  return JSON.stringify(loadSavedCourses(), null, 2)
}

export function importSavedCourses(json: string): void {
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { return }
  if (parsed && typeof parsed === 'object') {
    persistSavedCourses(parsed as SavedCourses)
  }
}
