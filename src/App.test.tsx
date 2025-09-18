import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the main heading', () => {
    render(<App />)
    expect(screen.getByText('🏌️ Members Game')).toBeInTheDocument()
  })

  it('renders the subtitle', () => {
    render(<App />)
    expect(screen.getByText('Golf Handicap Management System')).toBeInTheDocument()
  })

  it('increments count when button is clicked', () => {
    render(<App />)
    const button = screen.getByRole('button', { name: /Games Created: 0/i })
    
    fireEvent.click(button)
    
    expect(screen.getByRole('button', { name: /Games Created: 1/i })).toBeInTheDocument()
  })

  it('displays feature list', () => {
    render(<App />)
    expect(screen.getByText('Member registration and handicap tracking')).toBeInTheDocument()
    expect(screen.getByText('Game creation and management')).toBeInTheDocument()
    expect(screen.getByText('Handicap-based game scoring')).toBeInTheDocument()
    expect(screen.getByText('Tournament organization')).toBeInTheDocument()
  })
})
