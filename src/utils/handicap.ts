import type { Course, Player, Tee } from '../types/golf'

export function courseHandicapFor(course: Course, hi: number, tee: Tee): number {
  const slope = course.slopes[tee] || 0
  const ch = (hi * slope) / 113
  return Math.round(ch)
}

export function playerWithCourseHandicap(course: Course, player: Player) {
  const ch = courseHandicapFor(course, player.handicapIndex, player.tee)
  return { ...player, courseHandicap: ch }
}

export type PlayerWithCH = ReturnType<typeof playerWithCourseHandicap>
