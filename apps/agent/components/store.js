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
 