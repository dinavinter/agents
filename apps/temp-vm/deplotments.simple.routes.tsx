/** @jsxImportSource https://esm.sh/hono@latest/jsx **/

/// <reference types="npm:typed-htmx" />

import Subhosting from "https://esm.sh/subhosting";
import { Deployment, Deployments, Projects } from "https://esm.sh/subhosting/resources";
import { agentRuntime } from "https://esm.town/v/dinavinter/runner";
import { html, jsx } from "npm:hono";
import type { FC } from "npm:hono/jsx";
import { stream, streamSSE, streamText } from "npm:hono/streaming";
import { z } from "npm:zod@^3.24.1";

import { fromEventAsyncGenerator, yArrayIterator, yMapIterate } from "https://esm.sh/@cxai/stream?target=esnext";
import {
    ActorRefFromLogic,
    assertEvent,
    assign,
    createActor,
    emit,
    fromCallback,
    fromPromise,
    sendTo,
    setup,
} from "https://esm.sh/xstate@5.19.0";
import { apiReference } from "npm:@scalar/hono-api-reference";
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { prettyJSON } from "npm:hono/pretty-json";

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
    buildLogs: { message: string; level: string }[];
    appLogs: { message: string; level: string; time: string; region: string }[];
    artifacts: Projects.DeploymentCreateParams;
};

