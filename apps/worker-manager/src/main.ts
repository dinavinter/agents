import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

interface WorkerConfig {
  id: string;
  sourceCode: string;
  runtime: 'deno' | 'node' | 'browser';
  metadata?: Record<string, unknown>;
}

interface WorkerStatus {
  status: 'starting' | 'running' | 'stopped' | 'error';
  error?: string;
  timestamp: number;
  metrics?: {
    memory?: number;
    cpu?: number;
  };
}

class WorkerManager {
  private doc: Y.Doc;
  private provider: HocuspocusProvider;
  private workers: Y.Map<WorkerConfig>;
  private workerStatus: Y.Map<WorkerStatus>;
  private activeWorkers = new Map<string, Worker>();

  constructor(url = 'ws://localhost:1234', room = 'worker-manager') {
    this.doc = new Y.Doc();
    this.provider = new HocuspocusProvider({
      url,
      name: room,
      document: this.doc
    });

    this.workers = this.doc.getMap('workers');
    this.workerStatus = this.doc.getMap('worker-status');
    
    this.setupListeners();
    this.setupHealthCheck();
  }

  private setupListeners() {
    // Listen for worker changes
    this.workers.observe(event => {
      event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          this.handleWorkerUpdate(key);
        } else if (change.action === 'delete') {
          this.stopWorker(key);
        }
      });
    });
  }

  private async handleWorkerUpdate(workerId: string) {
    const config = this.workers.get(workerId);
    if (!config) return;

    this.updateStatus(workerId, { status: 'starting', timestamp: Date.now() });

    // Stop existing worker if any
    await this.stopWorker(workerId);

    // Start new worker
    try {
      await this.startWorker(config);
      this.updateStatus(workerId, { status: 'running', timestamp: Date.now() });
    } catch (error) {
      this.updateStatus(workerId, { 
        status: 'error', 
        error: error.message, 
        timestamp: Date.now() 
      });
    }
  }

  private async startWorker(config: WorkerConfig) {
    const worker = new Worker(
      new URL('./worker-runtime.ts', import.meta.url),
      { type: 'module' }
    );

    worker.postMessage({ 
      type: 'init', 
      config 
    });

    this.activeWorkers.set(config.id, worker);

    // Handle worker messages
    worker.onmessage = (e) => {
      const { type, data } = e.data;
      switch (type) {
        case 'health':
          this.updateStatus(config.id, {
            status: 'running',
            timestamp: Date.now(),
            metrics: data.metrics
          });
          break;
        case 'error':
          this.updateStatus(config.id, {
            status: 'error',
            error: data.error,
            timestamp: Date.now()
          });
          break;
      }
    };
  }

  private async stopWorker(workerId: string) {
    const worker = this.activeWorkers.get(workerId);
    if (worker) {
      worker.terminate();
      this.activeWorkers.delete(workerId);
      this.updateStatus(workerId, { 
        status: 'stopped', 
        timestamp: Date.now() 
      });
    }
  }

  private updateStatus(workerId: string, status: Partial<WorkerStatus>) {
    const currentStatus = this.workerStatus.get(workerId) || {};
    this.workerStatus.set(workerId, { ...currentStatus, ...status });
  }

  private setupHealthCheck() {
    setInterval(() => {
      this.activeWorkers.forEach((worker, id) => {
        worker.postMessage({ type: 'health-check' });
      });
    }, 30000);
  }
}

// Start the worker manager
if (import.meta.main) {
  const HOCUSPOCUS_URL = Deno.env.get('HOCUSPOCUS_URL') || 'ws://localhost:1234';
  const ROOM_NAME = Deno.env.get('ROOM_NAME') || 'worker-manager';
  
  console.log(`Starting Worker Manager...`);
  console.log(`Connecting to ${HOCUSPOCUS_URL}`);
  console.log(`Room: ${ROOM_NAME}`);
  
  const manager = new WorkerManager(HOCUSPOCUS_URL, ROOM_NAME);
}
