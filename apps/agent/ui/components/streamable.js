import {c, css, html, useEffect, useHost, useProp, useState} from "atomico";
   

function component({url}) {
    const [state, setState] = useState(); 
    const host =useHost();
    useEffect(async () => {
        const source = new EventSource(url);
        source.onmessage = function(event) {
           if(host.current) {
               setState(event.data);
               host.current.innerHTML += `<div >${event.data}</div>`;
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
    :host{
        display: grid;
        grid-auto-flow: dense;
        grid-column: 2;
        grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
        grid-template-rows: repeat(auto-fill, minmax(10rem, 1fr));
        height: 100%;
        width: 100%;
        
    }
  
`;

export  const Streamable = c(component);

customElements.define('c-stream', Streamable);
