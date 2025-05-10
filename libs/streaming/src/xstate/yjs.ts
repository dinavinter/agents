/* Open in Val Town: https://www.val.town/v/dinavinter/yjs_actor */
import { createActor } from "https://esm.sh/xstate@5.19.2?target=esnext";
import type {
    AnyActorLogic,
    AnyStateMachine,
    CallbackActorLogic,
    EventObject,
    InspectionEvent,
    Observer,
    Snapshot,
} from "xstate";
import * as Y from "yjs";
import hydrate from "https://esm.town/v/dinavinter/hydrate";

const map = new Map<string, ReturnType<typeof createActorFromYjs>>();

export function yjsActor(logic: AnyActorLogic, doc?: Y.Doc | string, input?: any) {
    if (typeof doc === "string" || !doc) {
        doc = new Y.Doc({ guid: doc || `@actor.${logic.id}`, meta: { collection: `@actor.${logic.id}` } });
    }

    async function start() {
        if (!map.has(doc.guid)) {
            if (doc.shouldLoad) {
                // user.whenLoaded with timeout of 1s
                await Promise.race([doc.whenLoaded, new Promise((resolve) => setTimeout(resolve, 1000))]);
            }
            map.set(doc.guid, createActorFromYjs(logic, doc, input));
        }

        return map.get(doc.guid)!;
    }

    async function send(event: EventObject) {
        const actor = await start();
        actor.send(event);
    }

    return {
        send,
        start,
        doc,
    };
}

function createActorFromYjs(logic: AnyActorLogic, doc: Y.Doc, input?: any) {
    const { persist, restoreFromEvents, restore, inspect } = hydrate(doc);
    const resroredState = restore();
    console.info("restored state", resroredState);
    const runtime = createActor(logic, {
        id: doc.guid,
        input: input,
        snapshot: resroredState,
        inspect,
    });
    runtime.start();
    persist(runtime);
    return runtime;
}

export default yjsActor;