import {AnyActorLogic} from "xstate";
import { serviceHub } from "./hub.ts";

export function withMarks<T extends AnyActorLogic>(actorLogic: T, hub: serviceHub) {
    if (actorLogic == undefined) {
        throw new Error("actorLogic is undefined");
    }
    const transition = actorLogic.transition.bind(actorLogic);
    actorLogic.transition = (state, event, actorCtx) => {
        const marks = hub.doc.getMap<number>("marks");
        const timestamp = Date.now();
        if (event.type === "@xstate.init") {
            marks.set("started", timestamp);
        }
        if (event.type === "@xstate.stop") {
            marks.set("stopped", timestamp);
        }

        const before = actorCtx.self.getSnapshot();
        const newState = transition(state, event, actorCtx);
        const snapshot = actorCtx.self.getSnapshot();
        if (snapshot.value !== before.value) {
            marks.set(`start:${snapshot.value}`, timestamp);
            marks.set(`end:${before.value}`, timestamp);
        }

        return newState;
    };
}

export function withTimeline<T extends AnyActorLogic>(actorLogic: T, hub: serviceHub) {
    if (actorLogic == undefined) {
        throw new Error("actorLogic is undefined");
    }
    const transition = actorLogic.transition.bind(actorLogic);
    actorLogic.transition = (state, event, actorCtx) => {
        console.group(event.type, Date.now());

        const timestamp = Date.now();
        const before = actorCtx.self.getSnapshot();
        console.log("before", before.value);

        const last = hub.emitted.pop()?.timestamp;
        const offset = last ? timestamp - last : 0;

        const newState = transition(state, {
            timestamp,
            offset,
            id: offset,
            ...event,
        }, actorCtx);
        const snapshot = actorCtx.self.getSnapshot();
        console.log("after", snapshot.value);

        // persist timeline
        const timeline = hub.doc.getMap("timeline");
        timeline.doc?.transact(() => {
            if (snapshot.value !== before.value) {
                timeline.set(`${timestamp}`, actorCtx.self.getPersistedSnapshot());
            }
        });
        console.groupEnd();
        return newState;
    };

    return actorLogic;
}