
const actors = new Map<string, ActorRefFromLogic<typeof deploymentMachine>>();
async function getOrCreateActor(projectId: string) {
  if (!actors.has(projectId)) {
    const actor = createActor(deploymentMachine, {
      input: {
        project: projectId,
        assets: {},
        envVars: {},
      },
      inspector: {
        next: console.log,
        error: console.error,
        state: (state) => console.log(state.value, state.event)
    },
    snapshot: undefined // You can restore from a previous snapshot if needed
    }).start();
    actors.set(projectId, actor);
  }
  return actors.get(projectId)!;
}

const app = new Hono()

// Projects routes
app.post("/projects/:project/deployments", async (c) => {
  const { project } = c.req.param();
  const actor = await getOrCreateActor(project);
  const body = await c.req.json();

  // Handle file uploads
  if (body.files) {
    Object.entries(body.files).forEach(([name, content]: [string, string]) => {
      actor.send({
        type: "ASSET",
        name,
        file: {
          kind: "file",
          content,
          encoding: "utf-8"
        }
      });
    });
  }

  // Start deployment with provided or default assets
  actor.send({
    type: "START",
    assets: body.assets || {
      "main.ts": {
        kind: "file",
        content: `Deno.serve(req => new Response("Hello!"));`,
        encoding: "utf-8",
      }
    },
  });

  await waitFor(actor, (state) => state.matches("pending") || state.matches("error"));
  return c.json(actor.getPersistedSnapshot());
});

app.get("/projects/:projectId/deployments", async (c) => {
  const projectId = c.req.param("projectId");
  const actor = await getOrCreateActor(projectId);
  return c.json(actor.getPersistedSnapshot());
});

// Deployment routes
app.get("/projects/:projectId/deployments/:deploymentId", async (c) => {
  const projectId = c.req.param("projectId");
  const actor =await getOrCreateActor(projectId);
  return c.json(actor.getPersistedSnapshot());
});

app.delete("/projects/:projectId/deployments/:deploymentId", async (c) => {
  const projectId = c.req.param("projectId");
  const actor = await getOrCreateActor(projectId);  
  
  actor.send({ type: "STOP" });
  await waitFor(actor, (state) => state.matches("idle"));
  
  actors.delete(projectId); // Clean up the actor
  return c.json({ status: "stopped" });
});

app.post("/projects/:projectId/deployments/:deploymentId/ping", async (c) => {
  const projectId = c.req.param("projectId");
  const actor = await getOrCreateActor(projectId);
  
  actor.send({ type: "PING" });
  return c.json(actor.getPersistedSnapshot());
});