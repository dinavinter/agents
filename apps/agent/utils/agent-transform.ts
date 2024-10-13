import * as Y from "yjs";
import vm from "node:vm";
import {StateMachine, Subscribable, toObserver} from "xstate";

export function agentTransformer(doc:Y.Doc) {
    const code = doc.getText('code');
    const version = doc.getMap('version');
    const context = vm.createContext({
        ...doc.getMap('context').toJSON(),
        ...doc.meta,
        id: doc.guid
    });

    async function onCodeChange() {
        const machine = await transform(code.toJSON());
        const definition = machine.toJSON();
        const machineJSONStr = JSON.stringify({
            ...definition,
            version: undefined
        });
        definition.version = await textHash(machineJSONStr);
        const verDoc = new Y.Doc({
            guid: definition.version,
            meta: {
                version: definition.version,
                created: new Date().toISOString()
            }
        });
        verDoc.getText('logic').insert(0, machineJSONStr);
        version.set(definition.version, verDoc);
        version.set('latest', verDoc);

    }

    async function transform(code: string) {
        const mod = new vm.SourceTextModule(code, {
            identifier: doc.guid,
            context
        });

        // Execute any imperative statements in the module's code.
        await mod.evaluate();

        if("machine" in mod.namespace && mod.namespace.machine instanceof StateMachine) {
            // The namespace includes the exports of the ES module.
            return  mod.namespace.machine
        }
        throw new Error(`No machine exported from ${doc.guid}`);

    }

    code.observe(onCodeChange)

    return {
        disconnect() {
            code.unobserve(onCodeChange);
        },

        doc: doc,
        versions:iterateSubdocs(doc)

    }

    async function textHash(text:string ) {
        const arrayBuffer = new TextEncoder().encode(text);

        // Git prepends the null terminated text 'blob 1234' where 1234
        // represents the file size before hashing so we are going to reproduce that

        // first we work out the Byte length of the file
        const uint8View = new Uint8Array(arrayBuffer);
        const length = uint8View.length;

        // Git in the terminal uses UTF8 for its strings; the Web uses UTF16.
        // We need to use an encoder because different binary representations
        // of the letters in our message will result in different hashes
        const encoder = new TextEncoder();
        // Null-terminated means the string ends in the null character which
        // in JavaScript is '\0'
        const view = encoder.encode(`blob ${length}\0`);

        // We then combine the 2 Array Buffers together into a new Array Buffer.
        const newBlob = new Blob([view.buffer, arrayBuffer], {
            type: "text/plain",
        });
        const arrayBufferToHash = await newBlob.arrayBuffer();

        // Finally we perform the hash this time as SHA1 which is what Git uses.
        // Then we return it as a string to be displayed.
        return hashToString(await crypto.subtle.digest("SHA-1", arrayBufferToHash));


        function hashToString(arrayBuffer:ArrayBufferLike) {
            const uint8View = new Uint8Array(arrayBuffer);
            return Array.from(uint8View)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
        }

    }


    
}


function iterateSubdocs( doc:Y.Doc) :AsyncIterable<Y.Doc> & Subscribable<Y.Doc> {
    async function* iterateSubdocItems() {
        let currentIndex = 0;
        while (true) {
            const [items, nextIndex] = await getNextItems(currentIndex);
            yield* items;
            currentIndex = nextIndex;
        }

        async function getNextItems(startIndex: number):Promise<[Y.Doc[], number]> {
            function waitForNew(resolve: (value: (PromiseLike<[Y.Doc[], number]> | [Y.Doc[], number])) => void) {

                doc.once("subdocs", callback);
                function callback (event: { loaded: Set<Y.Doc>, added: Set<Y.Doc>, removed: Set<Y.Doc> }) {
                    const newItems = Array.from(event.added);
                    if (newItems.length > 0) {
                        resolve([newItems, startIndex + newItems.length]);
                    }
                    else waitForNew(resolve);
                }
            }

            return new Promise((resolve) => {
                const array = Array.from(doc.subdocs.values());
                if (startIndex < array.length) {
                    resolve([array.slice(startIndex), array.length]);
                } else {
                    waitForNew(resolve);
                }
            });
        }
    }

    return {
        [Symbol.asyncIterator]: iterateSubdocItems,
        subscribe(observerOrCallback) {
            const observer = toObserver(observerOrCallback);
            const callback = (event: { loaded: Set<Y.Doc>, added: Set<Y.Doc>, removed: Set<Y.Doc> }) => {
                const newItems = Array.from(event.added);
                newItems.forEach(item => observer.next?.(item));
            };
            doc.on("subdocs", callback);
            return {
                unsubscribe() {
                    doc.off("subdocs", callback);
                }
            };

        }


    }
}
