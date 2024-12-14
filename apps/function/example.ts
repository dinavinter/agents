 
import {createMachine, assign, emit} from "xstate";


export default createMachine({
    id: 'emit-example',
    initial: 'emit', 
    context:{
        index: 0
    },
    states: {
        emit: {
            entry: assign({
                index: ({context: {index}}:{context:{index:number}}) => index + 1
            }),
            after: {
                1000: {
                    target: 'emit',
                    reenter: true,
                    actions: emit(({context: {index}}: {context:{index:number}}) => ({
                        type: 'EMIT',
                        data: `index is: ${index}`,
                        event: 'emit'
                    }))
                }
            },
        }
    }
})

 
