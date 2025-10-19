// Shared golf types for the Members Game app

export type Tee = 'white' | 'blue' | 'red'

export interface Player {
  id: string
  firstName: string
  lastName?: string
  handicapIndex: number
  tee: Tee
  // Optional group identifier to link players together as a package
  // When present, players sharing the same linkGroupId must be paired on the same team
  // A group can have up to 4 players
  linkGroupId?: string
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
