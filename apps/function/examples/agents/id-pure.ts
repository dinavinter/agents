import { azure } from "https://esm.sh/@ai-sdk/azure";
import * as Y from "https://esm.sh/yjs@^13.6.20?target=esnext";

import {
  aiOptions,
  asyncBatchEvents,
  asyncEventGenerator,
  fromAIElementStream,
  fromAIEventStream,
} from "https://esm.sh/@cxai/stream@1.0.16?target=esnext";
import { ServiceController } from "https://esm.sh/@cxai/stream@1.0.17/xstate?target=esnext";

import {
  HocuspocusProvider,
  type HocuspocusProviderConfiguration,
  HocuspocusProviderWebsocket,
} from "https://esm.sh/@hocuspocus/provider@2.15.0?&external=ws&target=esnext";
import type { AnyEventObject, UnknownActorLogic } from "https://esm.sh/xstate@^5.19.0";
import {
  AnyStateMachine,
  assign,
  createActor,
  createMachine,
  emit,
  fromPromise,
  setup,
} from "https://esm.sh/xstate@^5.19.0";
import type { LanguageModelV1 } from "npm:@ai-sdk/provider";
import { generateObject } from "npm:ai";
import { z } from "npm:zod@^3.24.1";
type Actors = {
  aiStream: ReturnType<typeof fromAIEventStream<{ model: LanguageModelV1 }>>;
  aiElementStream: ReturnType<typeof fromAIEventStream>;
} & Record<string, UnknownActorLogic>;

const options: Partial<HocuspocusProviderConfiguration> = {};
function createYjsActor(machine: AnyStateMachine, doc: Y.Doc) {
  return createActor(ServiceController, {
    id: "service",
    input: {
      doc: doc,
      logic: machine.provide({
        actors: {
          stream: asyncEventGenerator,
          batch: asyncBatchEvents,
          aiObject: fromPromise(
            async ({ input, self }) => {
              const { object } = await generateObject(
                await aiOptions(self._parent?.getSnapshot()?.context, {
                  model: azure("gpt-4o"),
                  temperature: 0.4,
                  maxTokens: 1000,
                }, input),
              );
              return object;
            },
          ),
          aiElementStream: fromAIElementStream({
            model: azure("gpt-4o"),
            temperature: 0.9,
          }),
          aiStream: fromAIEventStream({
            model: azure("gpt-4o"),
            temperature: 0.9,
          }),
        },
      }),
      input: { doc },
    },
  });
}

function connectYjs(doc: Y.Doc | string) {
  const provider = new HocuspocusProvider({
    preserveConnection: true,
    broadcast: true,
    url: Deno.env.get("YJS_URL"),
    document: typeof doc === "string" ? new Y.Doc({ guid: doc }) : doc,
    websocketProvider: new HocuspocusProviderWebsocket({
      url: Deno.env.get("YJS_URL"),
      WebSocketPolyfill: WebSocket,
    }),
    forceSyncInterval: true,
    name: typeof doc === "string" ? doc : doc?.guid || "default",
    ...options,
    connect: true,
  });

  console.log("connected to yjs", provider.document.guid, Deno.env.get("YJS_URL"), provider.isConnected);

  provider.document.load();
  return provider.document;
}
const baseStepSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  next: z.string().optional().describe("The ID of the next step in the workflow."),
  outputs: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
  })),
});

