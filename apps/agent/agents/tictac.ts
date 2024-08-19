import {assign, setup, log, enqueueActions, emit} from 'xstate';
import {z} from 'zod';
import { fromAIEventStream, openaiGP4o} from "../ai";
import {TextStreamPart, tool} from "ai";
import {Html, RenderStream, StreamOptions} from "../ui/render";
import {c, html} from "atomico";
import { Board } from '../ui/components/board';
 

type Player = 'x' | 'o';
type Cell = Player | 'empty';
type Board = Array<Cell>;


/*thoughts
 <div>
    <h2>AI X</h2>
    <${stream.service('x').event("thought").text}/>
</div>
<div>
    <h2>AI O</h2>
    <${stream.service('o').event("thought").text}/>
</div>
 */
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
            printedBoard: string,
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
        printBoard: enqueueActions(({context: {board, player}, enqueue}) => {
            const printed= [0,1,2]
                .map((i)=>board.slice(i*3,i*3+3))
                .map((row)=>row.map((cell)=>isCellEmpty(cell) ? ' ' : cell).join(' | '))
                .join('\n--+---+--\n')
           
            enqueue.assign({printedBoard: printed});
            enqueue.emit({data:JSON.stringify(board.reduce( (acc, cell,i)=>{
                  acc[`c${i}`] = isCellEmpty(cell) ? ' ' : cell;
                  return acc;
                }, {} as Record<string, string>)), type:"board"});
            log(()=>printed); 

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
        printedBoard: "",
        board: Array(9).fill("empty") ,
        moves: 0,
        player: 'x' as Player,
        gameReport: '',
        history: []
    },
    meta: {
        name: 'TicTacToe',
        description: 'A simple tic tac toe game',
        render: ({ stream}:{stream: RenderStream, html:Html })=> html`
            <main class="mx-auto  bg-slate-50" id="canvas">
                <!-- Header -->
                <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                    Tic Tac Toe
                </header>
                <div class="mt-4 has-[pre:empty]:hidden block shadow-md mb-4">
                    <h2 class="text-xl font-semibold">Game Report</h2>
                    <${stream.service('report').event("text-delta").text} class="text-gray-700"/>
                </div>
                <${stream.event("board").json} >
                    <${Board} slot="template" class="shadow-2xl"></${Board}>
                </${stream.event("board").json}> 
               
            </main>
        `

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
                        id: 'x',
                        syncSnapshot:true,
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
                                guard: {type: 'isValidMove', params: ({event:{args: {index}}}) => index},
                                actions: {type: 'updateBoard', params: ({event:{args: {index}}}) => ({index, player: 'x'})},
                            },
                            {target: 'x', reenter: true},
                        ],
                        // 'text-delta': {
                        //     actions:emit( ({event:{textDelta}}) => ({
                        //         type: '@x.thought',
                        //          data: textDelta
                        //     }))
                        // }
                    }
                },
                o: {
                    entry: 'printBoard',
                    invoke: {
                        src: 'ai',
                        id: 'o',
                        syncSnapshot:true,
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
                                guard: {type: 'isValidMove', params: ({event:{args: {index}}}) => index},
                                actions: {type: 'updateBoard', params: ({event:{args: {index}}}) => ({index, player: 'o'})},
                            },
                            {target: 'o', reenter: true},
                        ],
                        // 'text-delta': {
                        //     actions:emit( ({event:{textDelta}}) => ({
                        //         type: '@o.thought',
                        //         data: textDelta
                        //     }))
                        // }
                    }
                }
            }
        },
        gameOver: {
            initial: 'winner',
            invoke: {
                src: 'ai',
                id: 'report',
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



 