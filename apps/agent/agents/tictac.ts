import {assign, setup,  log} from 'xstate';
import {z} from 'zod';
import { fromAIEventStream, openaiGP4o} from "../ai";
import {TextStreamPart, tool} from "ai";
 

type Player = 'x' | 'o';
type Cell = Player | 'empty';
type Board = Array<Cell>;

function isCellEmpty(cell: Cell): cell is "empty" {
    return cell === "empty";
}
function getWinner(board: Board): Player | false {
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
        if (!isCellEmpty(board[a] ) && board[a] === board[b] && board[a] === board[c]) {
            return board[a]!;
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
            board: Board,
            moves:  number,
            history: {player: Player, index: number}[],
            player: Player,
            gameReport: string
        },
        events: {} as TextStreamPart<any>
    },
    actors: { 
        ai: fromAIEventStream({
            model: openaiGP4o() 
        })
    },
    actions: {
        updateBoard: assign(({context:{board,moves, ...context}},  {index, player}: {index: number, player: Player})=>({
            ...context,
            board:board.map((cell, i) => i === index ?  player: cell),
            moves: moves + 1,
            player: changePlayer(player),
            history: [...context.history, {player, index}]
        })),
        printBoard: log(({context: {board}}) => { 
           return [0,1,2]
                .map((i)=>board.slice(i*3,i*3+3))
                .map((row)=>row.map((cell)=>isCellEmpty(cell) ? ' ' : cell).join(' | '))
                .join('\n--+---+--\n')
        })
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
            return isCellEmpty(context.board[params] );
        },
    },
}).createMachine({
    initial: 'playing',
    context: {
        board: Array(9).fill("empty") ,
        moves: 0,
        player: 'x' as Player,
        gameReport: '',
        history: []
    },
 
    states: {
        playing: {  
            always: [
                {target: 'gameOver.winner', guard: 'checkWin'},
                {target: 'gameOver.draw', guard: 'checkDraw'},
            ],
            initial: 'x',
            states: {
                x: {
                    entry: 'printBoard', 
                    invoke:{
                        src: 'ai',
                        id: 'ai.x',
                        syncSnapshot:true,
                        input: {
                            template: `You are playing as x in a game of tic tac toe. This is the current game state. The 3x3 board is represented by a 9-element array.
                             you are playing as {{player}}. board state is "{{board}}", The value of 'x' means that the cell is occupied by an x. The value of 'o' means that the cell is occupied by an o.
                             empty cells are represented by 'empty'.
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
                                guard: {type: 'isValidMove', params: ({event:{args: {index}}}) => index},
                                actions: {type: 'updateBoard', params: ({event:{args: {index}}}) => ({index, player: 'x'})},
                            },
                            {target: 'x', reenter: true},
                        ]
                    }
                },
                o: {
                    entry: 'printBoard',
                    invoke: {
                        src: 'ai',
                        id: 'ai.o',
                        syncSnapshot:true,
                        input: {
                            template: `You are playing as x in a game of tic tac toe. This is the current game state. The 3x3 board is represented by a 9-element array.
                             you are playing as {{player}}. board state is "{{board}}", play the best move to win the game.`,
                            tools: {
                                'play': playTool()
                            }
                        }
                    },
                    on: {
                        'tool-call': [
                            {
                                target: 'x',
                                guard: {type: 'isValidMove', params: ({event:{args: {index}}}) => index},
                                actions: {type: 'updateBoard', params: ({event:{args: {index}}}) => ({index, player: 'o'})},
                            },
                            {target: 'o', reenter: true},
                        ],
                    }
                }
            }
        },
        gameOver: {
            initial: 'winner',
            invoke: {
                src: 'ai',
                syncSnapshot:true,
                input: {
                    template: `Provide a short game report analyzing the game. board: """{{board}}""". history:"""{{#history}}{{player}}=>{{index}},{{/history}}"""`,
                    
                }
            },
            on: {
                'text-delta': {
                    actions: assign({
                        gameReport: ({context, event: {textDelta}}) => context.gameReport + (textDelta ?? '')
                    }),
                } 
            },
            states: {
                winner: {
                    tags: 'winner',
                },
                draw: {
                    tags: 'draw',
                },
            }


        }
    }
});



 