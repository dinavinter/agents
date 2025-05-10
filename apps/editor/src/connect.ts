import {HocuspocusProvider} from '@hocuspocus/provider';
import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from 'yjs';
const defaults = {
    url: "ws://localhost:1234",
    room: "default"
};


export const rooms= new Map<string, HocuspocusProvider &{awareness: awarenessProtocol.Awareness}>();



export function connect(url?: string, room?: string) {
    const cacheId = `${url}:${room}`;
     if (!rooms.has(cacheId)) {
       const doc = new Y.Doc({guid: room,autoLoad:true})
       const awareness = new awarenessProtocol.Awareness(doc) 
       const provider = new HocuspocusProvider({
           url: url || defaults.url,
           name: room || defaults.room,
           document: doc,
           awareness,
           connect: true,
           onConnect: () => {
            console.log("connected to", url, room)
           }
       });
       
      rooms.set(cacheId, provider as HocuspocusProvider &{awareness: awarenessProtocol.Awareness});
   }
    return rooms.get(cacheId)!;
}
