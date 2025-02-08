//do not delete this, for reference only
// import {assertEvent, assign, createActor, fromPromise, setup} from "https://esm.sh/xstate@5.19.0";
// import Subhosting from "https://esm.sh/subhosting";
import Subhosting from "https://esm.sh/subhosting";
import { Deployment, Deployments, Projects, } from "https://esm.sh/subhosting/resources";

import { ActorRefFromLogic, fromCallback, sendTo, assertEvent, assign, createActor, fromPromise, setup } from "https://esm.sh/xstate@5.19.0";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { prettyJSON } from 'npm:hono/pretty-json'
import { fromEventAsyncGenerator } from "https://esm.sh/@cxai/stream?target=esnext";
import { apiReference } from 'npm:@scalar/hono-api-reference'
import { openApiDocument } from "./openapi.ts";

export interface File {
    kind: "file";

    content?: string;

    encoding?: "utf-8" | "base64";

    gitSha1?: string;
}

export interface Symlink {
    kind: "symlink";

    target: string;
}

const subhosting = new Subhosting({
    bearerToken: Deno.env.get("DEPLOY_ACCESS_TOKEN"),
    organizationId: Deno.env.get("DEPLOY_ORG_ID"),
});
type DeploymentMachineEvent =
    | { type: "config" } & Projects.DeploymentCreateParams
    | { type: "asset"; name: string; file: File | Symlink }
    | { type: "deploy" } & Projects.DeploymentCreateParams
    | { type: "retry" } 
    | { type: "restart" } 
    | { type: "stop" }
    | { type: "xstate.error.actor"; error: unknown }
    | { type: "xstate.done.actor.*"; output: Deployment };

// | { type: "HEALTHY"; deployment: Deployment }
// | { type: "UNHEALTHY"; deployment: Deployment }

type DeploymentMachineContext = {
    organization: string;
    project: string;
    deployment?: Deployment;
    error?: unknown;
    buildLogs: { message: string, level: string }[];
    appLogs: { message: string, level: string, time: string, region: string }[];
    artifacts: Projects.DeploymentCreateParams
};

