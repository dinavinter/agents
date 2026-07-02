/**
 * Tic-Tac-Toe Agent — with HTML rendering for the viewer.
 * 
 * Emits HTML fragments via XState emit() → synced to Yjs "emitted" array →
 * viewer's SSE stream picks them up → HTMX swaps them into the page.
 * 
 * GET  /  → current board state
 * POST / { type: "PLAY", index: 0-8 } → make a move
 * POST / { type: "AI_MOVE" } → let AI pick a move
 */

import { assign, setup, emit } from "https://esm.sh/xstate@5.19.0";

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

function renderBoard(board, winner, winLine) {
  const cells = board.map((cell, i) => {
    const isWin = winLine?.includes(i);
    const symbol = cell === "x" ? "✕" : cell === "o" ? "○" : "";
    const color = cell === "x" ? "text-blue-500" : cell === "o" ? "text-red-500" : "";
    const bg = isWin ? "bg-green-100" : "bg-white";
    const clickable = cell === "" && !winner;
    const hxAttrs = clickable
      ? `hx-post="/play/tictac/${i}" hx-swap="none" class="w-20 h-20 border border-gray-300 flex items-center justify-center text-4xl font-bold ${bg} cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"`
      : `class="w-20 h-20 border border-gray-300 flex items-center justify-center text-4xl font-bold ${color} ${bg}"`;
    return `<div ${hxAttrs} data-index="${i}">${symbol}</div>`;
  }).join("");

  const status = winner
    ? `<div class="text-2xl font-bold text-green-600 mt-4">🎉 ${winner.toUpperCase()} wins!</div>`
    : board.every(c => c !== "")
    ? `<div class="text-2xl font-bold text-gray-500 mt-4">Draw!</div>`
    : `<div class="text-lg text-gray-600 mt-4">Your turn (X) — click a cell</div>`;

  return `
    <div class="flex flex-col items-center p-6">
      <h2 class="text-2xl font-bold mb-4">🎮 Tic-Tac-Toe</h2>
      <div class="grid grid-cols-3 gap-1 bg-gray-200 p-1 rounded-lg shadow-md">
        ${cells}
      </div>
      ${status}
      <div class="mt-4 text-sm text-gray-400">Running as Kyma Function → synced via Yjs</div>
    </div>
  `;
}

// --- Machine ---

export const machine = setup({
  actions: {
    renderBoard: emit(({ context }) => {
      const winner = getWinner(context.board);
      return {
        type: "message",
        data: renderBoard(context.board, context.winner, winner?.line),
      };
    }),
  },
}).createMachine({
  id: "tictactoe",
  initial: "playing",
  context: {
    board: ["", "", "", "", "", "", "", "", ""],
    player: "x",
    moves: 0,
    winner: null,
  },
  // Render initial board on entry
  entry: "renderBoard",
  states: {
    playing: {
      on: {
        PLAY: {
          guard: ({ context, event }) => {
            return context.board[event.index] === "" && !context.winner && context.player === "x";
          },
          actions: [
            // Human plays X
            assign(({ context, event }) => {
              const board = [...context.board];
              board[event.index] = "x";
              let winner = getWinner(board);
              let moves = context.moves + 1;
              let player = "o";

              // AI immediately responds with O (if game not over)
              if (!winner && moves < 9) {
                const empty = board
                  .map((cell, i) => (cell === "" ? i : -1))
                  .filter((i) => i >= 0);
                if (empty.length > 0) {
                  const aiIndex = empty[Math.floor(Math.random() * empty.length)];
                  board[aiIndex] = "o";
                  winner = getWinner(board);
                  moves++;
                  player = "x";
                }
              }

              return { board, player, moves, winner: winner?.player || null };
            }),
            "renderBoard",
          ],
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
    won: {
      type: "final",
      entry: "renderBoard",
    },
    draw: {
      type: "final",
      entry: "renderBoard",
    },
  },
});
