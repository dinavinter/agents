import {c, css, html, useCallback, useEffect, useHost, useMemo, useProp, useState} from "atomico";
import {useRender} from "@atomico/hooks";
   

function component({ src}) {
    const [state, setState] = useState([]);
    const callback=useCallback((event) => {
        console.log("streamable update host callback", {data:event.data})
        const div = document.createElement("div");
        div.style.width = "100%";
        div.style.height = "100%";
        div.innerHTML = event.data;
        setState(s=> s.concat(div)); 
    }, []);

    const source= useMemo(()=> {
        console.log("streamable create event source", src)
        return typeof EventSource !== "undefined" && new EventSource(src)
    }, [src]);

    useEffect(async () => {
        console.log("streamable useEffect event source")
        source.onmessage = callback
    }, [source, callback]);
    
  useRender(() => {
      console.log("streamable render", state)
      return state.map((T) => html`<${T} />` )
    }) 
   
    return html`<host shadowDom> 
        <slot/>
  </host>`;
}

component.props = {
    src: { type: String, value: "" },
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
