import {z} from 'zod';

const actionObject = z.object({
    type: z.string().min(1, 'Action type must have at least 1 character'),
    params: z.record(z.unknown()),
}).describe('An object representing an action to be performed');

const guardObject = z.object({
    type: z.string().describe('The type of the guard condition'),
    params: z.record(z.unknown()).describe('Parameters for the guard condition'),
}).describe('An object defining a guard condition for a transition');

const metaObject = z.record(z.unknown()).describe('An object containing additional metadata');


const transitionObject = z.object({
    description: z.string().optional().describe('The text description of the transition'),
    target: z.union([z.string(), z.array(z.string())]).describe('The target state node(s) for the transition'),
    actions: z.array(actionObject).or(actionObject).optional().describe('Actions to be performed when the transition is taken'),
    guard: z.nullable(guardObject).optional().describe('A guard condition that must be met for the transition to be taken'),
    meta: z.nullable(metaObject).optional().describe('Additional metadata associated with the transition'),
}).describe('A transition definition that can occur from a state node');

const transitionsDef = z.record(z.array(transitionObject).or(transitionObject)).describe('An object mapping event names to their transition definitions');

const invokeObject = z.object({
    id: z.string().describe('The unique identifier for the invocation'),
    src: z.string().describe('The source of the invocation'),
    input: z.record(z.unknown()).describe('The input data for the invocation'),
    meta: z.record(z.unknown()).describe('Additional metadata associated with the invocation'),
    onDone: z.array(transitionObject).optional().describe('Invocations to be started when the current invocation is completed'),
    onError: z.array(transitionObject).optional().describe('Invocations to be started when the current invocation encounters an error'),
    onSnapshot: z.array(transitionObject).optional().describe('Invocations to be started when a snapshot of the current invocation is taken'),
}).describe('An object defining an invocation to be started when a state node is entered');


const initialObject = z.union([z.string().min(1), transitionObject]).describe('The initial state node to enter when the statechart is started');

const baseStateNode = z.object({
    id: z.string().describe('The unique identifier for the state node'),
    type: z.union([z.literal('parallel'), z.literal('final'), z.literal('history')]).optional().describe('The type of the state node, if not a normal (atomic or compound) state node'),
    description: z.string().optional().describe('The text description of the state node'),
    tags: z.array(z.string()).optional().describe('Tags associated with the state node'),
    entry: z.array(actionObject).optional().describe('Actions to be performed when entering the parallel state node'),
    exit: z.array(actionObject).optional().describe('Actions to be performed when exiting the parallel state node'),
    invoke: z.array(invokeObject).optional().describe('Invocations to be started when the parallel state node is entered'),
    on: transitionsDef.optional(),
    onDone: z.array(invokeObject).optional().describe('Invocations to be started when the parallel state is exited'),

});

const compoundStateNode = baseStateNode.extend({
    type: z.literal('compound'),
    initial: z.lazy(() => initialObject).describe('The initial sub-state to enter when the compound state is entered'),
    states: z.lazy(() => statesObject).describe('The sub-states of this compound state node'),
 }).describe('A compound state node that can have sub-states');

const parallelStateNode = baseStateNode.extend({
    type: z.literal('parallel'),
    states: z.lazy(() => statesObject).describe('The sub-states of this parallel state node'),

}).describe('A parallel state node that can have multiple sub-states active simultaneously');

const atomicStateNode = baseStateNode.extend({
    type: z.literal('atomic').or(z.null()),
 }).describe('An atomic state node with no sub-states');

const historyStateNode = baseStateNode.extend({
    type: z.literal('history'),
    history: z.enum(['shallow', 'deep']).describe('The type of history to record for this state node'),
    target: z.string().optional().describe('The default target if no history exists for the parent node'),
}).describe('A history state node that records the previous active sub-state');

const finalStateNode = baseStateNode.extend({
    type: z.literal('final'),
}).describe('A final state node indicating the completion of the statechart');

const statesObject = z.record(
    z.union([
        atomicStateNode,
        compoundStateNode,
        parallelStateNode,
        historyStateNode,
        finalStateNode,
    ])
).describe('An object mapping state node IDs to their definitions');

