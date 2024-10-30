import {c, css, html, useEffect, useRef, useState} from "atomico";
import {useRender, useSlot} from "@atomico/hooks";
import {useStore} from "@atomico/store";
import {EventSourceStore, getOrCreate} from "./store.js";


//@param {AsyncIterable<string>} stream
//@return {AsyncIterable<object>}
export async function* toJsonAsync (stream){
    for await (const chunk of stream) {
        yield JSON.parse(chunk);
    }
}

export const JsonStream= c(({src} )=>{
    const refSlotTemplate = useRef();
    const [Template] = useSlot(refSlotTemplate);
    const [props, setProps]= useState({});
    const {stream}= getOrCreate(useStore(EventSourceStore),src);
 
    
    useEffect(async () => {
        for await (const props of toJsonAsync(stream)) { 
            console.debug("json:props", props, Template)
             setProps(props); 
        } 
    })

    
    useRender(() => {
        console.debug("json:render", Template, props)
        return  Template && html`<${Template}   ...${props} />`
    }); 
    return html`<host shadowDom>
        <slot ref=${refSlotTemplate} name="template"/>  
   </host>`;
},{
    props: {
        src: { type: String , reflect: true },
    },
})

customElements.define('c-json', JsonStream);
 
function component({ src}) {

    const refSlotTemplate = useRef();
    const templates = useSlot(refSlotTemplate);
    const refContainerTemplate = useRef();
    const containerTemplate = useSlot(refContainerTemplate);

    const [state, setState] = useState([]); 
    const [container, setContainer]= useState([html`<div><slot></slot></div>`.render()]);

    const {stream}= getOrCreate(useStore(EventSourceStore),src);

    useEffect(async () => {
        for await (const props of toJsonAsync(stream)) { 
            setState((s)=>[...s, ...templates.map((Template) => {
                return html`<${Template} slot="" ...${props} cloneNode />`.render();
             })])
        }

    })
    
    useEffect(() => {
        if (containerTemplate.length) {
            setContainer(containerTemplate.map((T) => html`<${T}  cloneNode/>`.render() ));
        }
    }, [containerTemplate]);
    
    useRender(() => {
        console.debug("streamable:render", state)
        return state.slice(0,2).map((T) => html`<${T}  />` ) 
    }); 
    return html`<host shadowDom> 
        <template >
            <slot ref=${refSlotTemplate} name="item-template"/>
            <slot ref=${refContainerTemplate} name="container-template" />
        </template>
        ${container.map (c=> html`<${c  }   cloneNode  />`)}
          
   </host>`;
}
component.props = {
    src: { type: String, value: "", reflect: true },
};

component.styles = css`
	@tailwind base;
	@tailwind components;
	@tailwind utilities;
	@tailwind screens;


`;


export  const JsonStreamLog = c(component);

customElements.define('c-json-stream', JsonStreamLog);




