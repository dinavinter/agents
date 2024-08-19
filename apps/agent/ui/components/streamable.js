import {c, css, h, html, useCallback, useEffect, useHost, useMemo, useProp, useRef, useState} from "atomico";
import {useRender, useSlot} from "@atomico/hooks";
   
const useTemplateRef = () => {
    const templateRef = useRef();
    const template = useSlot(templateRef);
    return [templateRef, template.map((t) => t)];
}
function component({ src}) {
    
    const [templateRef, templates]= useTemplateRef();
     const [state, setState] = useState([]);
    const callback=useCallback((event) => {
        const node= JSON.parse(`${event.data}`);
        const fragment = document.createElement(node.type); 
        fragment.innerHTML = node.innerHTML;
        Object.assign(fragment, node.props); 
        console.debug("streamable:callback", {fragment,node}) 
        setState(s=> s.concat(fragment)); 
    }, []);

    const source= useMemo(()=> {
         return typeof EventSource !== "undefined" && new EventSource(src)
    }, [src]);

    useEffect(async () => {
         source.onmessage = callback
    }, [source, callback]);
    
   useRender(() => {
      console.debug("streamable:render", state)
      return state.map((T) => html`<${T}  />` )
    })  
   
    return html`<host shadowDom> 
        <template>
            <slot name="template" ref="${templateRef}"/>
        </template>
        ${templates.map((T) => html`<${T} cloneNode />`)}
   </host>`;
}
component.props = {
    src: { type: String, value: "" },
};

component.styles = css`
	@tailwind base;
	@tailwind components;
	@tailwind utilities;
	@tailwind screens;


`;


export  const Streamable = c(component);

customElements.define('c-stream', Streamable);
