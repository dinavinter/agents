import type { ActorRef, CallbackActorLogic, EventObject, PromiseActorLogic } from "https://deno.land/x/xstate@xstate";
import {
    assign,
    createActor,
    createMachine,
    emit,
    enqueueActions,
    forwardTo,
    fromCallback,
    fromPromise,
    sendTo,
    setup,
} from "https://esm.sh/xstate?target=esnext";
import * as Y from "https://esm.sh/yjs";
import type { Actions } from "https://esm.town/v/dinavinter/with_yjs";

const domain = "accounts.eu1.gigya.com";

export const getToken = fromPromise(
    async function({ input: { uid, apiKey } }: { input: { uid: string; apiKey: string } }) {
        const response = await fetch(`https://${domain}/socialize.getToken?httpStatusCodes=true`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            body: new URLSearchParams({
                "apiKey": apiKey,
                "grant_type": "none",
                "siteUID": uid,
                "userKey": Deno.env.get("GIGYA_CLIENT_ID")!,
                "secret": Deno.env.get("GIGYA_CLIENT_SECRET")!,
            }),
        });
        if (!response.ok) throw new Error(JSON.stringify(await response.json()));
        return await response.json();
    },
);

export const getAccount: PromiseActorLogic<Account, string, any> = fromPromise(
    async function({ input: access_token }: { input: string }) {
        const response = await fetch(`https://${domain}/accounts.getAccountInfo?httpStatusCodes=true`, {
            method: "GET",
            headers: {
                "Authorization": `OAuth ${access_token}`,
            },
        });
        if (!response.ok) throw new Error(response.statusText);
        return response.json();
    },
);

export const setAccount: PromiseActorLogic<any, Account & { access_token: string; apiKey: string }> = fromPromise(
    async function({ input: { access_token, ...input } }: { input: Account & { access_token: string; apiKey: string } }) {
        const response = await fetch(`https://${domain}/accounts.setAccountInfo?httpStatusCodes=true`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Authorization": `OAuth ${access_token}`,
            },
            body: new URLSearchParams(Object.fromEntries(
                Object.entries(input).filter(([key, value]) => value !== undefined).map((
                    [key, value],
                ) => [key, typeof value === "string" ? value : JSON.stringify(value)]),
            )),
        });
        if (!response.ok)
            throw new Error(response.statusText);
        return response.json();
    },
);

/* example

 {
    "events": [{
      "type": "accountCreated",
      "id": "b33ea29d-618e-4175-adc5-b5062a495c2e",
      "timestamp": 1738767327,
      "callId": "ec02199312f54572b49c03d26252d64d",
      "version": "3.0",
      "apiKey": "4_duyw1TGSxtcBMz-EOZYtWg",
      "endpoint": "accounts.register",
      "data": {
        "accountType": "full",
        "apiKey": "4_duyw1TGSxtcBMz-EOZYtWg",
        "uid": "f57a2f18e174407aa6d1fbdfe5fd8127",
        "params": {
          "profile": { "firstName": null, "lastName": null },
          "data": { "subscribe": false, "terms": false },
          "lang": "en",
          "finalizeRegistration": true,
          "email": "yoniw@mail.com",
          "regSource": "https://gigya.pyzlo.in/pages/login",
          "targetEnv": "jssdk",
        },
      },
    }],
    "nonce": "290f8728-12c9-4da3-8d35-bb1dee41adc2",
    "timestamp": 1738767329,
  }
*/
export type Account = {
    uid: string;
    isRegistered: boolean;
    isVerified: boolean;
    profile: Record<string, unknown>;
    data: Record<string, unknown>;
} & Record<string, unknown>;
export type WhEvent = {
    apiKey: string;
    endpoint: string;
    id: string;
    timestamp: number;
    type: "accountCreated" | "accountVerified" | "accountRegistered" | "accountLoggedIn";
    data: { uid: string; accountType: string; params: Record<string, unknown> } & Record<string, unknown>;
};
const userMachine = setup({
    actions: {},
    guards: {
        "isRegistered": ({ context }) => context.isRegistered,
        "isVerified": ({ context }) => context.isVerified,
        "isLoggedIn": ({ context }) => context.isLoggedIn,
    },
    delays: {},
    schemas: {} as {
        events: WhEvent;
        context: Account & { access_token: string };
        actions: Actions;
    },
    actors: {
        getAccount: getAccount,

        setAccount: setAccount,

        getToken: getToken,
    },
})
    .createMachine({
        id: "lifcycle",
        initial: "token",
        context: ({ input, self }) => input,
        states: {
            token: {
                id: "token",
                initial: "fetch",
                tags: ["loading"],

                states: {
                    fetch: {
                        invoke: {
                            src: "getToken",
                            id: "getToken",
                            input: ({ context: { uid, apiKey } }) => ({
                                uid,
                                apiKey,
                            }),
                            onDone: {
                                target: "#load",
                                actions: assign({
                                    access_token: ({ event: { output: { access_token } } }) => access_token,
                                }),
                                onError: {
                                    target: "error",
                                    actions: assign({
                                        error: ({ context, event }) => event.error,
                                    }),
                                },
                            },
                        },
                    },
                    error: {
                        after: {
                            1000: "fetch",
                        },
                    },
                },
            },
            load: {
                id: "load",
                initial: "fetch",
                tags: ["loading"],

                states: {
                    fetch: {
                        invoke: {
                            src: "getAccount",
                            id: "getAccount",
                            input: ({ context: { access_token } }) => access_token,
                            onDone: {
                                target: "#loaded",
                                actions: assign(({ context, event: { output } }) => ({
                                    ...context,
                                    ...output,
                                })),
                                onError: {
                                    target: "error",
                                    actions: assign({
                                        error: ({ context, event }) => event.error,
                                    }),
                                },
                            },
                        },
                    },
                    error: {
                        after: {
                            1000: "#token",
                        },
                    },
                },
            },
            loaded: {
                id: "loaded",
                initial: "created",
                entry: {
                    type: "@yjs.array.push",
                    params: "accounts",
                },
                on: {
                    accountUpdated: {
                        // todo:set from params instead
                        target: "#load",
                    },
                },

                states: {
                    created: {
                        id: "created",
                        always: {
                            target: "registered",
                            guard: "isRegistered",
                        },
                        on: {
                            accountRegistered: {
                                target: "registered",
                            },
                        },
                    },
                    registered: {
                        id: "registered",
                        on: {
                            accountLoggedIn: {
                                target: "loggedin",
                            },
                        },
                    },
                    loggedin: {
                        id: "loggedin",
                        on: {
                            accountLoggedOut: {
                                target: "registered",
                            },
                        },
                    },
                    update: {
                        invoke: {
                            src: "setAccount",
                            id: "setAccount",
                            input: ({ event, context: { access_token } }) => ({
                                access_token,
                                ...event,
                            }),
                        },
                    },
                },
            },
        },
    });

const map = new Map();
const docMap = new Map();
export function userDoc(uid: string, connect?: (doc: Y.Doc) => void) {
    if (!docMap.has(uid)) {
        const doc = new Y.Doc({ guid: `users:${uid}` });
        connect && connect(doc);
        docMap.set(uid, doc);
    }
    return docMap.get(uid)!;
}

export default userMachine;