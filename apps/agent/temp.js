import {c, css, html, useProp, useState} from "atomico";
import {readStreamableValue} from "ai/rsc";
import {callCompletionApi, readDataStream} from "@ai-sdk/ui-utils";
//
export const runThread = async () => {
    'use server';
    const {createStreamableValue} = await import( 'ai/rsc');
    console.log('runThread', createStreamableValue);

    const streamableStatus = createStreamableValue('thread.init');

    setTimeout(() => {
        streamableStatus.update('thread.run.create');
        streamableStatus.update('thread.run.update');
        streamableStatus.update('thread.run.end');
        streamableStatus.done('thread.end');
    }, 1000);

    return {
        status: streamableStatus.value,
    };
};
  

const streamableStatus =  async ()=> {
    console.log('streamableStatus');

    // const {status} = await runThread();
    // console.log(status);
    //
    // for await (const value of readStreamableValue(status)) {
    //     console.log(value);
    // }
}

//   <!-- <button
//     onclick= ${streamableStatus}>
//     Ask
// </button> -->



function component() {
    const [state, setState] = useState();
    const [context, setContext] = useState();
    const [more, setMore] = useState();


    async function streamableStatus  (agent ) { 
            const abortedSignal = new AbortController();
            const agentStream = await fetch(`/agents/${agent}`);
            for await (const {
                value: [{
                    state,
                    context,
                    ...rest
                }]
            } of readDataStream(agentStream.body.getReader(), {isAborted: () => abortedSignal.signal.aborted})) {
                console.log({
                    state,
                    context,
                    ...rest
                });
                setState(state);
                setContext(context);
                setMore(rest);

            }
        }
        
     
    
    const agents= [
      'simple',
      'news',
      'support',
      'tictac',
      'raffle',
    ]
    return html`<host shadowDom>
    <h1>Atomico webcomponent</h1>
        ${agents.map(agent => 
            html`<button onclick=${() => streamableStatus(agent)}>
                ${agent}
            </button>`)
        }
        <div>
            <pre>${state}</pre>
            <pre prettytext>${context && JSON.stringify(context , null, 2)}</pre>
            <pre prettytext>${more && JSON.stringify(more, null, 2)}</pre>
        </div>
    
    <slot/>
  </host>`;
}

component.props = {
    value: { type: Number, value: 0 },
};

component.styles = css`
  :host{
    font-size: 32px;
    font-family: arial;
  }
`;

export  const Thread = c(component);

customElements.define('tr-page', Thread);
