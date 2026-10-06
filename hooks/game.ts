import type { ClientModule, ClientSurface, RenderElement } from 'claude-code'

export type ChompProps = { paused: boolean; waitingSince: number | null; highScore: number; drawMode: 'svg' | 'text' }

// What the module sends the hooks module each frame, so the pane can draw it as a picture.
export type ChompFrame = {
  type: 'frame'
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

type Dir = 'up' | 'down' | 'left' | 'right'
type Ghost = {
  x: number
  y: number
  dir: Dir
  colour: string
  homeX: number
  homeY: number
  releaseAt: number
  isOut: boolean
  isScared: boolean
}
type Game = {
  props: ChompProps
  grid: string[][]
  px: number
  py: number
  dir: Dir
  next: Dir
  facing: 'left' | 'right'
  ghosts: Ghost[]
  score: number
  lives: number
  level: number
  mode: 'ready' | 'playing' | 'dying' | 'over'
  tick: number
  frightUntil: number
  chain: number
  dyingUntil: number
  firstStartAt: number
  message: string
}
type Holder = { game: Game; version: number }

const TICK_MS = 125
const FRIGHT_TICKS = 48
const WALL = '#3b5bff'
const DOT = '#d1d5db'
const PLAYER = '#facc15'
const SCARED = '#3b82f6'
const GHOST_COLOURS = ['#ef4444', '#f9a8d4', '#22d3ee', '#fb923c']

// # wall, . dot, o power pellet, - ghost door, space empty, P player start, G ghost start.
const MAZE = [
  '###################',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.### # ###.####',
  '   #.#   G   #.#   ',
  '####.# ##-## #.####',
  '    .  #GGG#  .    ',
  '####.# ##### #.####',
  '   #.#       #.#   ',
  '####.# ##### #.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#.....P.....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
]
const W = MAZE[0]!.length
const H = MAZE.length
const STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const REVERSE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }
const DIRS: Dir[] = ['up', 'left', 'down', 'right']
const KEYS: Record<string, Dir> = { up: 'up', down: 'down', left: 'left', right: 'right', w: 'up', a: 'left', s: 'down', d: 'right' }

function freshGrid() {
  return MAZE.map(row => row.split('').map(c => (c === 'P' || c === 'G' ? ' ' : c)))
}

function starts() {
  let player: [number, number] = [9, 15]
  const ghosts: [number, number][] = []
  MAZE.forEach((row, y) =>
    row.split('').forEach((c, x) => {
      if (c === 'P') player = [x, y]
      if (c === 'G') ghosts.push([x, y])
    }),
  )
  return { player, ghosts }
}

function placeActors(g: Game) {
  const { player, ghosts } = starts()
  g.px = player[0]
  g.py = player[1]
  g.dir = 'left'
  g.next = 'left'
  g.facing = 'left'
  g.ghosts = ghosts.map(([x, y], i) => ({
    x,
    y,
    dir: 'up',
    colour: GHOST_COLOURS[i % GHOST_COLOURS.length]!,
    homeX: x,
    homeY: y,
    releaseAt: g.tick + i * 16,
    isOut: y <= 7,
    isScared: false,
  }))
  g.frightUntil = 0
}

function newGame(props: ChompProps): Game {
  const g: Game = {
    props,
    grid: freshGrid(),
    px: 0,
    py: 0,
    dir: 'left',
    next: 'left',
    facing: 'left',
    ghosts: [],
    score: 0,
    lives: 3,
    level: 1,
    mode: 'ready',
    tick: 0,
    frightUntil: 0,
    chain: 0,
    dyingUntil: 0,
    firstStartAt: 0,
    message: 'Click the maze, then use the arrow keys or WASD to start.',
  }
  placeActors(g)
  return g
}

const wrapX = (x: number) => (x + W) % W
const cell = (g: Game, x: number, y: number) => (y < 0 || y >= H ? '#' : g.grid[y]![wrapX(x)]!)

function canPlayerEnter(g: Game, x: number, y: number) {
  const c = cell(g, x, y)
  return c !== '#' && c !== '-'
}

