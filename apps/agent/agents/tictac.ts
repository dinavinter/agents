import {assign, setup, log, emit} from 'xstate';
import {z} from 'zod';
import {fromAIEventStream, openaiGP4o} from "../ai";
import {TextStreamPart, tool} from "ai";
import { render, renderTo} from "../ui/render";


type Player = 'x' | 'o';
type Cell = Player | 'empty';
type Board = Array<Cell>;

function isCellEmpty(cell: Cell): cell is "empty" {
    return cell === "empty";
}

function getWinner(board: Board): { player:Player, line: Array<number> } | false {
    const lines = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
    ] as const;
    for (const [a, b, c] of lines) {
        if (!isCellEmpty(board[a]) && board[a] === board[b] && board[a] === board[c]) {
            return {
                player: board[a],
                line: [a, b, c]
            }
        }
    }
    return false;
}

function playTool() {
    return tool({
        parameters: z.object({
            index: z
                .number()
                .min(0)
                .max(8)
                .describe('The index of the cell to play on')
        })
    })
}

function changePlayer(player: Player): Player {
    return player === 'x' ? 'o' : 'x';
}


export const machine = setup({
    types: {
        context: {} as {
            printedBoard: string,
            board: Board,
            moves: number,
            history: { player: Player, index: number }[],
            player: Player
        },
        events: {} as TextStreamPart<any>
    },
    actors: {
        ai: fromAIEventStream({
            model: openaiGP4o()
        })
    },
    actions: {
        updateBoard: assign(({context: {board, moves, ...context}}, {index, player}: {
            index: number,
            player: Player
        }) => ({
            ...context,
            board: board.map((cell, i) => i === index ? player : cell),
            moves: moves + 1,
            player: changePlayer(player),
            history: [...context.history, {player, index}]
        })),
        printBoard: log(({context: {board, player}}) => [0, 1, 2]
            .map((i) => board.slice(i * 3, i * 3 + 3))
            .map((row) => row.map((cell) => isCellEmpty(cell) ? ' ' : cell).join(' | '))
            .join('\n--+---+--\n'))
    },
    guards: {
        checkWin: ({context}) => {
            const winner = getWinner(context.board);
            return !!winner;
        },
        checkDraw: ({context}) => {
            return context.moves === 9;
        },
        isValidMove: ({context, event}, params: number) => {
            return isCellEmpty(context.board[params]);
        },
    },
}).createMachine({
    initial: 'playing',
    context: {
        printedBoard: "",
        board: Array(9).fill('empty'),
        moves: 0,
        player: 'x' as Player,
        history: [] 
    },
    meta: {
        name: 'TicTacToe',
        description: 'A simple tic tac toe game',
    },

    entry: render(({html, stream}) => html`
        <main class="mx-auto  bg-slate-50 h-screen"  >
            <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                Tic Tac Toe
            </header>
            <section class="p-5">
                <div class="flex justify-center relative">
                    <div class="grid grid-cols-3 grid-rows-3 *:w-20 *:h-20 *:md:w-32  *:md:h-32  *:text-3xl *:flex *:justify-center *:items-center ">
                        <div sse-swap="c:0"/>
                        <div sse-swap="c:1" class="border-x border-black"/>
                        <div sse-swap="c:2"/>
                        <div sse-swap="c:3" class="border-y border-black"/>
                        <div sse-swap="c:4" class="border border-black"/>
                        <div sse-swap="c:5" class="border-y border-black"/>
                        <div sse-swap="c:6" />
                        <div sse-swap="c:7" class="border-x border-black"/>
                        <div sse-swap="c:8"/>
                    </div>
                </div>
            </section>
            <div hx-ext="sse" sse-swap="report"  class="flex  flex-row-reverse *:p2 "/> 
        </main>
    `),
    states: { 
        playing: {
            always: [
                {target: 'gameOver.winner', guard: 'checkWin'},
                {target: 'gameOver.draw', guard: 'checkDraw'},
            ],
            initial: 'o',
            states: {
                x: {
                    invoke: {
                        src: 'ai',
                        id: 'x',
                        input: {
                            template: `You are playing as x in a game of tic tac toe. This is the current game state. The 3x3 board is represented by a 9-element array.
                             you are playing as {{player}}. board state is "{{board}}", you can only play on empty cells which are represented by 'empty'.
                             play the best move to win the game.`,
                            tools: {
                                'play': playTool()
                            }
                        }
                    },
                    on: {
                        'tool-call': [
                            {
                                target: 'o',
                                guard: {type: 'isValidMove', params: ({event: {args: {index}}}) => index},
                                actions: [
                                    emit(({event: {args: {index}}}) => ({
                                        type: "assign",
                                        event: `c:${index}`,
                                        data: "x"
                                    })),
                                    {type: 'updateBoard', params: ({event: {args: {index}}}) => ({index, player: 'x'})},

                                ]

                            },
                            {target: 'x', reenter: true},
                        ] 
                    }
                },
                o: {
                    invoke: {
                        src: 'ai',
                        id: 'o',
                        input: {
                            template: `You are playing as x in a game of tic tac toe. This is the current game state. The 3x3 board is represented by a 9-element array.
                             you are playing as {{player}}. board state is "{{board}}", you can only play on empty cells which are represented by 'empty'.
                             play the best move to win the game.`,
                            tools: {
                                'play': playTool()
                            }
                        }
                    },
                    on: {
                        'tool-call': [
                            {
                                target: 'x',
                                guard: {type: 'isValidMove', params: ({event: {args: {index}}}) => index},
                                actions: [emit(({event: {args: {index}}}) => ({
                                    type: "assign",
                                    event:  `c:${index}`,
                                    data: "o"
                                })), {
                                    type: 'updateBoard',
                                    params: ({event: {args: {index}}}) => ({index, player: 'o'})
                                }]
                            },
                            {target: 'o', reenter: true},
                        ] 
                    }
                }
            }
        },
        gameOver: {
            initial: 'winner',
            states: {
                winner: {
                    entry: renderTo('report', ({context: {board}, html, stream}) => html`
                        <div class="mt-4  block shadow-2xl mb-4 p-2">
                            <h2 class="text-xl font-semibold">Game Report</h2>
                            <div ext="sse" sse-swap="message" sse-connect="${stream.href}/events/@report.text-delta"/>
                        </div>
                    `),
                    invoke: {
                        src: 'ai',
                        id: 'report',
                        input: {
                            template: `Provide a short game report analyzing the game. board: """{{board}}""". history:"""{{#history}}{{player}}=>{{index}},{{/history}}"""`,

                        }
                    },
                    tags: 'winner',
                },
                draw: {
                    entry: renderTo('report', ({ html, stream}) => html`
                        <div class="mt-4  block shadow-2xl mb-4 p-2 ">
                            <h2 class="text-xl font-semibold float-left">It's a draw</h2>
                          <div  >
                       `),
                        
                    tags: 'draw',
                },
            }


        }
    }
});



 