/**
 * Tic-Tac-Toe Agent — runs as a Kyma Function.
 * 
 * This is a self-contained agent using XState + AI.
 * The runner detects `export const machine` and wraps it
 * in an HTTP handler automatically.
 * 
 * Uses esm.sh-style imports — the runner rewrites them
 * to npm package names at load time.
 * 
 * GET  /  → current board state
 * POST / { type: "PLAY", index: 0-8 } → make a move
 * POST / { type: "AI_MOVE" } → let AI pick a move
 */

import { assign, setup, createMachine } from "https://esm.sh/xstate@5.19.0";

// --- Game logic ---

function getWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] !== "" && board[a] === board[b] && board[a] === board[c]) {
      return { player: board[a], line: [a, b, c] };
    }
  }
  return null;
}

function printBoard(board) {
  const symbol = (cell) => cell === "" ? "·" : cell;
  return [
    `${symbol(board[0])} ${symbol(board[1])} ${symbol(board[2])}`,
    `${symbol(board[3])} ${symbol(board[4])} ${symbol(board[5])}`,
    `${symbol(board[6])} ${symbol(board[7])} ${symbol(board[8])}`,
  ].join("\n");
}

// --- Machine ---

export const machine = createMachine({
  id: "tictactoe",
  initial: "playing",
  context: {
    board: ["", "", "", "", "", "", "", "", ""],
    player: "x",
    moves: 0,
    winner: null,
  },
  states: {
    playing: {
      on: {
        PLAY: {
          guard: ({ context, event }) => {
            return context.board[event.index] === "" && !context.winner;
          },
          actions: assign(({ context, event }) => {
            const board = [...context.board];
            board[event.index] = context.player;
            const winner = getWinner(board);
            return {
              board,
              player: context.player === "x" ? "o" : "x",
              moves: context.moves + 1,
              winner: winner?.player || null,
            };
          }),
          target: "checkEnd",
        },
        AI_MOVE: {
          actions: assign(({ context }) => {
            // Simple AI: pick random empty cell
            const empty = context.board
              .map((cell, i) => (cell === "" ? i : -1))
              .filter((i) => i >= 0);
            if (empty.length === 0) return {};
            const index = empty[Math.floor(Math.random() * empty.length)];
            const board = [...context.board];
            board[index] = context.player;
            const winner = getWinner(board);
            return {
              board,
              player: context.player === "x" ? "o" : "x",
              moves: context.moves + 1,
              winner: winner?.player || null,
            };
          }),
          target: "checkEnd",
        },
      },
    },
    checkEnd: {
      always: [
        { guard: ({ context }) => !!context.winner, target: "won" },
        { guard: ({ context }) => context.moves >= 9, target: "draw" },
        { target: "playing" },
      ],
    },
    won: { type: "final" },
    draw: { type: "final" },
  },
});

// --- Optional: custom HTTP handler override ---
// If you export `main`, it takes priority over the machine wrapper.
// Uncomment to customize:

// export async function main(event, context) {
//   return { custom: true };
// }
