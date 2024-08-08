import {c, css, html, useCallback, useEffect, useMemo, useRef, useState} from "atomico";
    

function component({src, default: defaultValue}) {
    const [state, setState] = useState([]); 
    const span = useRef();
    // const callback=useCallback((event) => {
    //     if(span.current){
    //         setState(s=> s.concat(event.data));
    //         // span.current.textContent += event.data
    //     }
    //  });
    
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
    
  
    return html`<host shadowDom> 
        <span ref="${span}" />
        <span>${state}</span>
     </host>`;
}

component.props = {
    src: { type: String, value: "" },
    default: { type: String, value: "" },
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
