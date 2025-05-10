import * as Y from "yjs";
import {YMapEvent} from "yjs";

type FromIterable<T> = T extends Iterable<infer U> ? U : never;
type FromYMap<T extends Y.Map<any>> =   FromIterable<ReturnType<YMapEvent<T>["keys"]["entries"]>>;


type MapChange<T> = [key:string, {      
    oldValue: T | undefined;
    newValue: T;
    action: "add" | "update" | "delete";
    origin?: any;
}];
/**
 * Iterate over a Y.Map and yield changes
 * @param map  
 * @returns 
 */
export async function * yMapIterate<TItem, TMap extends Y.Map<TItem> = Y.Map<TItem>>(map: TMap):AsyncGenerator<MapChange<TItem>> {
    const entries = map.toJSON();
    console.debug("entries", entries);
    for (const [key, value] of Object.entries(entries)) {
        yield [key, {
            oldValue:undefined,
            newValue:value,
            action: "add" as const,
        }];
    }
    const next = () => new Promise<MapChange<TItem>[]>((resolve) => { 
        function onUpdate(event: Y.YMapEvent<TItem>) {
            resolve(Array.from(event.keys.entries()).map(([key, value]) => [key, {
                ...value,
                origin: event.transaction?.origin,
            }])); 
            map.unobserve(onUpdate);
        }

        map.observe(onUpdate);
    })
    while (true) {
        const entries = await next();
        for (const entry of entries) {
            yield entry;
        }
    }

   
}