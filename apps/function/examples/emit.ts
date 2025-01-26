import {createMachine, assign, emit} from "xstate";


export default createMachine({
    id: 'machine',
    initial: 'stage1', 
    context:{
        index: 0
    },
    states: {
        stage1: {
            entry: assign({
                index: ({context: {index}}: { context: { index: number } }) => index + 1
            }),
            always: {
                target: 'stage2',
                guard: ({context: {index}}: { context: { index: number } }) => index > 10
            }, 
            after: {
                1000: {
                    target: 'stage1',
                    reenter: true,
                    actions: emit(({context: {index}}: { context: { index: number } }) => ({
                        type: 'EMIT',
                        data: index,
                        event: 'stage-1'
                    }))
                },
                

            },
        },
        stage2:{
            entry: assign({
                index: ({context: {index}}: { context: { index: number } }) => index + 1
            }),
            after: {
                1000: {
                    target: 'stage2',
                    reenter: true,
                    actions: emit(({context: {index}}: {context:{index:number}}) => ({
                        type: 'EMIT',
                        data: index,
                        event: 'stage-2'
                    }))
                }
            },
        }
    }
})

 
