import {c, css, html,  useEffect, useMemo,  useRef, useState} from "atomico";
import { useRender} from "@atomico/hooks";
    

function component({src}) {
    const [state, setState] = useState([]); 
    const refSpan = useRef();
    const source= useMemo(()=> {
        console.log("create event source", src)
        return  new EventSource(src)
    }, [src]);
    
     useEffect(async () => {
         console.log("useEffect event source")
        source.onmessage =  function (event) {
            setState(s=> s.concat(event.data))
        }
    }, [source]);
     
     // usePropProxy("empty", {
     //     get: () => refSpan.current.empty
     // })
    
     useRender(() => html`<pre   ref="${refSpan}">${state}</pre>`)
         

    return html`<host shadowDom>
        <slot></slot>
    </host>`;
      
   
  
    
}

component.props = {
    src: { type: String, value: "" , reflect: true },
    default: { type: String, value: "" },
     hasValue: { type: Boolean, value: false, reflect: true, attribute: "has-value" }
};

component.styles = css`
    :host{
        display: inline;
        height: 100%;
        width: 100%;
        
    }
  
`;

export  const TextStream = c(component);

customElements.define('c-text-stream', TextStream);
