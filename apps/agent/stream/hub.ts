import {  EventObject, InspectedEventEvent, Snapshot, Subscribable, toObserver} from "xstate";
import * as Y from "yjs";
import {EventMessage} from "fastify-sse-v2";
 import {yArrayIterator} from "./yjs";
 


export function createYjsHub(doc?:Y.Doc) {
    doc = doc || new Y.Doc();
    return {
        inspected: yArrayIterator(doc.getArray<InspectedEventEvent>('inspection')),
        emitted: yArrayIterator(doc.getArray<EventMessage & EventObject>('emitted')),
        snapshot: yArrayIterator(doc.getArray<Snapshot<any>>('snapshot')),
        children: doc.getMap<Y.Doc>('children'),
        child(id: string) {
            if (doc?.getMap<Y.Doc>('children').get(id)) {
                return {
                    isNew: false,
                    hub: createYjsHub(doc?.getMap<Y.Doc>('children').get(id)!)
                }
            }
            return {
                hub: createYjsHub(doc?.getMap<Y.Doc>('children').set(id, new Y.Doc())),
                isNew: true
            }
        }  
    }
}


export type serviceHub =   ReturnType<typeof createYjsHub>;
