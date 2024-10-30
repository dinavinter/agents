import {createMachine} from "xstate";
import {render, renderTo} from "./agent-render";
import {Header} from "./components/header";

export const machine = createMachine({
    initial: 'loading',
    context:{   
        
        agents: ['simple', 'screen', 'support', 'tictac', 'parallel'  ]
    },
   entry: render(({html}) => html`
           <main class="mx-auto  bg-slate-50 h-full" >
            <${Header} title="Agent Catalog" />
           <div  hx-ext="sse" sse-swap="content" hx-swap="beforeend" />
        </main>`
   ),
    states: {
        loading: {
            entry: renderTo('content',({html, context}) => html`
                <ul class="flex flex-col items-center justify-center *:w-1/2 *:justify-center" >
                    ${context.agents.map(agent => html`
                        <li class="p-4 m-2 bg white rounded-lg shadow-md hover:shadow-lg" >
                            <a href="/agents/${agent}" class="text-xl" >${agent}</a>
                        </li>
                    `)}
                </ul>
            `),
        }
    }
})