const jsonSchema = z.object({
    $schema: z.string().url().describe('The URL of the JSON Schema specification'),
    $id: z.string().url().describe('The unique identifier for the JSON Schema'),
    title: z.string().describe('The title of the JSON Schema'),
    description: z.string().describe('The description of the JSON Schema'),
    type: z.literal('object').describe('The type of the JSON Schema'),
    properties: z.record(z.unknown()).describe('The properties defined in the JSON Schema'),
    required: z.array(z.string()).describe('The required properties in the JSON Schema'),
    additionalProperties: z.boolean().describe('Whether additional properties are allowed in the JSON Schema'),
});

export const statechartSchema = z.object({
    $id: z.string().url().describe('The unique identifier for the statechart'),
    $schema: z.string().describe('The URL of the statechart schema specification'),
    description: z.string().describe('The description of the statechart'),
    type: z.literal('object').describe('The type of the statechart'),
    properties: z.object({
        id: z.string().min(1).describe('The unique identifier for the statechart'),
        description: z.string().optional().describe('The description of the statechart'),
        version: z.string().min(1).describe('The version of the statechart'),
        schemas: z.object({
            input: jsonSchema.describe('The JSON Schema object used to validate the input data'),
            context: z.array(jsonSchema).describe('The JSON Schema objects used to validate the context data'),
            events: z.array(jsonSchema).describe('The JSON Schema objects used to validate the events data'),
            actions: z.array(jsonSchema).describe('The JSON Schema objects used to validate the actions data'),
            guards: z.array(jsonSchema).describe('The JSON Schema objects used to validate the guards data'),
            actors: z.array(jsonSchema).describe('The JSON Schema objects used to validate the actors data'),
            delays: z.array(jsonSchema).describe('The JSON Schema objects used to validate the delays data'),
            tags: z.array(jsonSchema).describe('The JSON Schema objects used to validate the tags data'),
        }),
        context: z.record(z.unknown()).describe('The initial context data for the statechart'),
        initial: initialObject.describe('The initial state node to enter when the statechart is started'),
        entry: z.array(actionObject).optional().describe('Actions to be performed when the statechart is entered'),
        exit: z.array(actionObject).optional().describe('Actions to be performed when the statechart is exited'),
        invoke: z.array(invokeObject).optional().describe('Invocations to be started when the statechart is entered'),
        on: transitionsDef.optional().describe('Transitions that can occur from the root state node'),
        states: statesObject.describe('The state nodes defined in the statechart'),
        meta: z.nullable(metaObject).optional().describe('Additional metadata associated with the statechart'),
    }),
    required: ['id', 'initial', 'states'],
    additionalProperties: false,
}).describe('The schema for a statechart definition');

// Example statechart data
export const exampleStatechart = {
    $id: 'https://example.com/statechart',
    $schema: 'https://stately.ai/schemas/0.1/statechart.json',
    description: 'Example Statechart',
    version: '1.0.0',
    schemas: {
        input: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: {
                type: 'object',
                additionalProperties: true
            }
        },
        context: [
            {
                $schema: 'http://json-schema.org/draft-07/schema#',
                type: {
                    type: 'object',
                    additionalProperties: true
                }
            }
        ],
        events: [
            {
                $schema: 'http://json-schema.org/draft-07/schema#',
                type: {
                    type: 'object',
                    additionalProperties: true
                }
            }
        ]
    },
    context: {
        userId: '12345',
        userName: 'John Doe'
    },
    initial: 'idle',
    states: {
        idle: {
            type: 'atomic',
            on: {
                start: { target: 'running' }
            }
        },
        running: {
            type: 'compound',
            initial: 'executing',
            states: {
                executing: {
                    type: 'atomic',
                    entry: [
                        { type: 'log', params: { message: 'Started execution' }}
                    ],
                    on: {
                        complete: { target: 'completed' },
                        error: { target: 'failed' }
                    }
                },
                completed: {
                    type: 'final',
                    entry: [
                        { type: 'log', params: { message: 'Execution completed' }}
                    ]
                },
                failed: {
                    type: 'final',
                    entry: [
                        { type: 'log', params: { message: 'Execution failed' }}
                    ]
                }
            },
            on: {
                stop: { target: 'idle' }
            }
        }
    }
};
 

const o=z.object({
    id: z.string(),
    version: z.string(),
    _links: z.object({
        self: z.string(),
        workflow: z.string()
    })
})