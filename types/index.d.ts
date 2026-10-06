export type ChompFlags = { isRunning: boolean; isClaudeDone: boolean; isOpen: boolean }

export type ChompFrameState = {
  grid: string[]
  px: number
  py: number
  dir: string
  tick: number
  ghosts: { x: number; y: number; dir: string; colour: string; scared: boolean; flash: boolean }[]
  score: number
  lives: number
  level: number
  mode: string
  message: string
}

declare module 'claude-code' {
  interface PluginState {
    chomp: {
      activity: string
      flags: ChompFlags
      turnStartedAt: number | null
      highScore: number
      frame: ChompFrameState | null
    }
  }
}