// Deployment Machine Setup
export const deploymentMachine = setup({
    delays: { HEARTBEAT_INTERVAL: 30000 },
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
                const { assets, ...artifacts } = input || {};
                // Add build logic here if needed
                return {
                    assets: assets ? assets : {
                        "main.ts": {
                            kind: "file",
                            content: `Deno.serve(req => new Response("Hello!"));`,
                            encoding: "utf-8",
                        },
                    },
                    envVars: {},
                    entryPointUrl: "main.ts",
                    ...artifacts,
                };
            },
        ),

        deploymentHandler: fromPromise(
            async (
                { input, self }: {
                    input: DeploymentMachineContext["artifacts"];
                    self: ActorRefFromLogic<typeof deploymentMachine>;
                },
            ) => {
                const { project, artifacts } = input;
                console.log("deploying", project, artifacts);
                return await subhosting.projects.deployments.create(
                    project || self.id,
                    artifacts,
                );
            },
        ),
        buildLogs: fromEventAsyncGenerator(
            async function*(
                { input: { interval, deployment, logs: previousLogs } }: {
                    input: { interval: number; deployment: string; logs: { message: string; level: string }[] };
                },
            ) {
                const history: { level: string; message: string }[] = previousLogs || [];
                while (true) {
                    const logs = await subhosting.deployments.buildLogs.get(deployment);
                    for (const log of logs.filter(l => !history.find(log => log.message === l.message))) {
                        yield {
                            type: `log.${log.level}`,
                            message: log.message,
                        };
                        history.push(log);
                    }
                    await new Promise((resolve) => setTimeout(resolve, interval));
                }
            },
        ),
        appLogs: fromEventAsyncGenerator(
            async function*(
                { input: { deployment, logs, interval } }: {
                    input: { interval: number; deployment: string; logs: { time: string }[] };
                },
            ) {
                let since = logs?.[-1]?.time || new Date(0).toISOString();
                while (true) {
                    const logs = await subhosting.deployments.appLogs.get(deployment, {
                        since: since,
                        limit: 100,
                        sort: "time",
                        order: "asc",
                    });
                    for (
                        const log of logs.sort((a, b) => a.time.localeCompare(b.time)).filter(log =>
                        log.time.localeCompare(since) > 0
                    )
                        ) {
                        yield {
                            type: `log.${log.level}`,
                            message: log.message,
                            time: log.time,
                            region: log.region,
                        };
                        since = log.time;
                    }
                    await new Promise((resolve) => setTimeout(resolve, interval));
                }
            },
        ),

        pollingStatus: fromEventAsyncGenerator(
            async function*({ input: { deployment, interval } }: { input: { interval: number; deployment: string } }) {
                while (true) {
                    const response = await subhosting.deployments.get(deployment);
                    yield {
                        type: response.status, // "success" | "failed" | "pending"
                        ...response,
                    };
                    await new Promise((resolve) => setTimeout(resolve, interval));
                }
            },
        ),

        stopDeployment: fromPromise(
            async ({ input: deployment }: { input: string }) => {
                return await subhosting.deployments.delete(deployment);
            },
        ),

        healthChecker: fromCallback(function({ receive, sendBack, input }) {
            subhosting.deployments.get(input).then((res) => {
                sendBack({
                    type: res.status, // "success" | "failed" | "pending"
                    ...res,
                });
            });
            receive(async ({ type }) => {
                console.log("Health check received", input, type);
                if (type === "PING") {
                    const { status, ...rest } = await subhosting.deployments.get(input);
                    console.log("Health check response", status, rest);
                    sendBack({
                        type: status, // "success" | "failed" | "pending"
                        ...rest,
                    });
                }
            });
        }),
    },

    actions: {
        assignArtifacts: assign({
            artifacts: ({ event: { output }, context: { artifacts } }) => {
                return { ...artifacts || {}, ...output };
            },
        }),

        assignError: assign({
            error: ({ event }) => {
                return event.error;
            },
        }),
        assignDeployment: assign({
            deployment: ({ event: { type, ...deployment } }) => {
                return deployment;
            },
        }),

        logError: assign({
            error: ({ event }) => {
                return event.error;
            },
        }),
    },
}).createMachine({
    id: "deployment",
    initial: "idle",
    context: ({ input: { artifacts, ...input } }) => ({
        buildLogs: [],
        appLogs: [],
        organization: Deno.env.get("DEPLOY_ORG_ID")!,
        ...input,
        artifacts: artifacts,
    }),
    states: {
        idle: {
            on: {
                deploy: {
                    target: "building",
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
                        artifacts: ({ event: { type, ...artifacts } }) => artifacts,
                    }),
                },
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
                        deployment: ({ event: { output: deployment } }) => deployment,
                    }),
                },
                onError: {
                    target: "error",
                    actions: ["logError", "assignError"],
                },
            },
        },
        pending: {
            invoke: [{
                src: "pollingStatus",
                id: "status",
                input: ({ context }) => ({
                    deployment: context.deployment!.id,
                    interval: 1000,
                }),
            }, {
                src: "buildLogs",
                id: "build",
                input: ({ context }) => ({
                    deployment: context.deployment!.id,
                    interval: 1000,
                    logs: context.buildLogs,
                }),
            }],
            on: {
                "log.*": {
                    actions: assign({
                        buildLogs: ({ context: { buildLogs }, event }) => [...buildLogs || [], event],
                    }),
                },
                "success": {
                    target: "running",
                    actions: assign({
                        deployment: ({ event: { type, ...deployment } }) => ({ status: type, ...deployment }),
                    }),
                },
                "failed": {
                    target: "error",
                    actions: assign({
                        deployment: ({ event: { type, ...deployment } }) => ({ status: type, ...deployment }),
                    }),
                },
            },
        },
        running: {
            invoke: {
                src: "appLogs",
                id: "app",
                input: ({ context }) => ({
                    deployment: context.deployment!.id,
                    interval: 3000,
                    logs: context.appLogs,
                }),
            },
            on: {
                stop: {
                    target: "stopping",
                },
                "log.*": {
                    actions: assign({
                        appLogs: ({ context: { appLogs }, event }) => [...appLogs || [], event],
                    }),
                },
            },
            initial: "healthCheck",
            states: {
                healthCheck: {
                    invoke: {
                        src: "healthChecker",
                        id: "health",
                        input: ({ context }) => context.deployment!.id,
                    },
                    on: {
                        "success": "healthy",
                        "failed": "unhealthy",
                    },
                },
                healthy: {
                    after: {
                        HEARTBEAT_INTERVAL: { target: "healthCheck", actions: sendTo("healthCheck", { type: "PING" }) },
                    },
                },
                unhealthy: {
                    after: {
                        HEARTBEAT_INTERVAL: { target: "healthCheck", actions: sendTo("healthCheck", { type: "PING" }) },
                    },
                },
            },
        },
        stopping: {
            invoke: {
                src: "stopDeployment",
                id: "stopping",
                input: ({ context }) => context.deployment!.id,
                onDone: {
                    target: "idle",
                    actions: assign({
                        deployment: ({ event: { type, ...deployment } }) => ({ status: "stopped", ...deployment }),
                    }),
                },
                onError: {
                    target: "error",
                    actions: ["logError", "assignError"],
                },
            },
        },
        error: {
            on: {
                // retry: [{
                //   target: "building",
                // }],
                reset: "idle",
            },
        },
    },
});

// hunoapp
const app = new Hono();
const services = new Map<string, ReturnType<typeof agentRuntime>>();
function getOrCreateService({ agent, rev }: { agent: string; rev: string }) {
    if (!services.has(`${agent}:${rev}`)) {
        const service = agentRuntime({ machine: deploymentMachine, id: agent, rev, input: { project: agent } });
        // service.start();
        services.set(`${agent}:${rev}`, service);
    }
    return services.get(`${agent}:${rev}`)!;
}
app.use("/*", cors());

app.get("/favicon.ico", (c) => c.text(null));

app.get("/", c => c.redirect("/dark-bear-25"));