// Deployment Machine Setup
export const deploymentMachine = setup({
    delays: {HEARTBEAT_INTERVAL: 30000}, 
    guards: {},
    schemas: {
        context: {} as DeploymentMachineContext,
        events: {} as DeploymentMachineEvent,
        input: {} as Partial<Omit<DeploymentMachineContext, "deployment">> & {
            project: string;
        },
    },
    actors: {
        buildProcessor: fromPromise(
            async ({ input }: { input: Projects.DeploymentCreateParams }) => {
                const { assets, ...artifacts } = input;
                // Add build logic here if needed
                return {
                    assets: assets ? assets : {
                        'main.ts': {
                            kind: 'file',
                            content: `Deno.serve(req => new Response("Hello!"));`,
                            encoding: 'utf-8'
                        }
                    }, 
                    envVars: {},
                    entryPointUrl: "main.ts",
                    ...artifacts
                }
            }

        ),

        deploymentHandler: fromPromise(
            async (
                { input }: { input: DeploymentMachineContext["artifacts"] },
            ) => {
                const { project, artifacts } = input;
                return await subhosting.projects.deployments.create(
                    project,artifacts
                   
                );
            },
        ),
        buildLogs: fromEventAsyncGenerator(async function* ({ input: { interval, deployment, logs: previousLogs } }: { input: { interval: number, deployment: string, logs: { message: string, level: string }[] } }) {
            const history: { level: string, message: string }[] = previousLogs || []
            while (true) {
                const logs = await subhosting.deployments.buildLogs.get(deployment);
                for (const log of logs.filter(l => !history.find(log=>log.message === l.message))) {
                    yield {
                        type: `log.${log.level}`,
                        message: log.message
                    }
                    history.push(log)
                }
                await new Promise((resolve) => setTimeout(resolve, interval));
            }
        }),
        appLogs: fromEventAsyncGenerator(async function* ({ input: { deployment, logs, interval } }: { input: { interval: number, deployment: string, logs: { time: string }[] } }) {
            let since = logs?.[-1]?.time || new Date(0).toISOString();
            while (true) {
                const logs = await subhosting.deployments.appLogs.get(deployment, {
                    since: since,
                    limit: 100,
                    sort: "time",
                    order: "asc",
                });
                for (const log of logs.sort((a, b) => a.time.localeCompare(b.time)).filter(log => log.time.localeCompare(since) > 0)) {
                    yield {
                        type: `log.${log.level}`,
                        message: log.message,
                        time: log.time,
                        region: log.region
                    }
                    since = log.time
                }
                await new Promise((resolve) => setTimeout(resolve, interval)); 
            }
        }),


        pollingStatus: fromEventAsyncGenerator(
            async function* ({ input: { deployment, interval } }: { input: { interval: number, deployment: string } }) {
                while (true) {
                    const response = await subhosting.deployments.get(deployment);
                    yield {
                        type: response.status, //"success" | "failed" | "pending" 
                        ...response
                    }
                    await new Promise((resolve) => setTimeout(resolve, interval));
                }
            }
        ),

        stopDeployment: fromPromise(
            async ({ input: deployment }: { input: string }) => {
                return await subhosting.deployments.delete(deployment);
            },
        ),
        
        healthChecker: fromCallback(function({ receive, sendBack, input }) {
            subhosting.deployments.get(input).then((res) => {
              sendBack({
                type: res.status, //"success" | "failed" | "pending" 
                ...res
              })  
            })
            receive(async ({ type }) => {
                console.log("Health check received", input, type)
                if (type === "PING") {
                    const { status, ...rest } = await subhosting.deployments.get(input);
                    console.log("Health check response", status,rest)
                    sendBack({
                        type: status, //"success" | "failed" | "pending" 
                        ...rest
                    })
                }
            }) 
        })
    },

    actions: {
       
        assignArtifacts: assign({
            artifacts: ({ event:{output}, context: { artifacts } }) => {
                return { ...artifacts|| {}, ...output };
            },
        }),

         assignError: assign({
            error: ({ event }) => {
                return event.error;
            },
        }), 
        assignDeployment: assign({
            deployment: ({ event:{type,...deployment} }) => {
                return deployment;
            },
        }),

        logError: assign({
            error: ({ event }) => {
                return event.error;
            },
        }),
    }
    
}).createMachine({
    id: "deployment",
    initial: "idle",
    context: ({ input: { artifacts, ...input } }) => ({
        buildLogs: [],
        appLogs: [],
        organization: Deno.env.get("DEPLOY_ORG_ID")!,
        ...input,
        artifacts: artifacts
    }),
    states: {
        idle: {
            on: {
                deploy: {
                    target: "building"
                },
                asset: {
                    actions: assign({
                        assets: ({ event, context: { assets } }) => {
                            return { ...assets, [event.name]: event.file };
                        },
                    }),
                },
                config: {
                    actions: assign({
                        artifacts: ({   event:{type, ...artifacts} }) => artifacts
                    })
                }
            },
        },
        building: {
            invoke: {
                src: "buildProcessor",
                input: ({ context }) => context.artifacts,
                onDone: {
                    target: "deploying",
                    actions: "assignArtifacts",
                },
                onError: {
                    target: "error",
                    actions: ["logError", "assignError"],
                },
            },
        },
        deploying: {
            invoke: {
                src: "deploymentHandler",
                id: "deployment",
                input: ({ context }) => context,
                onDone: {
                    target: "pending",
                    actions: assign({
                        deployment: ({ event: {output: deployment } }) =>  deployment
                    })
                },
                onError: {
                    target: "error",
                    actions: ["logError", "assignError"],
                }
            },
        },
        pending: {
            invoke: [{
                src: "pollingStatus",
                id: "deployment",
                input: ({ context }) =>({
                    deployment: context.deployment!.id,
                    interval: 1000 
                })
              }, {
                src: "buildLogs",
                id: "build",
                input: ({ context }) =>({
                    deployment: context.deployment!.id,
                    interval: 1000,
                    logs: context.buildLogs
                })
            }],
            on: {
                'log.*': {
                    actions: assign({
                        buildLogs: ({ context:{buildLogs}, event }) => [...buildLogs ||[], event]
                    })
                },
                "success": {
                    target: "running",
                    actions:  assign({
                        deployment: ({ event: {type, ...deployment } }) => ({status: type, ...deployment})
                    })
                },
                "failed": {
                    target: "error",
                    actions: assign({
                        deployment: ({ event: {type, ...deployment } }) => ({  status: type, ...deployment  })
                    })
                }
            }
        },
        running: {
              invoke:  {
                src: "appLogs",
                id: "app",
                input: ({ context }) => ({
                    deployment: context.deployment!.id,
                    interval: 3000,
                    logs: context.appLogs
                })
            },
            on: {
                stop: {
                    target: "stopping",
                },
                'log.*': {
                    actions: assign({
                        appLogs: ({ context:{appLogs}, event }) => [...appLogs ||[], event]
                    })
                } 
            } ,
            initial: 'healthCheck',
            states: {
                healthCheck: {
                  invoke: {
                    src: "healthChecker",
                    id: "health",
                    input: ({ context }) => context.deployment!.id,
                  },
                  on:{
                    'success': 'healthy',
                    'failed': 'unhealthy'
                  }
                },
                healthy: {
                    after: {
                        HEARTBEAT_INTERVAL: {target: 'healthCheck', actions: sendTo('healthCheck' , { type: 'PING' }) },
                      }
                },
                unhealthy: {
                    after: {
                        HEARTBEAT_INTERVAL: {target: 'healthCheck', actions: sendTo('healthCheck' , { type: 'PING' }) },
                      }
                }
              }
        },
        stopping: {
            invoke: {
                src: "stopDeployment",
                id: "deployment",
                input: ({ context }) => context.deployment!.id,
                onDone: {
                    target: "idle",
                    actions: "assignDeployment",
                },
                onError: {
                    target: "error",
                    actions: ["logError", "assignError"],
                },
            },
        },
        error: {
            on: {
                retry: [{
                     target: "building",
                }],
                reset: "idle",
            }
        },
    }
});

