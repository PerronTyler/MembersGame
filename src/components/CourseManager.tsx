import { useMemo, useState } from 'react'
import type { Course, Player, Tee, CourseSlopesByTee } from '../types/golf'
import './CourseManager.scss'
import { generateGame, type GameResult } from '../utils/game'

type CourseForm = {
  name: string
  par: number
  slopes: CourseSlopesByTee
}

type PlayerForm = {
  firstName: string
  lastName?: string
  handicapIndex: string // keep as string for input, convert to number on submit
  tee: Tee
}

const defaultSlopes: CourseSlopesByTee = { white: 120, blue: 122, red: 121 }

export default function CourseManager() {
  const [course, setCourse] = useState<Course | null>(null)
  const [game, setGame] = useState<GameResult | null>(null)
  const [seed, setSeed] = useState<number>(Date.now() & 0xffffffff)
  const [courseForm, setCourseForm] = useState<CourseForm>({
    name: '',
    par: 72,
    slopes: { ...defaultSlopes },
  })

  const [playerForm, setPlayerForm] = useState<PlayerForm>({
    firstName: '',
    lastName: '',
    handicapIndex: '',
    tee: 'white',
  })


  // Inline edit state for existing players
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingForm, setEditingForm] = useState<PlayerForm | null>(null)
  const [menuPlayerIndex, setMenuPlayerIndex] = useState<number | null>(null)
  const [menuAbove, setMenuAbove] = useState<boolean>(false)
  const [draggedPlayer, setDraggedPlayer] = useState<{ teamId: number; playerIndex: number } | null>(null)

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
      firstName: p.firstName,
      lastName: p.lastName ?? '',
      handicapIndex: String(p.handicapIndex.toFixed(1)),
      tee: p.tee,
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
    updated[editingIndex] = {
      firstName: editingForm.firstName.trim(),
      lastName: editingForm.lastName?.trim() || undefined,
      handicapIndex: Number(hi.toFixed(1)),
      tee: editingForm.tee,
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
    setCourse(newCourse)
  }

  const canAddPlayer = useMemo(() => {
    const hi = Number(playerForm.handicapIndex)
    return playerForm.firstName.trim().length > 0 && Number.isFinite(hi)
  }, [playerForm])

  function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    if (!course || !canAddPlayer) return
    const hi = Number(playerForm.handicapIndex)
    const newPlayer: Player = {
      firstName: playerForm.firstName.trim(),
      lastName: playerForm.lastName?.trim() || undefined,
      handicapIndex: Number(hi.toFixed(1)),
      tee: playerForm.tee,
    }
    setCourse({ ...course, players: [...course.players, newPlayer] })
    setGame(null)
    setPlayerForm({ firstName: '', lastName: '', handicapIndex: '', tee: 'white' })
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
        firstName: fn,
        lastName: includeLast ? ln : undefined,
        handicapIndex: hi,
        tee,
      }
    })

    setCourse({ ...course, players: [...course.players, ...players] })
    setGame(null)
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

  function onGenerateGame(e: React.FormEvent) {
    e.preventDefault()
    if (!course) return
    const fee = Number(entryFee)
    const skins = Number(skinsFee)
    const result = generateGame(course, course.players, { entryFeePerPlayer: fee, skinsPoolPerPlayer: skins, randomSeed: seed })
    setGame(result)
  }

  function onRegenerate() {
    if (!course) return
    const fee = Number(entryFee)
    const skins = Number(skinsFee)
    const nextSeed = (seed + 1) >>> 0
    setSeed(nextSeed)
    const result = generateGame(course, course.players, { entryFeePerPlayer: fee, skinsPoolPerPlayer: skins, randomSeed: nextSeed })
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
          <div className="actions" style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
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
              <div className="grid">
                <label>
                  <span>First Name</span>
                  <input
                    type="text"
                    value={playerForm.firstName}
                    onChange={(e) => setPlayerForm((p) => ({ ...p, firstName: e.target.value }))}
                    placeholder="e.g., Ann"
                    required
                  />
                </label>
                <label>
                  <span>Last Name (optional)</span>
                  <input
                    type="text"
                    value={playerForm.lastName}
                    onChange={(e) => setPlayerForm((p) => ({ ...p, lastName: e.target.value }))}
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
                    value={playerForm.handicapIndex}
                    onChange={(e) => setPlayerForm((p) => ({ ...p, handicapIndex: e.target.value }))}
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
              <div className="actions" style={{ marginBottom: '0.5rem' }}>
                <button type="button" onClick={addTestPlayers}>Add Test Players</button>
              </div>
              {course.players.length === 0 ? (
                <p>No players added yet.</p>
              ) : (
                <ul className="players" onClick={() => setMenuPlayerIndex(null)}>
                  {course.players.map((pl, idx) => (
                    <li
                      key={idx}
                      className={`player ${pl.tee}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        // Toggle menu for this card
                        const card = e.currentTarget as HTMLElement
                        const rect = card.getBoundingClientRect()
                        const viewportH = window.innerHeight || document.documentElement.clientHeight
                        const estimatedMenuHeight = 88 /* px */
                        setMenuAbove(rect.bottom + estimatedMenuHeight > viewportH)
                        setMenuPlayerIndex(menuPlayerIndex === idx ? null : idx)
                      }}
                    >
                      <div className="name">
                        {pl.firstName} {pl.lastName ? pl.lastName : ''}
                      </div>
                      <div className="meta">
                        <span className={`chip ${pl.tee}`}>{pl.tee.toUpperCase()}</span>
                        <span className="hi">CH: {courseHandicap(pl.handicapIndex, pl.tee)} (HI {pl.handicapIndex.toFixed(1)})</span>
                        {menuPlayerIndex === idx && (
                          <div
                            className={`card-menu${menuAbove ? ' above' : ''}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button type="button" onClick={() => { setMenuPlayerIndex(null); startEditPlayer(idx) }}>Edit</button>
                            <button type="button" onClick={() => { deletePlayer(idx) }}>Delete</button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
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
    </div>
  )
}