app.get("/:agent/:rev", async (c) => {
    const { agent, rev } = c.req.param();

    const service = getOrCreateService({ agent, rev });
    const jsx = (
        <html lang="en">
        <head>
            <link
                rel="icon"
    href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚙️</text></svg>"
    />
    <title class="text-upper">{agent} / ${rev}</title>
    <script src="https://unpkg.com/htmx.org@2.0.2"></script>
        <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
        <script src="https://unpkg.com/@tailwindcss/browser@4"></script>
        </head>
        <body class="h-screen w-screen w-screen relative">
    <article
        className="container relative w-full text-xs flex-col gap-4 p-4 gap-6 *:m-4"
    hx-ext="sse"
    sse-connect={`${rev}/context`}
>
    <div
        className="sticky top-5 y-inset-0 w-full gap-6 grid grid-rows-1 grid-row-1 "
    hx-trigger="sse:state"
    hx-swap="outerHTML transition:true settle:1s"
    hx-get={`${rev}/navbar`}
>
    </div>
    <pre sse-swap="state" hx-swap="innerHTML transition:true swap:1s settle:1s ">
        {JSON.stringify(service.doc.getMap("state").get("value"), null, 2)}
        </pre>
        <pre sse-swap="context" hx-swap="innerHTML transition:true swap:1s settle:1s">
        {JSON.stringify(service.doc.getMap("context").toJSON(), null, 2)}
        </pre>
        <pre sse-swap="emitted" hx-swap="innerHTML transition:true swap:1s settle:1s">
        {JSON.stringify(service.doc.getArray("emitted").toJSON(), null, 2)}
        </pre>
        <pre sse-swap="time-update" hx-swap="innerHTML transition:true swap:1s settle:1s"></pre>
        </article>
        </body>
        </html>
);
    console.log(agent, rev, jsx.toString());
    return c.html(jsx.toString());
});

app.post("/:agent/:rev/events/:event", async (c) => {
    const { agent, rev, event } = c.req.param();
    const service = getOrCreateService({ agent, rev });
    service.start();
    console.log("service started at", service.getSnapshot().value());
    service.stop();
    const body = await c.req.formData();

    service.doc.getArray("events").push([{
        type: event,
        ...body,
    }]);

    return c.html(
        <div className="flex w-full " hx-trigger="load" hx-get={`${rev}/navbar`}></div>,
);
});

app.get("/:agent/:rev/navbar", async (c) => {
    const { agent, rev } = c.req.param();
    const service = getOrCreateService({ agent, rev });
    const events = Object.keys(service.doc.getMap("next").toJSON());
    const next: string[] = service.doc.getMap("current").get("next")?.split(",")?.filter(e =>
        !e.includes("xstate.") && !e.includes("log.*")
    ) || [];
    return c.html(
        <div
            className="sticky-0 y-inset-0 w-full gap-6 grid grid-rows-1 grid-row-1 "
    hx-trigger="sse:state"
    hx-swap="outerHTML transition:true settle:1s"
    hx-get={`${rev}/navbar`}
>
    {next.map((event) => {
        return (
            <form
                hx-post={`${rev}/events/${event}`}
        hx-trigger="submit"
        hx-target="closest div"
        >
        <button className="outline-1 px-4 py-2 cursor-pointer pointer-events-auto " type="submit">
            {event}
            </button>
            </form>
    );
    })}
    </div>,
);
});
let id = 0;

app.get("/:agent/:rev/context", async (c) => {
    const { agent, rev } = c.req.param();
    const service = getOrCreateService({ agent, rev });

    return streamSSE(c, async (stream) => {
        async function streamContext() {
            await stream.writeSSE({
                event: "context",
                data: JSON.stringify(service.doc.getMap("context").toJSON(), null, 2),
                id: String(id++),
            });
        }

        async function streamState() {
            await stream.writeSSE({
                event: "state",
                data: JSON.stringify(service.doc.getMap("state").get("value"), null, 2),
                id: String(id++),
            });
        }

        async function streamNext() {
            await stream.writeSSE({
                event: "next",
                data: JSON.stringify(
                        service.doc.getMap("current").get("next")?.split(",")?.filter(e => !e.includes("xstate.")),
                        null,
                        2,
                    )
                    || JSON.stringify("No next st", null, 2),
                id: String(id++),
            });
        }
        async function streamEmitted() {
            await stream.writeSSE({
                event: "events",
                data: JSON.stringify(
                    service.doc.getArray("emitted"),
                    null,
                    2,
                ),
                id: String(id++),
            });
        }
        service.doc.getMap("state").observe(streamContext);
        service.doc.getMap("context").observe(streamState);
        service.doc.getMap("next").observe(streamNext);
        service.doc.getArray("emitted").observe(streamEmitted);

        stream.onAbort(() => {
            service.doc.getMap("state").unobserve(streamContext);
            service.doc.getMap("context").unobserve(streamState);
            service.doc.getMap("next").unobserve(streamNext);
            service.doc.getArray("emitted").unobserve(streamEmitted);
        });
        await streamContext();
        await streamState();
        await streamNext();
        while (true) {
            const message = `${new Date().toISOString()}`;
            await stream.writeSSE({
                data: message,
                event: "time-update",
                id: String(id++),
            });
            await stream.sleep(3000);
        }
    });
});

export default app.fetch;