import {c, css, html, useCallback, useEffect, useMemo, useState} from "atomico";
import {pushable} from "it-pushable";
import {createStore, useProviderStore, useStore} from "@atomico/store";




export const Snapshot = c(function ({ context, value, status,tags }) {
    return html`
        <host shadowDom>
            <div >
                <pre>${status}</pre>
                <h2>context: </h2> <pre prettytext>${context && JSON.stringify(context, null, 2)}</pre>
                <h2 >state: </h2><pre prettytext>${value && JSON.stringify(value, null, 2)}</pre>
                <h2 >tags: </h2><pre>${tags && JSON.stringify(tags, null, 2)}</pre>
            </div> 
            <slot name="${value}"></slot>
        </host>`
},{
    props: {
        context: {
            type: Object,
            reflect: true
        },
        value: {
            type: String,
            reflect: true
        },
        status: {
            type: String,
            reflect: true
        },
        tags: {
            type: Object,
            reflect: true
        }
    },
    styles: css`
        @tailwind base;
        @tailwind components;
        @tailwind utilities;
        @tailwind screens;
        `
        
});
customElements.define('c-snapshot', Snapshot);



const EventSourceStreamMap = new Map();


const EventSourceStore = createStore( {});

function getOrCreate(store, src) {
    if (!store[src]) {
        store[src] = createStream(src);
    }
    return store[src];
}
function createStream(src) {
    const stream = pushable({objectMode: true});
    if(typeof EventSource !== "undefined") {
        const source = new EventSource(src);
        source.onmessage = (event) => stream.push(event.data);
        source.onerror = (event) => {
            console.error(event);
            // stream.end();
        }
        return {stream, source };
    }
    return {stream };
}



function useEventSource   (src) { 
     const store = useProviderStore(EventSourceStore,state=>{
    
         return state[src] || createStream(src);
        }, src); 

     return store.stream; 
 }
 async function* toJsonAsync (stream) {
     for await (const chunk of stream) {
         yield JSON.parse(chunk);
     }
 }
    
 
 function useFetchJSONStream(src) {
     const stream = useMemo(() => pushable({objectMode: true}), [src]);
     useEffect(async () => {
         const agentStream = await fetch(src, {headers: {accept: "application/json"}});
         for await (const chunk of agentStream.body.pipeThrough(new TextDecoderStream())) {
             stream.push(JSON.parse(chunk));
         }
     }, [src]);
     return stream;
 }


    export const SnapshotReader = c(function ({ src }) {
    const [status, setStatus] = useState("disconnected");
    const [context, setContext] = useState({});
    const [value, setValue] = useState(undefined);
      const [tags, setTags] = useState({});
      const {stream}= getOrCreate(useStore(EventSourceStore),src);


        useEffect(async () => {
        for await (const {status:s, context:c, tags:t,  value:v} of toJsonAsync(stream)) {
            // Do something with each chunk
            // Here we just accumulate the size of the response.
            console.log(status, context, tags, value);
            if (c !== context && c !== undefined) {
                setContext(c);
            }
            if (s !== status) {
                setStatus(s);
            }
            if (v !== value) {
                setValue(v);
            }
            if (t !== tags && t !== undefined) {
                setTags(t);
            }
        }
 
    })
    
    

    return html`
        <host shadowDom> 
          <${Snapshot}  tags="${tags}" context="${context}" status="${status}" value="${value}" />
        </host>
`},{
    props: {
        src: String,
    },
    styles: css`
        @tailwind base;
        @tailwind components;
        @tailwind utilities;
        @tailwind screens;
        `
        

});

customElements.define('c-snapshot-reader', SnapshotReader);
        