const workers = new Map<string, ActorRefFromLogic<typeof deploymentMachine>>();

const app = new Hono();
app.use("/*", cors());
app.use(prettyJSON());

// Middleware to handle organization
app.use(async (c, next) => {
    const organization = Deno.env.get("DEPLOY_ORG_ID")!;
    c.set("organization", organization);
    await next();
    c.header('x-organization', organization);
});

// Response formatter middleware
app.use(async (c, next) => {
    await next();

    if (c.get("@response.worker")) {
        const origin = new URL(c.req.url).origin;
        const worker = c.get("@response.worker") as ActorRefFromLogic<typeof deploymentMachine>;
        if (worker) {
            return c.json({
                id: worker.sessionId,
                url: `/workers/${worker.sessionId}`,
                data: worker?.getPersistedSnapshot(),
                links: {
                    self: `${origin}/workers/${worker.sessionId}`,
                    status: `${origin}/workers/${worker.sessionId}/status`,
                    ping: `${origin}/workers/${worker.sessionId}/ping`,
                    stop: `${origin}/workers/${worker.sessionId}/stop`,
                    retry: `${origin}/workers/${worker.sessionId}/retry`,
                    redeploy: `${origin}/workers/${worker.sessionId}/redploy`,
                    logs: `${origin}/workers/${worker.sessionId}/logs/build`,
                }
            });
        }
    }
});
// Projects routes
app.get("/projects", async (c) => {
    const projects = await subhosting.organizations.projects.list(c.get("organization"));
    return c.json(projects);
});

app.post("/projects", async (c) => {
    const project = await subhosting.organizations.projects.create(c.get("organization"), await c.req.text());
    return c.json(project, 201);
});

app.get("/projects/:project", async (c) => {
    const { project } = c.req.param();
    return c.json(await subhosting.projects.get(c.get("organization"), project));
});

