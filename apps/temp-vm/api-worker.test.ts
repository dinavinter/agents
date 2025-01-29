import { createActor, waitFor } from 'xstate';
import { workerMachine } from './api-worker';
import { DenoVM } from '@casual-simulation/node-deno-vm';
import { expect } from "@std/expect";
import { assertEquals } from "jsr:@std/assert";

// Mock DenoVM

Deno.test('API Worker Machine', async (t) => {
  
  const it=t.step.bind(t);

  it('should initialize with empty state', () => {
     const actor = createActor(workerMachine).start();
    
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context).toEqual({
      apiDefinition: null,
      worker: null,
      events: [],
      error: null,
    });
  });

  it('should transition to initializingWorker when receiving API definition', () => {
     const actor = createActor(workerMachine).start();
    
    actor.send({
      type: 'RECEIVE_API_DEFINITION',
      definition: { endpoint: '/test' },
    });

    expect(actor.getSnapshot().value).toBe('initializingWorker');
    expect(actor.getSnapshot().context.apiDefinition).toEqual({ endpoint: '/test' });
  });

  it('should create worker and transition to running state', async () => {
    // Mock successful worker creation
    const mockRun = jest.fn().mockResolvedValue(undefined);
    (DenoVM as jest.Mock).mockImplementation(() => ({
      run: mockRun,
      terminate: jest.fn(),
    }));

     const actor = createActor(workerMachine).start();
    
    actor.send({
      type: 'RECEIVE_API_DEFINITION',
      definition: { endpoint: '/test' },
    });

    // Wait for the worker to be ready
    await waitFor(actor, (state) => state.matches('running'));

    expect(mockRun).toHaveBeenCalled();
    expect(actor.getSnapshot().value).toBe('running');
  });

  it('should handle worker creation errors', async () => {
    // Mock worker creation failure
    const mockError = new Error('Worker creation failed');
    (DenoVM as jest.Mock).mockImplementation(() => ({
      run: jest.fn().mockRejectedValue(mockError),
      terminate: jest.fn(),
    }));

     const actor = createActor(workerMachine).start();
    
    actor.send({
      type: 'RECEIVE_API_DEFINITION',
      definition: { endpoint: '/test' },
    });

    // Wait for the error state
    await waitFor(actor, (state) => state.matches('failed'));

    expect(actor.getSnapshot().context.error).toBe(mockError.message);
  });

  it('should handle worker events', async () => {
    // Mock successful worker creation
    const mockRun = jest.fn().mockResolvedValue(undefined);
    (DenoVM as jest.Mock).mockImplementation(() => ({
      run: mockRun,
      terminate: jest.fn(),
    }));

    const actor = createActor(workerMachine).start();
    
    // Initialize worker
    actor.send({
      type: 'RECEIVE_API_DEFINITION',
      definition: { endpoint: '/test' },
    });

    // Wait for running state
    await waitFor(actor, (state) => state.matches('running'));

    // Send worker event
    actor.send({
      type: 'WORKER_EVENT',
      event: { data: 'test response' },
    });

    expect(actor.getSnapshot().context.events).toHaveLength(1);
    expect(actor.getSnapshot().context.events[0]).toEqual({ data: 'test response' });
  });

  it('should cleanup worker when stopping', async () => {
    const mockTerminate = jest.fn();
    (DenoVM as jest.Mock).mockImplementation(() => ({
      run: jest.fn().mockResolvedValue(undefined),
      terminate: mockTerminate,
    }));

     const actor = createActor(workerMachine).start();
    
    // Initialize and start worker
    actor.send({
      type: 'RECEIVE_API_DEFINITION',
      definition: { endpoint: '/test' },
    });

    await waitFor(actor, (state) => state.matches('running'));

    // Stop worker
    actor.send({ type: 'STOP_WORKER' });

    expect(mockTerminate).toHaveBeenCalled();
    expect(actor.getSnapshot().value).toBe('idle');
  });

  // Integration test with real API definition
  it('should handle real API calls', async () => {
    const apiDefinition = {
      endpoint: '/api/test',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const mockRun = jest.fn().mockImplementation(async (script) => {
      // Verify the worker script contains the API definition
      expect(script).toContain(JSON.stringify(apiDefinition));
      
      // Simulate worker sending a response
      setTimeout(() => {
        actor.send({
          type: 'WORKER_EVENT',
          event: { 
            type: 'response',
            data: { status: 200, body: 'Success' }
          },
        });
      }, 100);
    });

    (DenoVM as jest.Mock).mockImplementation(() => ({
      run: mockRun,
      terminate: jest.fn(),
    }));

    const actor = createActor(workerMachine).start();
    
    actor.send({
      type: 'RECEIVE_API_DEFINITION',
      definition: apiDefinition,
    });

    await waitFor(actor, (state) => 
      state.matches('running') && state.context.events.length > 0
    );

    const lastEvent = actor.getSnapshot().context.events[0];
    expect(lastEvent.type).toBe('response');
    expect(lastEvent.data.status).toBe(200);
  });
});
