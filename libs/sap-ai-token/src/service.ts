import {Creds, tokenRequest} from "./request";
import {assign, createActor, createMachine, fromCallback, InputFrom, log, waitFor} from "xstate";

export type CredsEvent = {type: 'creds' } & Creds

export const tokenMachine = createMachine({
    id: 'token', 
    initial:'no_creds', 
    context: ({input}) => ({
        creds: input
    }),

    states: {
        no_creds:{
            on:{
                creds:{
                    target: 'fetch',
                    actions: assign({
                        creds: ({event} ) => event as CredsEvent
                    })
                }
            },
            always: {
                target: 'fetch',
                guard: ({context}) => !!context.creds
            }
        },
        fetch: {
            invoke: {
                src: tokenRequest,
                input: ({context}) => context.creds,
                onDone: {
                    target: 'success',
                    actions: assign({
                        token: ({event}) => event.output
                    })
                },
                onError: {
                    target: 'failure', actions: log(({event, context}) => ({
                        ...event,
                        url: context.creds?.token_url
                    }))
                }
            }
        },
        success: {
            invoke: {
                src: fromCallback(({sendBack}) => {
                    setTimeout(() => {
                        sendBack({
                            type: 'REFRESH'
                        })
                        //30 mins
                    }, 1000 * 30 * 60);
                })
            },
            on: {
                REFRESH: 'fetch'
            }
        },
        failure: {
            invoke: {
                src: fromCallback(({sendBack}) => {
                    setTimeout(() => {
                        sendBack({
                            type: 'RETRY'
                        })
                    }, 5000);
                })
            },
            on: {
                RETRY: 'fetch'
            }
        }

    }
})





export const credsFromEnv= {
    get client_id(){return process.env.SAP_CLIENT_ID!},
    get client_secret(){return process.env.SAP_CLIENT_SECRET!},
    get token_url(){return  process.env.SAP_TOKEN_URL!}
}

export function createTokenService(input?: InputFrom<typeof tokenMachine>  ) {
    const actor = createActor(tokenMachine, {
        input
    })
    
    return {
        actor: actor.start(),
        credentials: (creds: Creds) => actor.send({type:"creds" , ...creds}),
        credentialsFromEnv: () => actor.send({type:"creds" , ...credsFromEnv}),
        accessToken: async () => {
            const {context: {token}} = await waitFor(actor, state => state.matches('success'))
            return token!;
        }
    }
}



export const tokenService = createTokenService( )
