import {createStore} from "@atomico/store";
import {pushable} from "it-pushable";

export const EventSourceStore = createStore( {});

export function getOrCreate(store, src) {
    if (!store[src]) {
        store[src] = createStream(src);
    }
    return store[src];
}
export function createStream(src) {
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

export async function* toJsonAsync (stream){
    for await (const chunk of stream) {
        yield JSON.parse(chunk);
    }
}


/*

 
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


 */