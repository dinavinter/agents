/// <reference lib="deno.worker" />

interface WorkerConfig {
  id: string;
  sourceCode: string;
  runtime: 'deno' | 'node' | 'browser';
  metadata?: Record<string, unknown>;
}

class WorkerRuntime {
  private config?: WorkerConfig;
  private interval?: number;

  constructor() {
    self.onmessage = (e) => this.handleMessage(e);
  }

  private async handleMessage(e: MessageEvent) {
    const { type, config } = e.data;

    switch (type) {
      case 'init':
        await this.initialize(config);
        break;
      case 'health-check':
        this.sendHealthMetrics();
        break;
    }
  }

  private async initialize(config: WorkerConfig) {
    this.config = config;
    
    try {
      // Execute the source code in the worker
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction(config.sourceCode);
      await fn();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
    } catch (error) {
      self.postMessage({ 
        type: 'error', 
        data: { error: error.message } 
      });
    }
  }

  private startHealthMonitoring() {
    // Send initial health metrics
    this.sendHealthMetrics();

    // Setup periodic health checks
    this.interval = setInterval(() => {
      this.sendHealthMetrics();
    }, 30000);
  }

  private sendHealthMetrics() {
    // Get memory usage if available
    const memory = (self as any).performance?.memory;
    const metrics = {
      memory: memory ? {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize
      } : undefined
    };

    self.postMessage({ 
      type: 'health', 
      data: { metrics } 
    });
  }
}

// Start the worker runtime
new WorkerRuntime();
