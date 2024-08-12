import {c, css, html, useProp, useState} from "atomico";
import {readStreamableValue} from "ai/rsc";
import {callCompletionApi, readDataStream} from "@ai-sdk/ui-utils";


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
      "github"
    ]
    return html`<host shadowDom>
    <h1>AI AGents</h1>
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

export  const Agents = c(component);

customElements.define('tr-page', Agents);
