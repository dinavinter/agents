import * as Y from "yjs";
import {YMapEvent} from "yjs";

type FromIterable<T> = T extends Iterable<infer U> ? U : never;
type FromYMap<T extends Y.Map<any>> =   FromIterable<ReturnType<YMapEvent<T>["keys"]["entries"]>>;
export async function * yMapIterate<T extends Y.Map<any>>(comp: T):AsyncGenerator<FromYMap<T>> {
    const entries = comp.toJSON();
    console.debug("entries", entries);
    for (const [key, value] of Object.entries(entries)) {
        yield [key, {
            oldValue:undefined,
            newValue:value,
            action: "add" as const,
        }];
    }
    const next = () => new Promise<[string, any][]>((resolve) => {

        function onUpdate(event: Y.YMapEvent<T>) {
            resolve(Array.from(event.keys.entries()));
            comp.unobserve(onUpdate);
        }

        comp.observe(onUpdate);
    })
    while (true) {
        const entries = await next();
        for (const entry of entries) {
            yield entry;
        }
    }
}