// Workers routes
app.get("/projects/:project/workers", async (c) => {
    const { project } = c.req.param();
    const deployments = await subhosting.projects.deployments.list(project, {
        order: "desc",
    });
    return c.json(deployments);
});

app.post("/projects/:project/workers", async (c) => {
    const { project } = c.req.param();
    const actor = createActor(deploymentMachine, {
        input: {
            project: project,
            artifacts: {
                assets: {
                    'main.ts': {
                        "kind": "file",
                        "content": "Deno.serve(req => new Response('Hello World!'));",
                        "encoding": "utf-8",
                    }
                }, envVars: {}
            },
        },
        inspector: {
            next: console.log,
            error: console.error,
            state: (state) => console.log(state.value, state.event)
        }
    }).start();

    workers.set(actor.sessionId, actor);

    actor.send({
        type: "deploy",
    });
    c.set("@response.worker", actor);
});

app.get("/workers/:worker", async (c) => {
    const { worker } = c.req.param();
    const actor = workers.get(worker);
    if (!actor) {
        return c.json({ error: "Worker not found" }, 404);
    }
    c.set("@response.worker", actor);
});

app.post("/workers/:worker", async (c) => {
    const { worker } = c.req.param();
    const actor = workers.get(worker);
    if (!actor) {
        return c.json({ error: "Worker not found" }, 404);
    }
    const body = await c.req.json();
    const { code, envVars, assets, ...rest } = body;

    actor.send({
        type: "config",
        entryPointUrl: "main.ts",
        assets: {
            ...(code ? {
                "main.ts": {
                    "kind": "file",
                    "content": code,
                    "encoding": "utf-8",
                }
            } : {}),
            ...assets
        },
        envVars: {
            ...envVars
        },
        ...rest
    });
    c.set("@response.worker", actor);
});

app.post("/workers/:worker/start", async (c) => {
    const { worker } = c.req.param();
    const actor = workers.get(worker);
    if (!actor) {
        return c.json({ error: "Worker not found" }, 404);
    }
    actor.send({ type: "deploy" });
    c.set("@response.worker", actor);
});

app.post("/workers/:worker/status", async (c) => {
    const { worker } = c.req.param();
    const actor = workers.get(worker);
    if (!actor) {
        return c.json({ error: "Worker not found" }, 404);
    }
    actor.send({ type: "PING" });
    c.set("@response.worker", actor);
});

app.post("/workers/:worker/stop", async (c) => {
    const { worker } = c.req.param();
    const actor = workers.get(worker);
    if (!actor) {
        return c.json({ error: "Worker not found" }, 404);
    }
    actor.send({ type: "stop" });
    c.set("@response.worker", actor);
});


app.post("/workers/:worker/retry", async (c) => {
    const { worker } = c.req.param();
    const actor = workers.get(worker);
    if (!actor) {
        return c.json({ error: "Worker not found" }, 404);
    }
    actor.send({ type: "retry" });
    c.set("@response.worker", actor);
});
app.get("/workers/:worker/logs/build", async (c) => {
    const { worker } = c.req.param();
    const actor = workers.get(worker);
    if (!actor) {
        return c.json({ error: "Worker not found" }, 404);
    }
    return c.json(actor.getSnapshot().context.buildLogs);
});
app.get("/workers/:worker/logs/app", async (c) => {
    const { worker } = c.req.param();
    const actor = workers.get(worker);
    if (!actor) {
        return c.json({ error: "Worker not found" }, 404);
    }
    console.log(actor.getSnapshot().context.appLogs)
    // console.log("logs", await subhosting.deployments.appLogs.get(actor.getSnapshot().context.deployment.id))
    return c.json(actor.getSnapshot().context.appLogs);
});


app.get('/openapi.json', (c) => {
   return c.json(openApiDocument)
})

app.get(
    '/references',
    apiReference({
      spec: {
        url: '/openapi.json',
      },
    }),
 )
  app.get('/', (c) => {
      return c.redirect('/references')
  })
export default {
    port: 8000,
    fetch: app.fetch,
};
