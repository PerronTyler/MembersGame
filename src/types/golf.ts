// Shared golf types for the Members Game app

export type Tee = 'white' | 'blue' | 'red'

export interface Player {
  firstName: string
  lastName?: string
  handicapIndex: number
  tee: Tee
}

export interface CourseSlopesByTee {
  // Slope Ratings typically range from ~55 to 155
  white: number
  blue: number
  red: number
}

export interface Course {
  name: string
  par: number
  slopes: CourseSlopesByTee
  players: Player[]
}