export const stepSchemaMap = {
  "datasource.read.gigya.account": {
    schema: baseStepSchema.extend({
      type: z.literal("@step.datasource.read.gigya.account").default("@step.datasource.read.gigya.account"),
      params: z.object({
        select: z.string().describe(
          `Comma-separated list of fields to extract. For the list of SAP Customer Data Cloud fields, see the Account object. For the list that includes your custom fields as well, see the Schema Editor on the Accounts Schema page of the SAP Customer Data Cloud Console). For example, enter "UID, profile.firstName" to extract the 'UID' and 'profile.firstName' fields from the Accounts object.`,
        ),
        from: z.string().describe("The name of the data source. Can be accounts, emailAccounts, communications."),
        where: z.string().describe("An SQL-like WHERE clause to filter Account objects."),
        consent: z.string().describe(
          "The consent status of the account. For example, enter 'consent' to extract only accounts with a consent status of 'consent'.",
        ),
        orderBy: z.string().describe(
          "A comma-separated list of fields to sort by. For example, enter 'profile.firstName, profile.lastName' to sort by first name and last name.",
        ),
        deltaField: z.string().describe(
          `The timestamp field to filter accounts by. The component will extract accounts where this timestamp is newer than the timestamp of the last successful run of the dataflow.We recommend using this dynamic indication with the “deltaField” instead of using it with the “Where” parameter. The performance with the “deltaField” is significantly higher, because it doesn’t require a full extract of the database.`,
        ),
      }),
    }),
    example: {
      id: "read_gigya",
      type: "@step.datasource.read.gigya.account",
      description: "Reads user accounts from Gigya platform",
      params: {
        select: "UID, profile.firstName",
        from: "accounts",
        where: "isRegistered = false AND createdTimestamp < ${now-1h}",
        consent: "consent",
        orderBy: "profile.firstName, profile.lastName",
        deltaField: "lastUpdatedTimestamp",
      },
      outputs: [
        {
          name: "accounts",
          type: "array",
          schema: {
            type: "object",
            properties: {
              UID: { type: "string" },
              profile: {
                type: "object",
                properties: {
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                },
              },
            },
          },
          description: "Array of user account objects containing profile data",
        },
      ],
    },
  },
  "field.rename": {
    schema: baseStepSchema.extend({
      type: z.literal("@step.field.rename").default("@step.field.rename"),
      params: z.object({
        fields: z.array(z.object({
          sourceField: z.string(),
          targetField: z.string(),
        })),
      }),
    }),
    example: {
      id: "rename_fields",
      type: "@step.field.rename",
      description: "Renames fields in the data structure",
      params: {
        fields: [
          { sourceField: "oldName", targetField: "newName" },
        ],
      },
      outputs: [
        {
          name: "renamedData",
          type: "object",
          description: "Data with renamed fields",
        },
      ],
    },
  },
  "field.remove": {
    schema: baseStepSchema.extend({
      type: z.literal("@step.field.remove").default("@step.field.remove"),
      params: z.object({
        fields: z.array(z.string()),
      }),
    }),
    example: {
      id: "remove_fields",
      type: "@step.field.remove",
      description: "Array of user account objects containing age field",
      params: {
        fields: ["profile.firstName", "profile.lastName"],
      },
      outputs: [
        {
          name: "accounts",
          type: "object",
          description: "Array of user account objects containing birthYear field",
        },
      ],
    },
  },
  "datasource.write.sftp": {
    schema: baseStepSchema.extend({
      type: z.literal("@step.datasource.write.sftp").default("@step.datasource.write.sftp"),
      params: z.object({
        host: z.string(),
        username: z.string(),
        password: z.string(),
        remotePath: z.string(),
        port: z.number().optional(),
      }),
    }),
    example: {
      id: "write_sftp",
      type: "@step.datasource.write.sftp",
      description: "Writes data to SFTP",
      params: {
        host: "...",
        username: "...",
        password: "...",
        remotePath: "GigyaDaily",
        port: 22,
      },
    },
  },
  "file.format.dsv": {
    schema: baseStepSchema.extend({
      type: z.literal("@step.file.format.dsv").default("@step.file.format.dsv"),
      params: z.object({
        fileName: z.string(),
        columnSeparator: z.string(),
        quoteFields: z.boolean(),
        writeHeader: z.boolean(),
        lineEnd: z.string(),
        createEmptyFile: z.boolean(),
      }),
    }),
    example: {
      id: "format_dsv",
      type: "@step.file.format.dsv",
      description: "Writes data to SFTP",
      params: {
        fileName: "GIGYA_TO_SFTP_${now}.csv",
        columnSeparator: ",",
        quoteFields: true,
        writeHeader: true,
        lineEnd: "\n",
        createEmptyFile: false,
      },
    },
  },
  // Add other step types as needed
};

const basicStepSchema = z.object({
  id: z.string(),
  type: z.enum([
    "@step.datasource.read.gigya.account",
    "@step.datasource.write.sftp",
    "@step.field.rename",
    "@step.field.remove",
    "@step.file.format.dsv",
  ]),
  next: z.string().optional().describe("The ID of the next step in the workflow."),
  outputs: z.array(z.object({
    description: z.string(),
  })),
});
export type Step = z.infer<typeof stepSchemaMap>[string];

