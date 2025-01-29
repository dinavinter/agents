import * as Y from "yjs";
import { type EventObject, type InspectedEventEvent, type SnapshotFrom, type AnyStateMachine } from "xstate";
import { yArrayIterator } from "@/yjs";


export type Emitted= {
    id?: string,
    format?: string,
    data?: any,
    type: string,
    offset?: number // milliseconds after start
    timestamp: number //actual time of event, milliseconds since epoch
    defer?: number // milliseconds to defer event
} & EventObject


export function createYjsHub(doc?:Y.Doc  | undefined) {
    doc = doc || new Y.Doc();
    function emit (emitted: Y.Array<Emitted>, event: Emitted){
        emitted.push([event]); 
    }
    return {
        doc: doc,
        emit: emit.bind(null, doc.getArray<Emitted>('emitted')),
        inspected: yArrayIterator(doc.getArray<InspectedEventEvent>('inspection')),
        emitted: yArrayIterator(doc.getArray<Emitted>('emitted')),
        snapshot: yArrayIterator(doc.getArray<SnapshotFrom<AnyStateMachine>>('snapshot')),
        array (key: string) {
            return yArrayIterator(doc.getArray(key));
        },
        
        get state(){
            return {
                next: doc.getMap('current').get('next') as string,
                state: doc.getMap('current').get('state')as string,
                event: doc.getMap('current').get('event')as string,
                context: doc.getMap('current').get('context')as string,
            }
        } ,
        set state(value: {next: string, state: string, event: string , context: string}) {
            doc?.transact(() => {
                doc.getMap('current').set('next', value.next);
                doc.getMap('current').set('state', value.state);
                doc.getMap('current').set('event', value.event);
                doc.getMap('current').set('context', value.context);
            })
        },
        children: doc.getMap<Y.Doc>('children'),
        child(id: string) {
            if (doc?.getMap<Y.Doc>('services').get(id)) {
                return {
                    isNew: false,
                    hub: createYjsHub(doc?.getMap<Y.Doc>('services').get(id)!)
                }
            }
            return {
                hub: createYjsHub(doc?.getMap<Y.Doc>('services').set(id, new Y.Doc())),
                isNew: true
            }
        }  
        
       
    }
}


export type serviceHub =   ReturnType<typeof createYjsHub>;
