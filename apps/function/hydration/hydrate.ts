import {
    fromEventAsyncGenerator,
    yArrayIterator,
} from "https://esm.sh/@cxai/stream@1.0.17?target=esnext&yjs=13.6.20";
import { createActor, initialTransition, transition } from "https://esm.sh/xstate@5.19.2?target=esnext";
import type {
    AnyStateMachine,
    EventObject,
    InspectionEvent,
    Observer,
    Snapshot,
} from "https://esm.sh/xstate@5.19.2?target=esnext";

import * as Y from "https://esm.sh/yjs@^13.6.20?target=esnext";

function hydrate(doc: Y.Doc) {
    return {
        restore() {
            return doc.getMap("@snapshot").has("value")
                ? doc.getMap("@snapshot").toJSON() as Snapshot<AnyStateMachine>
                : undefined;
        },

        restoreFromEvents(machine: AnyStateMachine) {
            let [nextState, actions] = initialTransition(machine);
            for (const event of doc.getArray<EventObject>("@events").toArray()) {
                [nextState, actions] = transition(machine, nextState, event);
            }
            return nextState;
        },

        live() {
            return fromEventAsyncGenerator(async function*() {
                const input = doc.getArray<EventObject>("@input");
                const handled = doc.getMap<EventObject>("@handled");
                async function* withId<T>(input: AsyncIterable<T>) {
                    let i = 0;
                    for await (const e of input) {
                        yield {
                            id: i++,
                            timestamp: Date.now(),
                            ...e,
                        };
                    }
                }
                for await (const event of withId(yArrayIterator(input))) {
                    if (!handled.has(event.id)) {
                        yield event;
                        doc.transact(() => {
                            handled.set(event.id, event);
                        });
                    }
                }
            });
        },

        inspect: {
            next: (inspectionEvent: InspectionEvent) => {
                if (inspectionEvent.type === "@xstate.snapshot") {
                    const snapshot = inspectionEvent.snapshot;
                    doc.transact(() => {
                        doc.getMap("@sessions").set(inspectionEvent.actorRef.sessionId, snapshot.value);
                    });
                }
                if (inspectionEvent.type === "@xstate.event") {
                    const event = inspectionEvent.event;
                    const events = doc.getArray("@events");
                    doc.transact(() => {
                        events.push([{
                            session: inspectionEvent.actorRef.sessionId,
                            event: event,
                            timestamp: Date.now(),
                            id: events.length,
                        }]);
                    });
                }
            },
            complete: () => {
                console.log("complete");
                doc.getMap("@store").set("status", "complete");
            },
        } as Observer<InspectionEvent>,

        persist(actor: ReturnType<typeof createActor>) {
            actor.subscribe((e) => {
                const persistedSnapshot = actor.getPersistedSnapshot();
                doc.transact(() => {
                    doc.getMap("@store").set("state", "value" in persistedSnapshot ? persistedSnapshot.value : null);
                    doc.getMap("@store").set("event", e.event);

                    const snapshotMap = doc.getMap("@snapshot");
                    Object.entries(persistedSnapshot).forEach(([key, value]) => {
                        console.log("snapshot persist", key);
                        snapshotMap.set(key, value);
                    });
                });
            });
        },
    };
}

export default hydrate;