function canGhostEnter(g: Game, ghost: Ghost, x: number, y: number) {
  const c = cell(g, x, y)
  if (c === '#') return false
  if (c === '-') return !ghost.isOut
  return true
}

function isFrightened(g: Game) {
  return g.tick < g.frightUntil
}

function eatAt(g: Game) {
  const c = g.grid[g.py]![g.px]!
  if (c === '.') {
    g.score += 10
    g.grid[g.py]![g.px] = ' '
  } else if (c === 'o') {
    g.score += 50
    g.grid[g.py]![g.px] = ' '
    g.frightUntil = g.tick + FRIGHT_TICKS
    g.chain = 0
    for (const ghost of g.ghosts) {
      ghost.isScared = true
      if (ghost.isOut) ghost.dir = REVERSE[ghost.dir]
    }
  }
}

function dotsLeft(g: Game) {
  return g.grid.some(row => row.some(c => c === '.' || c === 'o'))
}

function ghostTarget(g: Game, ghost: Ghost, i: number): [number, number] {
  if (!ghost.isOut) return [9, 7]
  const [dx, dy] = STEP[g.dir]
  if (i === 1) return [g.px + dx * 4, g.py + dy * 4]
  if (i === 2) return [g.px - dx * 2, g.py - dy * 2]
  if (i === 3) {
    const far = Math.abs(ghost.x - g.px) + Math.abs(ghost.y - g.py) > 8
    return far ? [g.px, g.py] : [1, 19]
  }
  return [g.px, g.py]
}

function moveGhost(g: Game, ghost: Ghost, i: number) {
  if (g.tick < ghost.releaseAt) return
  const options = DIRS.filter(d => {
    const [dx, dy] = STEP[d]
    return canGhostEnter(g, ghost, ghost.x + dx, ghost.y + dy)
  })
  if (options.length === 0) return
  const forward = options.filter(d => d !== REVERSE[ghost.dir])
  const choices = forward.length ? forward : options
  let pick: Dir
  if (ghost.isScared || Math.random() < 0.08) {
    pick = choices[Math.floor(Math.random() * choices.length)]!
  } else {
    const [tx, ty] = ghostTarget(g, ghost, i)
    pick = choices.reduce((best, d) => {
      const [dx, dy] = STEP[d]
      const [bx, by] = STEP[best]
      const dist = (ghost.x + dx - tx) ** 2 + (ghost.y + dy - ty) ** 2
      const bestDist = (ghost.x + bx - tx) ** 2 + (ghost.y + by - ty) ** 2
      return dist < bestDist ? d : best
    })
  }
  const [dx, dy] = STEP[pick]
  ghost.dir = pick
  ghost.x = wrapX(ghost.x + dx)
  ghost.y += dy
  if (!ghost.isOut && ghost.y <= 7 && cell(g, ghost.x, ghost.y) !== '-') ghost.isOut = true
}

function collide(g: Game) {
  for (const ghost of g.ghosts) {
    if (ghost.x !== g.px || ghost.y !== g.py) continue
    if (ghost.isScared && isFrightened(g)) {
      g.score += 200 * 2 ** g.chain
      g.chain += 1
      ghost.x = ghost.homeX
      ghost.y = ghost.homeY === 7 ? 9 : ghost.homeY
      ghost.isOut = false
      ghost.isScared = false
      ghost.releaseAt = g.tick + 24
    } else {
      g.lives -= 1
      g.mode = 'dying'
      g.dyingUntil = g.tick + 12
      return
    }
  }
}

