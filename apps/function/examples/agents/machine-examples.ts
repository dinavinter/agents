import { createPureMachine, type MachineEvent } from "./pure-machine.ts";
import { EventTransformer } from "./event-transformer.ts";

// 1. HTMX+SSE Transformer
const htmxTransformer = (event: MachineEvent) => {
  return EventTransformer.transform(event, {
    wrapInArticle: true,
    swapStrategy: 'innerHTML'
  });
};

// 2. Simple JSON Logger Transformer
const jsonLoggerTransformer = (event: MachineEvent) => {
  return {
    timestamp: new Date().toISOString(),
    ...event,
  };
};

// 3. Metrics Transformer (for monitoring/analytics)
const metricsTransformer = (event: MachineEvent) => {
  if (event.type === 'STEP') {
    return {
      metric: 'step_duration',
      value: Date.now() - event.timestamp,
      labels: {
        step_id: event.id,
        status: event.status,
      }
    };
  }
  return null; // Ignore non-step events
};

// Example usage:
const createHtmxMachine = () => {
  const machine = createPureMachine().provide({
    actions: {
      emit: ({ event }) => htmxTransformer(event as MachineEvent),
    },
  });
  return machine;
};

const createJsonLoggerMachine = () => {
  const machine = createPureMachine().provide({
    actions: {
      emit: ({ event }) => jsonLoggerTransformer(event as MachineEvent),
    },
  });
  return machine;
};

const createMetricsMachine = () => {
  const machine = createPureMachine().provide({
    actions: {
      emit: ({ event }) => metricsTransformer(event as MachineEvent),
    },
  });
  return machine;
};

// You can even combine multiple transformers
const createMultiOutputMachine = () => {
  const machine = createPureMachine().provide({
    actions: {
      emit: ({ event }) => {
        const e = event as MachineEvent;
        return [
          htmxTransformer(e),
          jsonLoggerTransformer(e),
          metricsTransformer(e),
        ].filter(Boolean); // Remove null values
      },
    },
  });
  return machine;
};
