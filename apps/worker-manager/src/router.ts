import { Router } from "https://deno.land/x/oak/mod.ts";
import { WorkerManager } from "./main.ts";

export function createRouter(workerManager: WorkerManager) {
  const router = new Router();

  // Start a worker
  router.post("/workers/:id/start", async (ctx) => {
    const { id } = ctx.params;
    try {
      await workerManager.startWorker(id);
      ctx.response.status = 200;
      ctx.response.body = { status: "success", message: `Worker ${id} started` };
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { status: "error", message: error.message };
    }
  });

  // Stop a worker
  router.post("/workers/:id/stop", async (ctx) => {
    const { id } = ctx.params;
    try {
      await workerManager.stopWorker(id);
      ctx.response.status = 200;
      ctx.response.body = { status: "success", message: `Worker ${id} stopped` };
    } catch (error) {
      ctx.response.status = 500;
      ctx.response.body = { status: "error", message: error.message };
    }
  });

  // Get worker status
  router.get("/workers/:id/status", (ctx) => {
    const { id } = ctx.params;
    const status = workerManager.getWorkerStatus(id);
    if (status) {
      ctx.response.status = 200;
      ctx.response.body = status;
    } else {
      ctx.response.status = 404;
      ctx.response.body = { status: "error", message: `Worker ${id} not found` };
    }
  });

  // List all workers
  router.get("/workers", (ctx) => {
    const workers = workerManager.listWorkers();
    ctx.response.status = 200;
    ctx.response.body = workers;
  });

  return router;
}