function waited(g: Game) {
  const since = g.props.waitingSince ?? g.firstStartAt
  const s = Math.max(0, Math.round((Date.now() - since) / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

function step(g: Game, surface: ClientSurface<Holder>) {
  g.tick += 1
  if (g.mode === 'dying') {
    if (g.tick < g.dyingUntil) return
    if (g.lives <= 0) {
      g.mode = 'over'
      g.message = `Claude kept you waiting ${waited(g)}. You scored ${g.score}. Press Space to play again.`
      return
    }
    placeActors(g)
    g.mode = 'playing'
    g.message = ''
    return
  }

  const [nx, ny] = STEP[g.next]
  if (canPlayerEnter(g, g.px + nx, g.py + ny)) g.dir = g.next
  const [dx, dy] = STEP[g.dir]
  if (g.dir === 'left' || g.dir === 'right') g.facing = g.dir
  if (canPlayerEnter(g, g.px + dx, g.py + dy)) {
    g.px = wrapX(g.px + dx)
    g.py += dy
  }
  eatAt(g)
  collide(g)
  if (g.mode !== 'playing') return

  if (!isFrightened(g)) for (const ghost of g.ghosts) ghost.isScared = false
  g.ghosts.forEach((ghost, i) => {
    const isSlow = ghost.isScared && isFrightened(g)
    if (isSlow ? g.tick % 2 === 0 : g.tick % 5 !== 0) moveGhost(g, ghost, i)
  })
  collide(g)
  if (g.mode !== 'playing') return

  if (!dotsLeft(g)) {
    g.level += 1
    g.grid = freshGrid()
    placeActors(g)
    g.message = `Level ${g.level}!`
  } else if (g.message.startsWith('Level') && g.tick % 16 === 0) {
    g.message = ''
  }
}

function start(g: Game) {
  if (g.mode === 'ready') {
    g.mode = 'playing'
    g.firstStartAt = Date.now()
    g.message = ''
  }
}

function restart(g: Game) {
  const fresh = newGame(g.props)
  Object.assign(g, fresh, { mode: 'playing', firstStartAt: Date.now(), message: '' })
}

const isWall = (x: number, y: number) => y >= 0 && y < H && x >= 0 && x < W && MAZE[y]![x] === '#'

// Thin arcade-style outlines: each wall cell picks a box-drawing piece from its wall neighbours.
function wallPiece(x: number, y: number): string {
  const u = isWall(x, y - 1)
  const d = isWall(x, y + 1)
  const l = isWall(x - 1, y)
  const r = isWall(x + 1, y)
  const n = Number(u) + Number(d) + Number(l) + Number(r)
  if (n === 4) return '  '
  let c = '─'
  if ((u || d) && !l && !r) c = '│'
  else if (r && d && !l && !u) c = '╭'
  else if (l && d && !r && !u) c = '╮'
  else if (r && u && !l && !d) c = '╰'
  else if (l && u && !r && !d) c = '╯'
  else if (l && r && d && !u) c = '┬'
  else if (l && r && u && !d) c = '┴'
  else if (u && d && r && !l) c = '├'
  else if (u && d && l && !r) c = '┤'
  else if (n === 0) c = '■'
  return c + (r ? '─' : ' ')
}

const WALL_ART = MAZE.map((row, y) => row.split('').map((_, x) => (isWall(x, y) ? wallPiece(x, y) : '')))

function glyph(g: Game, x: number, y: number): [string, string] {
  if (x === g.px && y === g.py) {
    const isOpen = g.tick % 2 === 0 || g.mode !== 'playing'
    const face = isOpen ? (g.facing === 'left' ? 'ᗤ' : 'ᗧ') : '●'
    return [`${face} `, g.mode === 'dying' && g.tick % 2 ? '#78350f' : PLAYER]
  }
  const ghost = g.ghosts.find(gh => gh.x === x && gh.y === y)
  if (ghost) {
    const isScared = ghost.isScared && isFrightened(g)
    const isFlashing = isScared && g.frightUntil - g.tick < 16 && g.tick % 2 === 0
    return ['ᗣ ', isScared ? (isFlashing ? '#ffffff' : SCARED) : ghost.colour]
  }
  const c = g.grid[y]![x]!
  if (c === '#') return [WALL_ART[y]![x]!, WALL]
  if (c === '-') return ['══', '#f9a8d4']
  if (c === '.') return ['· ', '#fcd9b6']
  if (c === 'o') return [g.tick % 4 < 2 ? '● ' : '  ', '#fcd9b6']
  return ['  ', DOT]
}

function frameOf(g: Game): ChompFrame {
  return {
    type: 'frame',
    grid: g.grid.map(row => row.join('')),
    px: g.px,
    py: g.py,
    dir: g.dir,
    tick: g.tick,
    ghosts: g.ghosts.map(gh => {
      const scared = gh.isScared && isFrightened(g)
      return {
        x: gh.x,
        y: gh.y,
        dir: gh.dir,
        colour: gh.colour,
        scared,
        flash: scared && g.frightUntil - g.tick < 16 && g.tick % 2 === 0,
      }
    }),
    score: g.score,
    lives: g.lives,
    level: g.level,
    mode: g.mode,
    message: g.message,
  }
}

function strip(g: Game, surface: ClientSurface<Holder>): RenderElement {
  const { Box, Text } = surface.elements
  const isPaused = g.props.paused && g.mode === 'playing'
  const text =
    g.mode === 'ready'
      ? 'Click here, then use the arrow keys or WASD to play.'
      : g.mode === 'over'
        ? 'Click here or press Space to play again.'
        : isPaused
          ? 'Paused.'
          : 'Arrow keys or WASD to move. Click here if the keys stop working.'
  return Box({
    borderStyle: 'round',
    borderColor: '#facc15',
    paddingX: 1,
    children: [Text({ color: '#facc15', children: text })],
  })
}

function draw(g: Game, surface: ClientSurface<Holder>): RenderElement {
  if (g.props.drawMode === 'svg') return strip(g, surface)
  const { Box, Text } = surface.elements
  const rows: RenderElement[] = []
  for (let y = 0; y < H; y++) {
    const spans: RenderElement[] = []
    let text = ''
    let colour = ''
    for (let x = 0; x < W; x++) {
      const [t, c] = glyph(g, x, y)
      if (c !== colour && text) {
        spans.push(Text({ color: colour, children: text }))
        text = ''
      }
      colour = c
      text += t
    }
    if (text) spans.push(Text({ color: colour, children: text }))
    rows.push(Text({ wrap: 'truncate', children: spans }))
  }
  const lives = 'ᗧ '.repeat(Math.max(0, g.lives)).trim() || '-'
  const high = Math.max(g.props.highScore, g.score)
  const isPaused = g.props.paused && g.mode === 'playing'
  return Box({
    flexDirection: 'column',
    backgroundColor: '#000000',
    paddingX: 1,
    children: [
      Box({
        columnGap: 3,
        children: [
          Text({ color: PLAYER, bold: true, children: 'CHOMP' }),
          Text({ color: '#ffffff', bold: true, children: `Score ${g.score}` }),
          Text({ color: '#a78bfa', children: `High ${high}` }),
          Text({ color: PLAYER, children: `Lives ${lives}` }),
          Text({ dimColor: true, children: `Level ${g.level}` }),
        ],
      }),
      ...(surface.columns > 0 && surface.columns < W * 2 + 2
        ? [Text({ color: '#f87171', children: `Make the pane wider: the maze needs ${W * 2 + 2} columns, it has ${surface.columns}.` })]
        : []),
      ...rows,
      Text({
        color: g.mode === 'over' ? '#f87171' : '#a78bfa',
        children: isPaused ? 'Paused.' : g.message || ' ',
      }),
    ],
  })
}

const Chomp: ClientModule<ChompProps, Holder> = (props, surface) => {
  const holder = surface.state
  if (!holder) {
    const game = newGame(props)
    surface.setState({ game, version: 0 })
    const redraw = () => {
      surface.setState({ game, version: (surface.state?.version ?? 0) + 1 })
      surface.post(frameOf(game))
    }
    surface.post(frameOf(game))
    surface.every(TICK_MS, () => {
      if (game.mode === 'ready' || game.mode === 'over' || game.props.paused) return
      step(game, surface)
      redraw()
    })
    surface.onKey(event => {
      const k = event.key.toLowerCase()
      const dir = KEYS[k]
      if (dir) {
        game.next = dir
        start(game)
      } else if ((k === ' ' || k === 'space' || k === 'r' || k === 'return') && game.mode === 'over') {
        restart(game)
      }
      redraw()
    })
    surface.onPointer(event => {
      if (event.type !== 'down') return
      if (game.mode === 'over') restart(game)
      else start(game)
      redraw()
    })
    return draw(game, surface)
  }
  holder.game.props = props
  return draw(holder.game, surface)
}

export default Chomp
