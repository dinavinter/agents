type WithAction<T> = T & { action: "add" | "delete" };
import * as Y from "yjs";
import { YEvent } from "yjs";
export class YDocStream {
    constructor(public doc: Y.Doc) {}

    async * subdocs(abortSignal?: AbortSignal) :AsyncGenerator<WithAction<Y.Doc>>{

        console.log("YDocStream:subdocs", this.doc.guid);
        const doc = this.doc;
        console.log("YDocStream:subdocs:async", this.doc.guid, doc.subdocs);

        const subdocs = new Set<Y.Doc>(doc.subdocs);

        const add = (doc: Y.Doc) => Object.assign(doc, {action: "add" as const});
        const remove = (doc: Y.Doc) => Object.assign(doc, {action: "delete" as const});
        for (const doc of subdocs) {
            console.log("YDocStream:subdocs:doc", doc.guid, subdocs);
            yield add(doc);
        }
        const next = () => new Promise<WithAction<Y.Doc>[]>((resolve) => {
            if (doc.subdocs.difference(subdocs) || subdocs.difference(doc.subdocs)) {
                resolve([
                    ...Array.from(doc.subdocs.difference(subdocs)).map(add),
                    ...Array.from(subdocs.difference(doc.subdocs)).map(remove)
                ]);
            }


            function onUpdate(event: { added: Set<Y.Doc>, removed: Set<Y.Doc> }) {
                event.added.forEach(subdocs.add);
                event.removed.forEach(subdocs.delete);
                resolve([
                    ...Array.from(event.removed).map(remove),
                    ...Array.from(event.added).map(add)
                ])
                doc.off("subdocs", onUpdate);
            }

            doc.on("subdocs", onUpdate);
        })
        while (abortSignal?.aborted !== true) {
            const docs = await next();
            for (const doc of docs) {
                yield doc;
            }
        }
    }

    async * componentsAsync(abortSignal?: AbortSignal): AsyncGenerator<[string, Y.AbstractType<YEvent<any>>]> {
        const components = new Map<string, Y.AbstractType<YEvent<any>>>();
        const doc= this.doc;

        function waitForNewComponents(): Promise<[string, Y.AbstractType<YEvent<any>>][]> {
            return new Promise((resolve) => {
                const newComponents = getNewEntries();
                if (newComponents.length) {
                    resolve(newComponents);
                } else {
                    doc.on('update', onDocUpdate);
                }

                function getNewEntries() {
                    return Array.from(doc.share.entries()).filter(([name]) => !components.has(name));
                }

                function onDocUpdate() {
                    const newComponents = getNewEntries();
                    if (newComponents.length) {
                        doc.off('update', onDocUpdate);
                        resolve(newComponents);
                    }
                }
            });

        }

        while (abortSignal?.aborted !== true) {
            const newComponents = await waitForNewComponents();
            for (const comp of newComponents) {
                yield comp;
            }
        }
        return "done";
    }
    
     

}