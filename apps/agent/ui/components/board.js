import {c, html} from "atomico";

export const Board =c( ({c0, c1,c2, c3, c4, c5, c6, c7,c8}) => {
    return html`<host >
        <section class="p-5">
            <div class="flex justify-center relative">
                <div class="board grid grid-cols-3" id="board">
                    <div id="0" class="cell w-20 h-20 md:w-32 md:h-32 text-3xl flex items-center justify-center">${c0}</div>
                    <div id="1" class="cell border-x border-black w-20 h-20 md:w-32 md:h-32 text-3xl flex items-center justify-center">${c1}</div>
                    <div id="2" class="cell w-20 h-20 md:w-32 md:h-32 text-3xl flex items-center justify-center">${c2}</div>
                    <div id="3" class="cell border-y border-black w-20 h-20 md:w-32 md:h-32 text-3xl flex items-center justify-center">${c3}</div>
                    <div id="4" class="cell border border-black w-20 h-20 md:w-32 md:h-32 text-3xl flex items-center justify-center">${c4}</div>
                    <div id="5" class="cell border-y border-black w-20 h-20 md:w-32 md:h-32 text-3xl flex items-center justify-center">${c5}</div>
                    <div id="6" class="cell w-20 h-20 md:w-32 md:h-32 text-3xl flex items-center justify-center">${c6}</div>
                    <div id="7" class="cell border-x border-black w-20 h-20 md:w-32 md:h-32 text-3xl flex items-center justify-center">${c7}</div>
                    <div id="8" class="cell w-20 h-20 md:w-32 md:h-32 text-3xl flex items-center justify-center">${c8}</div>
                </div>

                <div id="win-line"></div>
            </div>
        </section>

        <!-- Board Players -->
        <section class="mb-5 pb-12 flex items-center justify-center">
            <ul role="list" class="mt-10 grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-20">
                <li>
                    <div class="flex items-center gap-x-1 relative"> 
                        <div class="ml-4">
                            <h3 id="player-x-name" class="text-base front-semibold leading-7 tracking-tight text-gray-900 animate-bounce">Player X</h3>
                            <p class="text-xs text-gray-500">Score: <span id="player-x-score">0</span></p>
                        </div>
                    </div>
                </li>

                <li>
                    <div class="flex items-center gap-x-1 relative">
                        <div class="ml-4">
                            <h3 id="player-o-name" class="text-base front-semibold leading-7 tracking-tight text-gray-900">Player O</h3>
                            <p class="text-xs text-gray-500">Score: <span id="player-o-score">0</span></p>
                        </div>
                    </div>
                </li>
            </ul>
        </section>

        <!-- Draw Modal -->
        <div id="draw-modal" class="ignore relative z-10 hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

            <div class="fixed inset-0 z-10 overflow-y-auto">
                <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    <div class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
                        <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <div class="sm:flex sm:items-start">
                                <div class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                                    <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                    </svg>
                                </div>
                                <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                                    <h3 class="text-base font-semibold leading-6 text-gray-900" id="modal-title">Game ended in a draw!</h3>
                                    <div class="mt-2">
                                        <p class="text-sm text-gray-500">The game has ended in a draw. Both players have played their best
                                            moves but neither has been able to claim victory. Don't worry though, there's always a chance for
                                            a rematch. Keep practicing your Tic Tac Toe skills and try again soon.</p>
                                        <p class="text-sm text-gray-500 mt-3">Thanks for playing and we hope you enjoyed the game!</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="bg-gray-50 px-4 py-3 flex justify-end sm:px-6">
                            <button id="alright-action" type="button" class="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto">Alright</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="bg-white p-8 rounded-lg  shadow-md max-w-md w-1/3">
        <div class="grid grid-cols-3 gap-4 text-center *:square *:bg-gray-200">
            <div>${c0}</div>
            <div>${c1}</div>
            <div>${c2}</div>
            <div>${c3}</div>
            <div>${c4}</div>
            <div>${c5}</div>
            <div>${c6}</div>
            <div>${c7}</div>
            <div  class="square bg-gray-200">${c8}</div>
        </div>
            <div id="status" class="mt-6 text-gray-900  text-center"></div> 
            <div class="flex justify-center mt-4">
                <button  class="bg-blue-500 text-white py-2 px-4 rounded-md 
                hover:bg-blue-600 focus:outline-none focus:ring-2 
                focus:ring-blue-600 focus:ring-offset-2 transition 
                duration-300 ease-in-out transform hover:scale-105">
                    Restart
                </button>
            </div>
        </div>
    </host>`
},{
    props: {
        c0: {type: String, value: " "},
        c1: {type: String, value: " "},
        c2: {type: String, value: " "},
        c3: {type: String, value: " "},
        c4: {type: String, value: " "},
        c5: {type: String, value: " "},
        c6: {type: String, value: " "},
        c7: {type: String, value: " "},
        c8: {type: String, value: " "}
    }
})

customElements.define('tictac-board', Board);