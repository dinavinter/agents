import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Application } from "https://deno.land/x/oak/mod.ts";
import { newDenoHTTPWorker, DenoHTTPWorker } from "./http-deno-vm.ts";
import { createRouter } from "./router.ts";

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

export class WorkerManager {
  private doc: Y.Doc;
  private provider: HocuspocusProvider;
  private workers: Y.Map<WorkerConfig>;
  private workerStatus: Y.Map<WorkerStatus>;
  private activeWorkers = new Map<string, DenoHTTPWorker>();

  constructor(url = 'ws://localhost:1234', room = 'worker-manager') {
    this.doc = new Y.Doc({guid: `${room}:workers`, collectionid: 'workers', gc: false, autoLoad: true});
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

  private async handleWorkerUpdate(id: string) {
    const config = this.workers.get(id);
    if (!config) return;

    // Stop existing worker if any
    await this.stopWorker(id);

    if (config.runtime === 'deno') {
      try {
        const worker = await newDenoHTTPWorker(config.sourceCode);
        this.activeWorkers.set(id, worker);
        this.updateWorkerStatus(id, { status: 'running', timestamp: Date.now() });

        worker.addEventListener('exit', () => {
          this.updateWorkerStatus(id, { status: 'stopped', timestamp: Date.now() });
          this.activeWorkers.delete(id);
        });
      } catch (error) {
        this.updateWorkerStatus(id, {
          status: 'error',
          error: error.message,
          timestamp: Date.now()
        });
      }
    }
  }

  public async startWorker(id: string) {
    const config = this.workers.get(id);
    if (!config) {
      throw new Error(`Worker ${id} not found`);
    }
    await this.handleWorkerUpdate(id);
  }

  public async stopWorker(id: string) {
    const worker = this.activeWorkers.get(id);
    if (worker) {
      await worker.shutdown();
      this.activeWorkers.delete(id);
      this.updateWorkerStatus(id, { status: 'stopped', timestamp: Date.now() });
    }
  }

  public getWorkerStatus(id: string): WorkerStatus | undefined {
    return this.workerStatus.get(id);
  }

  public listWorkers() {
   return Array.from(this.workers.entries() as Iterable<[string, WorkerConfig]>).map(([id, config]) => ({ 
        id,
        config,
        status: this.workerStatus.get(id) 
    }));
   }

  private updateWorkerStatus(id: string, status: Partial<WorkerStatus>) {
    const currentStatus = this.workerStatus.get(id) || {
      status: 'stopped',
      timestamp: Date.now()
    };
    this.workerStatus.set(id, { ...currentStatus, ...status });
  }

  private setupHealthCheck() {
    setInterval(() => {
      this.activeWorkers.forEach((worker, id) => {
        // No health check for DenoHTTPWorker
        //add health check with some extra code to worker to listen on health events
      });
    }, 30000);
  }
}

// Start the worker manager and HTTP server
if (import.meta.main) {
  const YJS_URL = Deno.env.get('YJS_URL') || 'ws://localhost:1234';
  const ROOM_NAME = Deno.env.get('ROOM_NAME') || 'worker-manager';
  const HTTP_PORT = parseInt(Deno.env.get('HTTP_PORT') || '3000');

  const workerManager = new WorkerManager(YJS_URL, ROOM_NAME);
  const app = new Application();
  
  // Add router
  const router = createRouter(workerManager);
  app.use(router.routes());
  app.use(router.allowedMethods());

  // Start HTTP server
  console.log(`Starting HTTP server on port ${HTTP_PORT}...`);
  await app.listen({ port: HTTP_PORT });
}
