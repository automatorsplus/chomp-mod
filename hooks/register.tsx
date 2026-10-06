import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChompFlags, ChompFrameState } from '../types'
import { frameSvg } from './art'

const PANE = 'chomp'
const TITLE = 'Chomp'
const OPEN_AFTER_MS = 20000
const STORE_HIGH = 'highScore'

const activity = atom({ plugin: 'chomp', key: 'activity' } as const, 'idle')
const flags = atom({ plugin: 'chomp', key: 'flags' } as const, { isRunning: false, isClaudeDone: false, isOpen: false })
const turnStartedAt = atom({ plugin: 'chomp', key: 'turnStartedAt' } as const, null)
const highScore = atom({ plugin: 'chomp', key: 'highScore' } as const, 0)
const frame = atom({ plugin: 'chomp', key: 'frame' } as const, null)

const base = (path: unknown) => (typeof path === 'string' ? path.split(/[\\/]/).pop() || path : '')
const clip = (text: unknown, n: number) => {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

function describe(tool: string, args: Record<string, unknown>) {
  switch (tool) {
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `editing ${base(args.file_path ?? args.notebook_path)}`
    case 'Write':
      return `writing ${base(args.file_path)}`
    case 'Read':
      return `reading ${base(args.file_path)}`
    case 'Bash':
      return `running ${clip(args.command, 40)}`
    case 'Grep':
    case 'Glob':
      return `searching for ${clip(args.pattern, 30)}`
    case 'WebFetch':
    case 'WebSearch':
      return 'looking something up online'
    case 'Agent':
    case 'Task':
      return 'running a helper agent'
    case 'TodoWrite':
      return 'updating its to-do list'
    default:
      return tool.startsWith('mcp__') ? `using ${tool.split('__')[1] ?? 'a tool'}` : `using ${tool}`
  }
}

async function setFlags($: EngineInterface, patch: Partial<ChompFlags>) {
  await update($, flags, f => ({ ...f, ...patch }))
}

async function openGame($: EngineInterface) {
  await setFlags($, { isOpen: true })
  await $.ui.open({ id: PANE, title: TITLE })
}

export const register: Register = on => {
  let turn = 0

  on('session.start', async ($, e, next) => {
    const stored = Number((await $.store.get(STORE_HIGH)) ?? 0) || 0
    await update($, highScore, () => stored)
    await $.command.register({ name: 'chomp', description: 'Play a quick maze game while Claude works' })
    return next(e)
  })

  on('command.run', { command: 'chomp' }, async $ => {
    await openGame($)
    return { text: 'Chomp opened. Click the maze to start.' }
  })

  on('prompt.submit', async ($, e, next) => {
    turn += 1
    const mine = turn
    const now = await $.clock.now()
    await update($, turnStartedAt, () => now)
    await update($, activity, () => 'thinking')
    await setFlags($, { isRunning: true, isClaudeDone: false })
    $.clock.after(OPEN_AFTER_MS, async () => {
      const f = await read($, flags)
      if (turn === mine && f.isRunning && !f.isOpen) await openGame($)
    })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const args = e as unknown as Record<string, unknown>
    await update($, activity, () => describe(e.tool, args))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const f = await read($, flags)
    await update($, activity, () => 'done')
    await setFlags($, { isRunning: false, isClaudeDone: f.isOpen })
    if (f.isOpen) $.ui.toast("Claude's done. Your game is paused.")
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await setFlags($, { isOpen: false, isClaudeDone: false })
    return next(e)
  })

  on('ui.message', async ($, e, next) => {
    const data = e.data as (ChompFrameState & { type?: string }) | null
    if (e.requestId === PANE && data?.type === 'frame') {
      const { type: _type, ...state } = data
      await update($, frame, () => state)
      if (data.mode === 'over') {
        const high = await read($, highScore)
        if (data.score > high) {
          await $.store.set(STORE_HIGH, data.score)
          await update($, highScore, () => data.score)
        }
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>Chomp runs in the terminal and the Desktop app.</Text>
    }
    const { Box, Button, Client, Text } = $.ui.resolve(e)
    const f = await read($, flags)
    const doing = await read($, activity)
    const line = f.isRunning ? `Claude: ${doing}` : f.isClaudeDone ? "Claude: done" : 'Claude: idle'
    const isDesktop = e.surface === 'desktop'
    const current = await read($, frame)
    const high = await read($, highScore)
    const props = {
      drawMode: isDesktop ? 'svg' : 'text',
      paused: f.isClaudeDone,
      waitingSince: await read($, turnStartedAt),
      highScore: high,
    }
    const gameOver =
      current?.mode === 'over' ? current.message.replace(' Press Space to play again.', '') : ''
    return (
      <Box flexDirection="column">
        <Text color={f.isRunning ? '#a78bfa' : '#34d399'} wrap="truncate-end">
          {line}
        </Text>
        {f.isClaudeDone && (
          <Box key="done-row" columnGap={1} marginTop={1}>
            <Text bold color="#34d399">
              Claude's done
            </Text>
            <Button
              key="resume"
              label="Resume"
              variant="secondary"
              hover={{ color: '#a78bfa' }}
              onPress={() => setFlags($, { isClaudeDone: false })}
            />
            <Button
              key="back"
              label="Back to work"
              variant="secondary"
              hover={{ color: '#a78bfa' }}
              onPress={() => $.ui.close({ id: PANE })}
            />
          </Box>
        )}
        {isDesktop && current && e.surface === 'desktop' && (
          <Box marginTop={1}>
            {(() => {
              const { Svg } = $.ui.resolve(e)
              return <Svg source={frameSvg(current, high)} alt={`Chomp: score ${current.score}, ${current.lives} lives`} width={380} />
            })()}
          </Box>
        )}
        {gameOver !== '' && isDesktop && (
          <Text bold color="#f87171">
            {gameOver}
          </Text>
        )}
        <Box marginTop={isDesktop ? 0 : 1}>
          <Client key="game" module="./game.ts" props={props} width={isDesktop ? 60 : 42} />
        </Box>
      </Box>
    )
  })
}
