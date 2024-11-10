import {assign, createMachine, emit} from "xstate";

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


