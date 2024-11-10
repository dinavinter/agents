import {assign, createMachine, emit} from "https://esm.sh/xstate";

const machine = createMachine({
    id: 'emit-example',
    initial: 'emit',
    states: {
        emit: {
            entry: assign({
                index: ({context: {index}}) => index + 1
            }),
            after: {
                1000: {
                    target: 'emit',
                    reenter: true,
                    actions: emit(({context: {index}}) => ({
                        type: 'EMIT',
                        data: index,
                        event: 'emit'
                    }))
                }
            },
        }
    }
})


addEventListener('fetch', event => {
    return event.respondWith(new Response(JSON.stringify(machine.toJSON()), {
        headers: {
            'content-type': 'application/json'
        }
    }))
})
