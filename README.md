# Chomp Mod for Claude Code

> Part of the **Automators+** library -- Claude Code skills and mods shared exclusively with the Automators+ community.

A maze chase game that opens next to the chat when Claude takes a while.

Once a turn has run for 20 seconds, Chomp opens in a pane beside the conversation. A line above the maze says what
Claude is doing right now, so you can play and still keep an eye on the work. When Claude finishes, the game pauses.

## What You Get

- **Opens on its own** -- after a turn runs for 20 seconds, or any time with `/chomp`
- **Watch while you play** -- a live line above the maze: reading a file, running a command, editing, done
- **Pauses when Claude's done** -- press **Resume** to keep playing or **Back to work** to close it
- **Keeps your high score** between sessions
- **Draws in both places** -- a full maze in the Desktop app, a text version in the terminal

## Requirements

- Claude Code v2.1.287 or later in the terminal, or the Code tab of the Claude Desktop app on v2.1.286 or later. Enter `/status` to check your version
- Mods draw in the terminal and the Desktop app. The VS Code extension's chat panel runs them but doesn't show them

## Install

In your terminal:

```
claude plugin marketplace add automatorsplus/chomp-mod
claude plugin install chomp@chomp-mod
```

Or from inside a Claude Code session, in one line:

```
/plugin install chomp --marketplace automatorsplus/chomp-mod
```

Then start a new session, or run `/reload-plugins`. To turn it off later, open `/plugin`, go to the **Installed** tab and disable it.

## Try It

Ask Claude for something that takes a while:

- Build me a landing page for a coffee shop.

After 20 seconds the maze opens. Click it, then use the arrow keys or WASD. Or type `/chomp` to open it any time.

## How It Works

`hooks/register.tsx` opens the pane, tracks what Claude is doing and pauses the game when the turn ends.
`hooks/game.ts` is the game and `hooks/art.ts` draws it.

---

*Shared with the Automators+ community*