const machine = setup({ actors: {} as Actors }).createMachine({
  initial: "idle",
  context: {} as {
    current: string;
    previous: string;
  } | Record<string, Step>,
  types: {
    events: {} as
      | { type: "request"; request: string }
      | { type: "error"; error: Error }
      | { type: "step.details"; step: any },
  },
  states: {
    idle: {
      on: {
        request: {
          meta: {
            "@input": "request",
          },
          target: "draft",
          actions: [
            assign({
              request: ({ event }) => event.request,
            }),
          ],
        },
      },
    },
    draft: {
      invoke: {
        id: "aiElementStream",
        syncSnapshot: true,
        src: "aiElementStream",
        input: {
          schema: basicStepSchema,
          system: `You are an expert in creating IDX Flows. Your task is to create IDX Flow steps.          
          Generate the basic step structure with:
          - A unique 'id' field (string)
          - A 'type' field matching one of the allowed types
          - A 'description' explaining what this step does
          - 'outputs' array describing the data this step will produce
          
          Example:
          {
            "id": "1",
            "type": "datasource.read.gigya.account",
            "description": "Reads user accounts from Gigya platform",
            "next" : "2",
            "outputs": [
              {
                "name": "accounts",
                "type": "array",
                "description": "Array of user account objects containing profile data"
              }
            ]
          }`,
          template: "{{request}}",
        },
        onDone: {
          target: "details",
          actions: assign({
            current: ({ context }: { context: Record<string, Step> }) =>
              Object.keys(context).find(s => !Object.values(context).map((e) => e?.next).includes(s)),
          }),
        },
        onError: "error",
      },
      on: {
        "output": {},
        "@step.*": {
          actions: [
            assign(({ event, context }) => ({
              ...context,
              [event.id]: {
                ...event,
                type: event.type?.replace("@step.", ""),
                "@genai/status": "draft",
              },
            })),
          ],
        },
      },
    },
    details: {
      invoke: {
        id: "details",
        syncSnapshot: true,
        src: "aiObject",
        input: ({ context: { current, previous, ...steps } }) => {
          const currentStep = steps[current];
          const previousStep = previous ? steps[previous] : {};
          const stepType = currentStep?.type as keyof typeof stepSchemaMap;
          const stepConfig = stepSchemaMap[stepType];

          if (!stepConfig) {
            throw new Error(`Unknown step type: ${stepType} ${JSON.stringify(currentStep)}`);
          }

          return {
            schema: stepConfig.schema,
            system: `You are an expert in creating IDX Flows. Your task is to add details to this ${stepType} step.
            
            Current step:
            ${JSON.stringify(currentStep)}
            
            ${
              previousStep
                ? `Previous step output:
            ${JSON.stringify(previousStep.outputs)}`
                : ""
            }
            
            Example for ${stepType}:
            ${JSON.stringify(stepConfig.example)}
            
            Use the previous step's outputs to inform this step's inputs where applicable.`,
            template: "{{request}}",
          };
        },
        onDone: {
          target: "next_step",
          actions: [
            assign(({ event, context: { previous, current, ...steps } }) => ({
              ...steps,
              [current]: {
                ...steps[current],
                ...event,
                type: event.type?.replace("@step.", ""),
                "@genai/status": "completed",
              },
              previous: current,
              current: steps[current].next,
            })),
          ],
        },
        onError: {
          target: "next_step",
          reentrant: true,
          assign: (({ event: { error }, context: { current, ...steps } }) => ({
            ...steps,
            [current]: {
              ...steps[current],
              error: error,
              id: current,
              "@genai/status": "error",
            },
            previous: current,
            current: steps[current].next,
          })),
        },
      },
    },
    next_step: {
      always: [
        {
          guard: ({ context: { current } }) => current,
          target: "details",
        },
        {
          target: "done",
        },
      ],
    },
    error: {
      entry: [
        emit(({ event }) => ({
          type: "error",
          data: JSON.stringify(event),
        })),
      ],
    },
    done: {
      entry: [
        emit({
          data: `Done &#128640; &#128582;`,
          type: "status",
        }),
      ],
    },
  },
});

function createMachineDoc(agent: string, rev: string) {
  getOrCreateDoc(agent, (doc) => {
    doc.getMap().set("rev", rev);
    doc.getMap().set("codemirror", `export default ${machine.toJSON()}`);
    doc.getMap("revisions").set(rev, "idle");
  });
  return getOrCreateDoc(`${agent}:${rev}`);
}
const docs = new Map<string, Y.Doc>();
function getOrCreateDoc(id: string, onCreate?: (doc: Y.Doc) => void) {
  if (!docs.has(id)) {
    const doc = connectYjs(id);
    onCreate && onCreate(doc);
    docs.set(id, doc);
  }
  return docs.get(id);
}
export default async function(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.split("/").slice(1);
  console.log(path);
  const mode = path.pop() || "view";
  const rev = path.pop() || "a11";
  const id = "idx-gen-clean";
  const runtime = createMachineDoc(id, rev);
  const service = createYjsActor(machine, runtime).start();

  const agentsUrl = `https://agents.cfapps.us10-001.hana.ondemand.com/agents`;
  return new Response(
    `<embed style="height:  20vh; width: 100vw;" src="${agentsUrl}/${id}/${rev}/${mode}" />
      <pre   style="height:  80vh; width: 100vw;">
         ${JSON.stringify(runtime.getMap("state").get("context") || {}, null, 2)} 
         <pre>${JSON.stringify(runtime.getMap("next").toJSON() || {}, null, 2)}</pre>
     </pre>
    `,
    {
      headers: {
        "content-type": "text/html",
      },
    },
  );
}