import { azure } from "https://esm.sh/@ai-sdk/azure";
import { ServiceController } from "https://esm.sh/@cxai/stream/xstate?target=esnext";
import {
  aiOptions,
  asyncBatchEvents,
  asyncEventGenerator,
  fromAIElementStream,
  fromAIEventStream,
} from "https://esm.sh/@cxai/stream?target=esnext";
import type { AnyEventObject, UnknownActorLogic } from "https://esm.sh/xstate@^5.19.0";
import {
  assign,
  createActor,
  createMachine,
  emit,
  fromPromise,
  setup,
} from "https://esm.sh/xstate@^5.19.0";
import * as Y from "https://esm.sh/yjs@^13.6.20?target=esnext";

// Basic event types that represent pure data/state changes
export interface StepEvent {
  type: 'STEP';
  id: string;
  status: 'started' | 'completed' | 'error';
  data?: unknown;
  error?: Error;
  timestamp: number;
}

export interface RequestEvent {
  type: 'REQUEST';
  id: string;
  request: unknown;
  timestamp: number;
}

export type MachineEvent = StepEvent | RequestEvent;

type Actors = {
  aiStream: ReturnType<typeof fromAIEventStream<{ model: LanguageModelV1 }>>;
  aiElementStream: ReturnType<typeof fromAIEventStream>;
} & Record<string, UnknownActorLogic>;

export interface MachineContext {
  steps: Array<{
    id: string;
    type: string;
    status: 'pending' | 'completed' | 'error';
    data?: unknown;
    error?: Error;
  }>;
  currentStep?: {
    id: string;
    type: string;
    data?: unknown;
  };
}

// Pure machine that emits simple events
export const createPureMachine = () => {
  return setup({
    actors: {} as Actors,
    types: {} as {
      context: MachineContext;
      events: MachineEvent;
    },
  }).createMachine({
    id: 'pure-machine',
    initial: 'idle',
    context: {
      steps: [],
    },
    states: {
      idle: {
        on: {
          REQUEST: {
            target: 'processing',
            actions: [
              assign({
                currentStep: ({ event }) => ({
                  id: event.id,
                  type: 'request',
                  data: event.request,
                }),
              }),
              emit(({ event }) => ({
                type: 'REQUEST',
                id: event.id,
                request: event.request,
                timestamp: Date.now(),
              })),
            ],
          },
        },
      },
      processing: {
        entry: [
          emit(({ context }) => ({
            type: 'STEP',
            id: context.currentStep?.id || crypto.randomUUID(),
            status: 'started',
            data: context.currentStep?.data,
            timestamp: Date.now(),
          })),
        ],
        invoke: {
          src: 'processStep',
          input: ({ context }) => ({
            step: context.currentStep,
          }),
          onDone: {
            target: 'next_step',
            actions: [
              assign({
                steps: ({ context, event }) => [
                  ...context.steps,
                  {
                    ...context.currentStep!,
                    status: 'completed',
                    data: event.output,
                  },
                ],
              }),
              emit(({ context }) => ({
                type: 'STEP',
                id: context.currentStep?.id || '',
                status: 'completed',
                data: context.currentStep?.data,
                timestamp: Date.now(),
              })),
            ],
          },
          onError: {
            target: 'error',
            actions: [
              assign({
                steps: ({ context, event }) => [
                  ...context.steps,
                  {
                    ...context.currentStep!,
                    status: 'error',
                    error: event.error,
                  },
                ],
              }),
              emit(({ context, event }) => ({
                type: 'STEP',
                id: context.currentStep?.id || '',
                status: 'error',
                error: event.error,
                timestamp: Date.now(),
              })),
            ],
          },
        },
      },
      next_step: {
        always: [
          {
            guard: ({ context }) => {
              const nextStep = context.steps.find(
                (step) => step.status === 'pending'
              );
              return !!nextStep;
            },
            target: 'processing',
            actions: assign({
              currentStep: ({ context }) =>
                context.steps.find((step) => step.status === 'pending'),
            }),
          },
          { target: 'done' },
        ],
      },
      error: {
        type: 'final',
      },
      done: {
        type: 'final',
      },
    },
  });
};

// Example of how to use with different transformers
export const createMachineWithTransformer = (transformer: (event: MachineEvent) => unknown) => {
  const pureMachine = createPureMachine();
  
  return pureMachine.provide({
    actors: {
      processStep: fromPromise(async ({ input }) => {
        // Your processing logic here
        return input.step;
      }),
    },
  }).provide({
    actions: {
      emit: ({ event }) => transformer(event as MachineEvent),
    },
  });
};
