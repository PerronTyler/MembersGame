import React, { useMemo } from 'react'
import type { Course, Tee } from '../types/golf'
import type { Team } from '../utils/game'
import { loadSavedCourses } from '../utils/savedCourses'
import { courseHandicapFor } from '../utils/handicap'

type Props = {
  course: Course
  teams: Team[]
}

function strokesOnHole(courseHandicap: number, strokeIndex?: number): number {
  if (!strokeIndex || strokeIndex <= 0) return 0
  if (courseHandicap <= 0) return 0
  let strokes = 0
  // Allocate one stroke for each full rotation of 18 where CH >= strokeIndex - 18*k
  while (courseHandicap - strokes * 18 >= strokeIndex) strokes++
  return strokes
}

export default function Scorecards({ course, teams }: Props) {
  const holes = useMemo(() => {
    const db = loadSavedCourses()
    const entry = db[course.name]
    return entry?.Holes ?? []
  }, [course.name])

  const holes18 = useMemo(() => {
    // normalize to 18 holes if available
    if (!holes || holes.length === 0) return [] as { number: number; par: number; strokeIndex?: number }[]
    const byNo = new Map<number, { number: number; par: number; strokeIndex?: number }>()
    for (const h of holes) byNo.set(h.number, { number: h.number, par: h.par, strokeIndex: h.strokeIndex })
    const arr: { number: number; par: number; strokeIndex?: number }[] = []
    for (let i = 1; i <= 18; i++) {
      const h = byNo.get(i) ?? { number: i, par: 4, strokeIndex: i }
      arr.push(h)
    }
    return arr
  }, [holes])

  if (holes18.length === 0) {
    return (
      <section className="panel scorecards-panel">
        <h2>Scorecards</h2>
        <p>No holes data saved for {course.name}. Add holes in Create Course to enable scorecards.</p>
      </section>
    )
  }

  return (
    <section className="panel scorecards-panel">
      <div className="scorecards-header">
        <h2>Scorecards</h2>
        <button type="button" onClick={() => window.print()}>Print</button>
      </div>
      <div className="scorecards-grid">
        {teams.map((team) => (
          <div key={team.id} className="scorecard">
            <div className="scorecard-title">Team {team.id}</div>
            <table className="scorecard-table">
              <thead>
                <tr>
                  <th>Player</th>
                  {holes18.map(h => (
                    <th key={h.number}>{h.number}</th>
                  ))}
                </tr>
                <tr className="par-row">
                  <th>Par</th>
                  {holes18.map(h => (<th key={h.number}>{h.par}</th>))}
                </tr>
              </thead>
              <tbody>
                {team.players.map((p) => {
                  const ch = courseHandicapFor(course, p.handicapIndex, p.tee)
                  return (
                    <tr key={p.id}>
                      <td className="player-name">{p.firstName} {p.lastName ?? ''}<span className="ch">CH {ch}</span></td>
                      {holes18.map(h => {
                        const s = strokesOnHole(ch, h.strokeIndex)
                        return (
                          <td key={h.number} className="dots">
                            {s > 0 ? '•'.repeat(Math.min(s, 3)) : ''}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  )
}
