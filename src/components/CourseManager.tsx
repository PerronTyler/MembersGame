import React, { useEffect, useMemo, useState } from 'react'
import { upsertPlayers, searchPlayers } from '../utils/savedCourses'
// Temporarily commented out export/import functionality
// import { exportSavedCourses, importSavedCourses } from '../utils/savedCourses'
import type { Course, Player, Tee, CourseSlopesByTee } from '../types/golf'
import './CourseManager.scss'
import { generateGame, type GameResult } from '../utils/game'
// import Scorecards from './Scorecards'

type CourseForm = {
  name: string
  par: number
  slopes: CourseSlopesByTee
}

type PlayerForm = {
  id: string
  firstName: string
  lastName?: string
  handicapIndex: string // keep as string for input, convert to number on submit
  tee: Tee
  linkGroupId?: string
}

const defaultSlopes: CourseSlopesByTee = { white: 120, blue: 122, red: 121 }

export default function CourseManager() {
  const [course, setCourse] = useState<Course | null>(null)
  const [game, setGame] = useState<GameResult | null>(null)
  const [seed, setSeed] = useState<number>(Date.now() & 0xffffffff)
  const [randomizeTeams, setRandomizeTeams] = useState<boolean>(false)
  const [paidPlaces, setPaidPlaces] = useState<number>(3)
  const [courseForm, setCourseForm] = useState<CourseForm>({
    name: 'Sandwich Hollows',
    par: 71,
    slopes: { ...defaultSlopes },
  })

  const [playerForm, setPlayerForm] = useState<PlayerForm>({
    id: crypto.randomUUID(),
    firstName: '',
    lastName: '',
    handicapIndex: '',
    tee: 'white',
    linkGroupId: undefined
  })

  // Saved players search for reuse
  const [reuseQuery, setReuseQuery] = useState('')
  const [reuseResults, setReuseResults] = useState<{ firstName: string; lastName?: string; handicapIndex: number; tee: Tee }[]>([])

  useEffect(() => {
    const name = course?.name || courseForm.name
    if (!name || reuseQuery.trim().length < 2) {
      setReuseResults([])
      return
    }
    const res = searchPlayers(name, reuseQuery)
    setReuseResults(res)
  }, [reuseQuery, course, courseForm.name])

  // Utility to make simple unique ids for players and groups
  function makeId(prefix: string = 'id'): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`
  }

  // Inline edit state for existing players
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingForm, setEditingForm] = useState<PlayerForm | null>(null)
  const [menuPlayerIndex, setMenuPlayerIndex] = useState<number | null>(null)
  const [menuAbove, setMenuAbove] = useState<boolean>(false)
  const [draggedPlayer, setDraggedPlayer] = useState<{ teamId: number; playerIndex: number } | null>(null)

  // Selection state for linking/unlinking players
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())

  function toggleSelectPlayer(id: string) {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedPlayerIds(new Set())
    setPlayerForm({
      id: crypto.randomUUID(),
      firstName: '',
      lastName: '',
      handicapIndex: '',
      tee: 'white',
      linkGroupId: undefined
    })
  }

  // (Removed earlier naive link/unlink versions; see robust versions further below.)

  const canCreateCourse = useMemo(() => {
    return (
      courseForm.name.trim().length > 0 &&
      Number.isFinite(courseForm.par) &&
      courseForm.par > 0 &&
      Object.values(courseForm.slopes).every((r) => Number.isFinite(r))
    )
  }, [courseForm])

  function handleCourseChange<K extends keyof CourseForm>(key: K, value: CourseForm[K]) {
    setCourseForm((prev) => ({ ...prev, [key]: value }))
  }

  function startEditPlayer(index: number) {
    if (!course) return
    const p = course.players[index]
    setEditingIndex(index)
    setEditingForm({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName ?? '',
      handicapIndex: String(p.handicapIndex.toFixed(1)),
      tee: p.tee,
      linkGroupId: p.linkGroupId
    })
  }

  function cancelEditPlayer() {
    setEditingIndex(null)
    setEditingForm(null)
  }

  function saveEditPlayer(e: React.FormEvent) {
    e.preventDefault()
    if (editingIndex === null || !editingForm || !course) return
    const hi = Number(editingForm.handicapIndex)
    if (!Number.isFinite(hi) || editingForm.firstName.trim().length === 0) return
    const updated = [...course.players]
    const existing = course.players[editingIndex]
    updated[editingIndex] = {
      id: existing.id,
      firstName: editingForm.firstName.trim(),
      lastName: editingForm.lastName?.trim() || undefined,
      handicapIndex: Number(hi.toFixed(1)),
      tee: editingForm.tee,
      linkGroupId: existing.linkGroupId,
    }
    setCourse({ ...course, players: updated })
    setGame(null)
    setEditingIndex(null)
    setEditingForm(null)
  }

  function deletePlayer(index: number) {
    if (!course) return
    const updated = course.players.slice(0, index).concat(course.players.slice(index + 1))
    setCourse({ ...course, players: updated })
    setGame(null)
    if (editingIndex === index) {
      setEditingIndex(null)
      setEditingForm(null)
    }
    if (menuPlayerIndex === index) setMenuPlayerIndex(null)
    // Also clear selection for safety
    clearSelection()
  }

  // Drag and drop handlers for team reorganization
  function handleDragStart(e: React.DragEvent, teamId: number, playerIndex: number) {
    setDraggedPlayer({ teamId, playerIndex })
    e.dataTransfer.effectAllowed = 'move'
    // Add visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.setAttribute('data-dragging', 'true')
    }
  }

  function handleDragEnd(e: React.DragEvent) {
    setDraggedPlayer(null)
    // Reset visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.removeAttribute('data-dragging')
    }
    // Remove drag-over state from all team containers
    document.querySelectorAll('.team-container').forEach(el => {
      el.removeAttribute('data-drag-over')
    })
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    // Add visual feedback to drop target
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.setAttribute('data-drag-over', 'true')
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    // Remove visual feedback when leaving drop target
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.removeAttribute('data-drag-over')
    }
  }

  function handleDrop(e: React.DragEvent, targetTeamId: number) {
    e.preventDefault()
    if (!draggedPlayer || !game) return
    
    const { teamId: sourceTeamId, playerIndex } = draggedPlayer
    if (sourceTeamId === targetTeamId) return // Same team, no change needed
    
    // Create updated teams
    const updatedTeams = game.teams.map(team => ({ ...team, players: [...team.players] }))
    const sourceTeam = updatedTeams.find(t => t.id === sourceTeamId)
    const targetTeam = updatedTeams.find(t => t.id === targetTeamId)
    
    if (!sourceTeam || !targetTeam) return
    
    // Move player from source to target team
    const [movedPlayer] = sourceTeam.players.splice(playerIndex, 1)
    targetTeam.players.push(movedPlayer)
    
    // Recalculate team handicaps
    updatedTeams.forEach(team => {
      team.teamHandicap = team.players.reduce((sum, p) => sum + p.courseHandicap, 0)
    })
    
    // Update game state
    setGame({ ...game, teams: updatedTeams })
    setDraggedPlayer(null)
    
    // Clean up visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.removeAttribute('data-drag-over')
    }
  }

  function handleSlopeChange(tee: keyof CourseSlopesByTee, value: number) {
    setCourseForm((prev) => ({ ...prev, slopes: { ...prev.slopes, [tee]: value } }))
  }

  function createCourse(e: React.FormEvent) {
    e.preventDefault()
    if (!canCreateCourse) return
    const newCourse: Course = {
      name: courseForm.name.trim(),
      par: courseForm.par,
      slopes: { ...courseForm.slopes },
      players: [],
    }
    /* Holes persistence commented out for now
    try {
      upsertHoles(newCourse.name, holesForm.map(h => ({
        number: h.number,
        par: Number(h.par) || 4,
        strokeIndex: h.strokeIndex ? Number(h.strokeIndex) : undefined,
        yardage: h.yardage,
      })))
    } catch {}
    */
    setCourse(newCourse)
  }

  const canAddPlayer = useMemo(() => {
    const hi = Number(playerForm.handicapIndex)
    return playerForm.firstName.trim().length > 0 && Number.isFinite(hi)
  }, [playerForm])

  function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    if (!course || !canAddPlayer) return
    
    const newPlayer: Player = {
      id: playerForm.id,
      firstName: playerForm.firstName.trim(),
      lastName: playerForm.lastName?.trim(),
      handicapIndex: parseFloat(playerForm.handicapIndex) || 0,
      tee: playerForm.tee,
      linkGroupId: playerForm.linkGroupId
    }
    
    setCourse({ ...course, players: [...course.players, newPlayer] })
    setGame(null)
    
    // Reset form with new ID for next player
    setPlayerForm({
      id: crypto.randomUUID(),
      firstName: '',
      lastName: '',
      handicapIndex: '',
      tee: 'white',
      linkGroupId: undefined
    })
    
    clearSelection()
  }

  // TEMP: Add random test players for quick testing
  function addTestPlayers() {
    if (!course) return
    const firstNames = ['Alex', 'Jordan', 'Taylor', 'Casey', 'Drew', 'Riley', 'Morgan', 'Sam', 'Avery', 'Quinn']
    const lastNames = ['Smith', 'Johnson', 'Lee', 'Brown', 'Garcia', 'Martinez', 'Davis', 'Miller', 'Wilson', 'Moore']
    const tees: Tee[] = ['white', 'blue', 'red']

    const count = 3 + Math.floor(Math.random() * 6) // 3..8
    const players: Player[] = Array.from({ length: count }, () => {
      const fn = firstNames[Math.floor(Math.random() * firstNames.length)]
      const ln = lastNames[Math.floor(Math.random() * lastNames.length)]
      const includeLast = Math.random() > 0.2
      const tee = tees[Math.floor(Math.random() * tees.length)]
      // Handicap Index in range ~ -2.0 to 26.0, rounded to 1 decimal
      const hiRaw = -2 + Math.random() * 28
      const hi = Number(hiRaw.toFixed(1))
      return {
        id: makeId('pl'),
        firstName: fn,
        lastName: includeLast ? ln : undefined,
        handicapIndex: hi,
        tee,
      }
    })

    setCourse({ ...course, players: [...course.players, ...players] })
    setGame(null)
    clearSelection()
  }

  function courseHandicap(hi: number, tee: Tee): number {
    if (!course) return Math.round(hi)
    const slope = course.slopes[tee] || 0
    const ch = (hi * slope) / 113
    return Math.round(ch)
  }

  // --- Game generation ---
  const [entryFee, setEntryFee] = useState<string>('20')
  const [skinsFee, setSkinsFee] = useState<string>('5')
  const canGenerateGame = useMemo(() => {
    const fee = Number(entryFee)
    const skins = Number(skinsFee)
    return (
      !!course &&
      course.players.length >= 2 &&
      Number.isFinite(fee) && fee >= 0 &&
      Number.isFinite(skins) && skins >= 0
    )
  }, [course, entryFee, skinsFee])

  // Linking helpers and constraints
  function linkSelectedPlayers() {
    if (!course) return
    const selected = course.players.filter((p) => selectedPlayerIds.has(p.id))
    if (selected.length < 2 || selected.length > 4) return

    // Determine existing group ids among selected
    const distinctGroups = Array.from(new Set(selected.map((p) => p.linkGroupId).filter(Boolean))) as string[]
    // If multiple different existing groups present, do not allow merge
    if (distinctGroups.length > 1) return

    // Determine target group id
    const existingGroupId = distinctGroups[0]
    // Compute total size if merging into existing group
    if (existingGroupId) {
      const existingMembersCount = course.players.filter((p) => p.linkGroupId === existingGroupId).length
      const toAddCount = selected.filter((p) => !p.linkGroupId).length
      if (existingMembersCount + toAddCount > 4) return
    }

    const groupId = existingGroupId ?? makeId('grp')
    const updated = course.players.map((p) =>
      selectedPlayerIds.has(p.id) ? { ...p, linkGroupId: groupId } : p
    )
    setCourse({ ...course, players: updated })
    clearSelection()
  }

  function unlinkSelectedPlayers() {
    if (!course) return
    const anySelected = course.players.some((p) => selectedPlayerIds.has(p.id))
    if (!anySelected) return
    const updated = course.players.map((p) => (selectedPlayerIds.has(p.id) ? { ...p, linkGroupId: undefined } : p))
    setCourse({ ...course, players: updated })
    clearSelection()
  }

  function onGenerateGame(e: React.FormEvent) {
    e.preventDefault()
    if (!course) return
    const fee = Number(entryFee)
    const skins = Number(skinsFee)
    // Persist players used for this course for future reuse
    try {
      upsertPlayers(course.name, course.players.map(p => ({
        firstName: p.firstName,
        lastName: p.lastName,
        handicapIndex: p.handicapIndex,
        tee: p.tee,
      })))
    } catch {}
    const result = generateGame(course, course.players, { entryFeePerPlayer: fee, skinsPoolPerPlayer: skins, randomSeed: seed, randomizeTeams, paidPlaces })
    setGame(result)
  }

  function onRegenerate() {
    if (!course) return
    const fee = Number(entryFee)
    const skins = Number(skinsFee)
    const nextSeed = (seed + 1) >>> 0
    setSeed(nextSeed)
    const result = generateGame(course, course.players, { entryFeePerPlayer: fee, skinsPoolPerPlayer: skins, randomSeed: nextSeed, randomizeTeams, paidPlaces })
    setGame(result)
  }

  function onClearGame() {
    setGame(null)
  }

  return (
    <div className="course-manager">
      <h1>🏌️ Members Game</h1>
      {course && (
        <div className="course-header">
          <div className="title">{course.name}</div>
          <div className="meta"><strong>Par:</strong> {course.par}</div>
          <div className="slopes-row">
            <span className="chip white">White {course.slopes.white || '-'}</span>
            <span className="chip blue">Blue {course.slopes.blue || '-'}</span>
            <span className="chip red">Red {course.slopes.red || '-'}</span>
          </div>
          {/* Generate Game controls (no inputs here now) */}
          <div className="actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginLeft: 'auto' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }} title="When enabled, teams are generated completely at random (linked players still stay together)">
              <input
                type="checkbox"
                checked={randomizeTeams}
                onChange={(e) => setRandomizeTeams(e.target.checked)}
              />
              <span>Random Teams</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} title="Number of finishing places to pay out (default 3)">
              <span>Paid Places</span>
              <input
                type="number"
                min={1}
                step={1}
                value={paidPlaces}
                onChange={(e) => setPaidPlaces(Math.max(1, Number(e.target.value)))}
                style={{ width: '70px' }}
              />
            </label>
            {/* Temporarily commented out export/import buttons
            <button type="button" onClick={() => {
              const json = exportSavedCourses()
              // Offer file download using a temporary blob
              const blob = new Blob([json], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'savedCourses.json'
              a.click()
              URL.revokeObjectURL(url)
            }}>Export Saved</button>
            <label className="icon-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
              <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const rd = new FileReader()
                rd.onload = () => {
                  if (typeof rd.result === 'string') importSavedCourses(rd.result)
                }
                rd.readAsText(f)
                e.currentTarget.value = ''
              }} />
              <span>Import Saved</span>
            </label>
            */}
            {!game ? (
              <button onClick={onGenerateGame as any} disabled={!canGenerateGame}>Generate</button>
            ) : (
              <>
                <button onClick={onRegenerate}>Regenerate</button>
                <button onClick={onClearGame}>Clear</button>
              </>
            )}
          </div>
          {game && null}
        </div>
      )}
      {!course ? (
        <section className="panel create-course-panel">
          <h2>Create Course</h2>
          <form onSubmit={createCourse} className="form">
            <div className="grid">
              <label>
                <span>Course Name</span>
                <input
                  type="text"
                  value={courseForm.name}
                  onChange={(e) => handleCourseChange('name', e.target.value)}
                  placeholder="e.g., Pebble Beach"
                  required
                />
              </label>
              <label>
                <span>Par</span>
                <input
                  type="number"
                  value={courseForm.par}
                  onChange={(e) => handleCourseChange('par', Math.max(1, Number(e.target.value)))}
                  min={1}
                />
              </label>
              <label>
                <span>Entry Fee per Player</span>
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={entryFee}
                  onChange={(e) => setEntryFee(e.target.value)}
                />
              </label>
              <label>
                <span>Skins Fee per Player (optional)</span>
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={skinsFee}
                  onChange={(e) => setSkinsFee(e.target.value)}
                />
              </label>
            </div>

            <fieldset className="slopes">
              <legend>Slope Rating by Tee</legend>
              <div className="grid">
                <label>
                  <span>White Tees</span>
                  <input
                    type="number"
                    step="1"
                    value={courseForm.slopes.white}
                    onChange={(e) => handleSlopeChange('white', Number(e.target.value))}
                    placeholder="e.g., 125"
                    min={55}
                    max={155}
                  />
                </label>
                <label>
                  <span>Blue Tees</span>
                  <input
                    type="number"
                    step="1"
                    value={courseForm.slopes.blue}
                    onChange={(e) => handleSlopeChange('blue', Number(e.target.value))}
                    placeholder="e.g., 130"
                    min={55}
                    max={155}
                  />
                </label>
                <label>
                  <span>Red Tees</span>
                  <input
                    type="number"
                    step="1"
                    value={courseForm.slopes.red}
                    onChange={(e) => handleSlopeChange('red', Number(e.target.value))}
                    placeholder="e.g., 120"
                    min={55}
                    max={155}
                  />
                </label>
              </div>
            </fieldset>

            <div className="actions">
              <button type="submit" disabled={!canCreateCourse}>
                Save Course
              </button>
            </div>
          </form>
        </section>
      ) : (
        <div className="grid-layout">

          {!game && editingIndex === null && (
            <section className="panel add-player-panel">
              <h2>Add Player</h2>
              <form onSubmit={addPlayer} className="form">
              {/* Temporarily commented out Search Saved Players
              <div className="grid" style={{ alignItems: 'center' }}>
                <label>
                  <span>Search Saved Players</span>
                  <input
                    type="text"
                    value={reuseQuery}
                    onChange={(e) => setReuseQuery(e.target.value)}
                  />
                </label>
                {reuseResults.length > 0 && (
                  <div style={{ alignSelf: 'end' }}>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '180px', overflowY: 'auto' }}>
                      {reuseResults.map((sp, i) => (
                        <li key={`${sp.firstName}-${sp.lastName}-${i}`}>
                          <button type="button" className="icon-btn" onClick={() => {
                            setPlayerForm({
                              id: crypto.randomUUID(),
                              firstName: sp.firstName,
                              lastName: sp.lastName ?? '',
                              handicapIndex: String(sp.handicapIndex),
                              tee: sp.tee,
                              linkGroupId: undefined
                            })
                          }}>Use {sp.firstName} {sp.lastName ?? ''} (HI {sp.handicapIndex.toFixed(1)}, {sp.tee})</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              */}
              <div className="grid">
                <label>
                  <span>First Name</span>
                  <input
                    type="text"
                    value={playerForm.firstName}
                    onChange={(e) => setPlayerForm((p) => ({ ...p, firstName: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Last Name</span>
                  <input
                    type="text"
                    value={playerForm.lastName}
                    onChange={(e) => setPlayerForm((p) => ({ ...p, lastName: e.target.value }))}
                  />
                </label>
              </div>
              <div className="grid">
                <label>
                  <span>Handicap Index</span>
                  <input
                    type="number"
                    step="0.1"
                    value={playerForm.handicapIndex}
                    onChange={(e) => setPlayerForm((p) => ({ ...p, handicapIndex: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Tee</span>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <label className="chip red" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={playerForm.tee === 'red'}
                        onChange={() => setPlayerForm((p) => ({ ...p, tee: 'red' }))}
                      />
                      <span>Red</span>
                    </label>
                    <label className="chip white" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={playerForm.tee === 'white'}
                        onChange={() => setPlayerForm((p) => ({ ...p, tee: 'white' }))}
                      />
                      <span>White</span>
                    </label>
                    <label className="chip blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={playerForm.tee === 'blue'}
                        onChange={() => setPlayerForm((p) => ({ ...p, tee: 'blue' }))}
                      />
                      <span>Blue</span>
                    </label>
                  </div>
                </label>
              </div>
              <div className="actions">
                <button type="submit" disabled={!canAddPlayer}>Add Player</button>
              </div>
              </form>
            </section>
          )}

          {!game && editingIndex !== null && editingForm && (
            <section className="panel add-player-panel">
              <h2>Edit Player</h2>
              <form onSubmit={saveEditPlayer} className="form">
              <div className="grid">
                <label>
                  <span>First Name</span>
                  <input
                    type="text"
                    value={editingForm.firstName}
                    onChange={(e) => setEditingForm({ ...editingForm, firstName: e.target.value })}
                    placeholder="e.g., Ann"
                    required
                  />
                </label>
                <label>
                  <span>Last Name (optional)</span>
                  <input
                    type="text"
                    value={editingForm.lastName}
                    onChange={(e) => setEditingForm({ ...editingForm, lastName: e.target.value })}
                    placeholder="e.g., Smith"
                  />
                </label>
              </div>
              <div className="grid">
                <label>
                  <span>Handicap Index</span>
                  <input
                    type="number"
                    step="0.1"
                    value={editingForm.handicapIndex}
                    onChange={(e) => setEditingForm({ ...editingForm, handicapIndex: e.target.value })}
                    placeholder="e.g., 10.4"
                    required
                  />
                </label>
                <label>
                  <span>Tee</span>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <label className="chip red" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editingForm.tee === 'red'}
                        onChange={() => setEditingForm({ ...editingForm, tee: 'red' })}
                      />
                      <span>Red</span>
                    </label>
                    <label className="chip white" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editingForm.tee === 'white'}
                        onChange={() => setEditingForm({ ...editingForm, tee: 'white' })}
                      />
                      <span>White</span>
                    </label>
                    <label className="chip blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={editingForm.tee === 'blue'}
                        onChange={() => setEditingForm({ ...editingForm, tee: 'blue' })}
                      />
                      <span>Blue</span>
                    </label>
                  </div>
                </label>
              </div>
              <div className="actions">
                <button type="submit">Save Changes</button>
                <button type="button" onClick={cancelEditPlayer}>Cancel</button>
              </div>
              </form>
            </section>
          )}

          {!game && (
            <section className="panel players-panel">
              <h2>Players ({course.players.length})</h2>
              <div className="actions" style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={addTestPlayers}>Add Test Players</button>
                <button
                  type="button"
                  onClick={linkSelectedPlayers}
                  disabled={(() => {
                    const selected = course.players.filter((p) => selectedPlayerIds.has(p.id))
                    if (selected.length < 2 || selected.length > 4) return true
                    const distinctGroups = Array.from(new Set(selected.map((p) => p.linkGroupId).filter(Boolean))) as string[]
                    if (distinctGroups.length > 1) return true
                    if (distinctGroups.length === 1) {
                      const gid = distinctGroups[0]
                      const existingMembersCount = course.players.filter((p) => p.linkGroupId === gid).length
                      const toAddCount = selected.filter((p) => !p.linkGroupId).length
                      if (existingMembersCount + toAddCount > 4) return true
                    }
                    return false
                  })()}
                >Link Selected (max 4)</button>
                <button
                  type="button"
                  onClick={unlinkSelectedPlayers}
                  disabled={course.players.filter((p) => selectedPlayerIds.has(p.id) && p.linkGroupId).length === 0}
                >Unlink Selected</button>
                <button type="button" onClick={clearSelection} disabled={selectedPlayerIds.size === 0}>Clear Selection</button>
              </div>
              {course.players.length === 0 ? (
                <p>No players added yet.</p>
              ) : (
                <ul className="players" onClick={() => setMenuPlayerIndex(null)}>
                  {(() => {
                    // Group players by linkGroupId (singletons for undefined)
                    const visited = new Set<string>()
                    const groups: { key: string; members: Player[] }[] = []
                    for (const p of course.players) {
                      if (visited.has(p.id)) continue
                      if (p.linkGroupId) {
                        const members = course.players.filter(x => x.linkGroupId === p.linkGroupId)
                        members.forEach(m => visited.add(m.id))
                        groups.push({ key: `grp:${p.linkGroupId}`, members })
                      } else {
                        visited.add(p.id)
                        groups.push({ key: `single:${p.id}`, members: [p] })
                      }
                    }
                    return groups.map((g) => (
                      <li key={g.key} className={g.members.length > 1 ? 'linked-group' : ''}>
                        {g.members.length === 1 ? (
                          (() => {
                            const pl = g.members[0]
                            const idx = course.players.indexOf(pl)
                            return (
                              <div
                                className={`player ${pl.tee}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const card = e.currentTarget as HTMLElement
                                  const rect = card.getBoundingClientRect()
                                  const viewportH = window.innerHeight || document.documentElement.clientHeight
                                  const estimatedMenuHeight = 88
                                  setMenuAbove(rect.bottom + estimatedMenuHeight > viewportH)
                                  setMenuPlayerIndex(menuPlayerIndex === idx ? null : idx)
                                }}
                                role="button"
                              >
                                <div className="name">{pl.firstName} {pl.lastName ?? ''}</div>
                                <div className="select" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedPlayerIds.has(pl.id)}
                                    onChange={() => toggleSelectPlayer(pl.id)}
                                    title="Select for linking"
                                  />
                                </div>
                                <div className="meta">
                                  <span className={`chip ${pl.tee}`}>{pl.tee.toUpperCase()}</span>
                                  <span className="hi">CH: {courseHandicap(pl.handicapIndex, pl.tee)} (HI {pl.handicapIndex.toFixed(1)})</span>
                                  {menuPlayerIndex === idx && (
                                    <div className={`card-menu${menuAbove ? ' above' : ''}`} onClick={(e) => e.stopPropagation()}>
                                      <button type="button" onClick={() => { setMenuPlayerIndex(null); startEditPlayer(idx) }}>Edit</button>
                                      <button type="button" onClick={() => { deletePlayer(idx) }}>Delete</button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })()
                        ) : (
                          <>
                            <div className="group-rail" aria-hidden="true" />
                            <div className="linked-stack" aria-label={`Linked group of ${g.members.length} players`}>
                              {g.members.map((pl) => {
                                const idx = course.players.indexOf(pl)
                                return (
                                  <div key={pl.id} className="linked-item">
                                    <div
                                      className={`player ${pl.tee}`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const card = e.currentTarget as HTMLElement
                                        const rect = card.getBoundingClientRect()
                                        const viewportH = window.innerHeight || document.documentElement.clientHeight
                                        const estimatedMenuHeight = 88
                                        setMenuAbove(rect.bottom + estimatedMenuHeight > viewportH)
                                        setMenuPlayerIndex(menuPlayerIndex === idx ? null : idx)
                                      }}
                                      role="button"
                                    >
                                      <div className="name">{pl.firstName} {pl.lastName ?? ''}</div>
                                      <div className="select" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="checkbox"
                                          onChange={() => toggleSelectPlayer(pl.id)}
                                          title="Select for linking"
                                        />
                                      </div>
                                      <div className="meta">
                                        <span className={`chip ${pl.tee}`}>{pl.tee.toUpperCase()}</span>
                                        <span className="hi">CH: {courseHandicap(pl.handicapIndex, pl.tee)} (HI {pl.handicapIndex.toFixed(1)})</span>
                                        {menuPlayerIndex === idx && (
                                          <div className={`card-menu${menuAbove ? ' above' : ''}`} onClick={(e) => e.stopPropagation()}>
                                            <button type="button" onClick={() => { setMenuPlayerIndex(null); startEditPlayer(idx) }}>Edit</button>
                                            <button type="button" onClick={() => { deletePlayer(idx) }}>Delete</button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </li>
                    ))
                  })()}
                </ul>
              )}
            </section>
          )}

          

            {game && (
              <>
                <section className="panel teams-panel">
                  <h2>Teams</h2>
                  <div className="game-summary">
                    <span className="chip">👥 Players {game.totalPlayers}</span>
                    <span className="chip">🧩 Teams {game.teams.length}</span>
                    <span className="chip">💰 ${game.prizePool} Prize</span>
                    <span className="chip">🎯 ${game.skinsPool} Skins</span>
                    {game.payouts.map((p) => (
                      <span key={p.place} className="chip">🏆 {p.place}{p.place === 1 ? 'st' : p.place === 2 ? 'nd' : p.place === 3 ? 'rd' : 'th'} ${p.amount}</span>
                    ))}
                  </div>
                  <ul className="players">
                    {game.teams.map((team) => (
                      <li 
                        key={team.id} 
                        className="player team-container" 
                        style={{ gridTemplateColumns: '1fr' }}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, team.id)}
                      >
                        <div className="name"><strong>Team {team.id}</strong> · Team CH Sum: {team.teamHandicap}</div>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                          {team.players.map((p, i) => (
                            <li 
                              key={i} 
                              className={`player ${p.tee} draggable-player`} 
                              style={{ marginTop: '0.5rem' }}
                              draggable
                              onDragStart={(e) => handleDragStart(e, team.id, i)}
                              onDragEnd={handleDragEnd}
                            >
                              <div className="name">
                                {p.firstName} {p.lastName ?? ''}
                              </div>
                              <div className="meta">
                                <span className={`chip ${p.tee}`}>{p.tee.toUpperCase()}</span>
                                <span className="hi">CH: {p.courseHandicap} (HI {p.handicapIndex.toFixed(1)})</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>

                
              </>
            )}
          </div>
      )}

      {/* Temporarily disabled scorecards
      {course && game && (
        <div className="scorecards-container">
          <Scorecards course={course} teams={game.teams} />
        </div>
      )}
      */}
    </div>
  )
}
