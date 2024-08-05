import {c, css, html, useEffect, useHost, useProp, useState} from "atomico";
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



function component({url}) {
    const [state, setState] = useState(); 
    const host =useHost();
    useEffect(async () => {
        const source = new EventSource(url);
        source.onmessage = function(event) {
           if(host.current) {
               setState(event.data);
               host.current.innerHTML += event.data + "<br>";
           }
        };

    }, [url]);
        
    return html`<host shadowDom> 
    <slot/>
  </host>`;
}

component.props = {
    url: { type: String, value: "" },
};

component.styles = css`
  
`;

export  const Streamable = c(component);

customElements.define('c-stream', Streamable);
