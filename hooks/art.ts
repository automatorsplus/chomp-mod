import type { ChompFrameState } from '../types'

// Draws one frame of the game as an SVG in the arcade style.
const CELL = 20
const TOP = 30
const BOTTOM = 26
const BLUE = '#2121de'

function isWall(grid: string[], x: number, y: number) {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0]!.length && grid[y]![x] === '#'
}

// Walls as hollow double lines: a thick blue stroke along the wall centre lines with a thinner black one on top.
let wallCache = ''
function wallPath(grid: string[]) {
  if (wallCache) return wallCache
  const parts: string[] = []
  const c = (n: number) => n * CELL + CELL / 2
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0]!.length; x++) {
      if (!isWall(grid, x, y)) continue
      const right = isWall(grid, x + 1, y)
      const down = isWall(grid, x, y + 1)
      if (right) parts.push(`M${c(x)} ${c(y) + TOP}H${c(x + 1)}`)
      if (down) parts.push(`M${c(x)} ${c(y) + TOP}V${c(y + 1) + TOP}`)
      const alone = !right && !down && !isWall(grid, x - 1, y) && !isWall(grid, x, y - 1)
      if (alone) parts.push(`M${c(x) - 0.1} ${c(y) + TOP}h0.2`)
    }
  }
  wallCache = parts.join('')
  return wallCache
}

const ANGLE: Record<string, number> = { right: 0, down: 90, left: 180, up: 270 }

function chomper(cx: number, cy: number, r: number, dir: string, mouth: number) {
  if (mouth < 2) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffff00"/>`
  const a = (mouth * Math.PI) / 180
  const x = (cx + r * Math.cos(a)).toFixed(2)
  const y1 = (cy - r * Math.sin(a)).toFixed(2)
  const y2 = (cy + r * Math.sin(a)).toFixed(2)
  return `<path d="M${cx} ${cy}L${x} ${y1}A${r} ${r} 0 1 0 ${x} ${y2}Z" fill="#ffff00" transform="rotate(${ANGLE[dir] ?? 0} ${cx} ${cy})"/>`
}

function ghost(gx: number, gy: number, g: ChompFrameState['ghosts'][number], tick: number) {
  const x = gx * CELL
  const y = gy * CELL + TOP
  const body = g.scared ? (g.flash ? '#ffffff' : '#2121ff') : g.colour
  const wave = tick % 2 === 0
  const feet = wave ? 'l-2.67 -3l-2.67 3l-2.67 -3l-2.67 3l-2.67 -3l-2.67 3' : 'l-2.67 3l-2.67 -3l-2.67 3l-2.67 -3l-2.67 3l-2.67 -3'
  const base = wave ? y + 18 : y + 15
  let out = `<path d="M${x + 2} ${base}V${y + 9}A8 8 0 0 1 ${x + 18} ${y + 9}V${base}${feet}Z" fill="${body}"/>`
  if (g.scared) {
    const face = g.flash ? '#ff0000' : '#ffb8ae'
    out += `<rect x="${x + 6}" y="${y + 7}" width="2.5" height="2.5" fill="${face}"/><rect x="${x + 11.5}" y="${y + 7}" width="2.5" height="2.5" fill="${face}"/>`
    out += `<path d="M${x + 4} ${y + 14}l2 -2l2 2l2 -2l2 2l2 -2l2 2" stroke="${face}" stroke-width="1.2" fill="none"/>`
  } else {
    const [dx, dy] = g.dir === 'left' ? [-1.3, 0] : g.dir === 'right' ? [1.3, 0] : g.dir === 'up' ? [0, -1.5] : [0, 1.5]
    for (const ex of [x + 7, x + 13]) {
      out += `<ellipse cx="${ex}" cy="${y + 9}" rx="2.6" ry="3.2" fill="#ffffff"/>`
      out += `<circle cx="${ex + dx}" cy="${y + 9 + dy}" r="1.5" fill="#2121de"/>`
    }
  }
  return out
}

export function frameSvg(f: ChompFrameState, high: number) {
  const grid = f.grid
  const w = grid[0]!.length * CELL
  const h = grid.length * CELL + TOP + BOTTOM
  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`)
  out.push(`<rect width="${w}" height="${h}" fill="#000000"/>`)
  const font = `font-family="'Press Start 2P','Courier New',monospace" font-weight="bold"`
  out.push(`<text x="8" y="20" ${font} font-size="14" fill="#ffffff">SCORE ${f.score}</text>`)
  out.push(`<text x="${w - 8}" y="20" ${font} font-size="14" fill="#ffffff" text-anchor="end">HIGH ${Math.max(high, f.score)}</text>`)
  const walls = wallPath(grid)
  out.push(`<path d="${walls}" stroke="${BLUE}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`)
  out.push(`<path d="${walls}" stroke="#000000" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`)
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y]!.length; x++) {
      const c = grid[y]![x]
      const cx = x * CELL + CELL / 2
      const cy = y * CELL + CELL / 2 + TOP
      if (c === '.') out.push(`<rect x="${cx - 1.5}" y="${cy - 1.5}" width="3" height="3" fill="#ffb8ae"/>`)
      else if (c === 'o' && f.tick % 4 < 2) out.push(`<circle cx="${cx}" cy="${cy}" r="6" fill="#ffb8ae"/>`)
      else if (c === '-') out.push(`<rect x="${x * CELL}" y="${cy - 1.5}" width="${CELL}" height="3" fill="#ffb8ff"/>`)
    }
  }
  const mouth = f.mode === 'playing' ? [45, 25, 5][f.tick % 3]! : 30
  const isBlinking = f.mode === 'dying' && f.tick % 2 === 1
  if (!isBlinking) out.push(chomper(f.px * CELL + CELL / 2, f.py * CELL + CELL / 2 + TOP, 8, f.dir, mouth))
  for (const g of f.ghosts) out.push(ghost(g.x, g.y, g, f.tick))
  const cy = h - BOTTOM / 2
  for (let i = 0; i < Math.max(0, f.lives - (f.mode === 'over' ? 0 : 1)); i++) out.push(chomper(16 + i * 22, cy, 7, 'left', 35))
  out.push(`<text x="${w - 8}" y="${cy + 5}" ${font} font-size="12" fill="#ffb8ae" text-anchor="end">LEVEL ${f.level}</text>`)
  const banner = f.mode === 'ready' ? ['READY!', '#ffff00'] : f.mode === 'over' ? ['GAME OVER', '#ff0000'] : null
  if (banner) out.push(`<text x="${w / 2}" y="${11 * CELL + TOP + 15}" ${font} font-size="16" fill="${banner[1]}" text-anchor="middle">${banner[0]}</text>`)
  out.push('</svg>')
  return out.join('')
}
