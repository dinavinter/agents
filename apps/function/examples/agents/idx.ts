import { azure } from "https://esm.sh/@ai-sdk/azure";
import { ServiceController } from "https://esm.sh/@cxai/stream/xstate?target=esnext";
import {
  aiOptions,
  asyncBatchEvents,
  asyncEventGenerator,
  fromAIElementStream,
  fromAIEventStream,
} from "https://esm.sh/@cxai/stream?target=esnext";

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
import * as Y from "https://esm.sh/yjs@^13.6.20?target=esnext";
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
      type: z.literal("datasource.read.gigya.account").default("datasource.read.gigya.account"),
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
      type: "datasource.read.gigya.account",
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
      type: z.literal("field.rename").default("field.rename"),
      params: z.object({
        fields: z.array(z.object({
          sourceField: z.string(),
          targetField: z.string(),
        })),
      }),
    }),
    example: {
      id: "rename_fields",
      type: "field.rename",
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
      type: z.literal("field.remove").default("field.remove"),
      params: z.object({
        fields: z.array(z.string()),
      }),
    }),
    example: {
      id: "remove_fields",
      type: "field.remove",
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
      type: z.literal("datasource.write.sftp").default("datasource.write.sftp"),
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
      type: "datasource.write.sftp",
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
      type: z.literal("file.format.dsv").default("file.format.dsv"),
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
      type: "file.format.dsv",
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
    "datasource.read.gigya.account",
    "datasource.write.sftp",
    "field.rename",
    "field.remove",
    "file.format.dsv",
  ]),
  next: z.string().optional().describe("The ID of the next step in the workflow."),
  outputs: z.array(z.object({
    description: z.string(),
  })),
});
export type Step = z.infer<typeof stepSchemaMap>[string];

const machine = setup({ actors: {} as Actors }).createMachine({
  initial: "idle",
  context: {
    steps: [] as Step[],
    completedSteps: [] as Step[],
  } as {
    request?: string;
    steps: any[];
    currentStep?: number;
    completedSteps: any[];
  },
  types: {
    events: {} as
      | { type: "request"; request: string }
      | { type: "error"; error: Error }
      | { type: "step.details"; step: any },
  },
  states: {
    idle: {
      entry: emit({
        data: `<main class="mx-auto bg-slate-100 min-h-screen p-6">
                            <header class="sticky top-0 z-10 backdrop-blur-md bg-opacity-70 border-b border-gray-300 bg-white dark:bg-gray-800 flex items-center justify-center p-4 text-lg font-medium shadow">
                                IDX Flow Builder
                            </header>
                            <div class="flex flex-col items-center justify-center gap-6"  hx-swap="beforeend"  >
                                <form  class="isolate flex flex-col gap-4 w-full p-4">
                                    <div class="flex gap-2" sse-swap="request" hx-swap="outerHTML">
                                        <input type="text"
                                            autocomplete="on"
                                            list="idx-prompt"
                                            class="flex-1 p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            name="request"
                                            placeholder="What kind of app would you like to build?" />
                                        <button class="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                                                hx-post="events/request"
                                                hx-target="this">Create</button>
                                    </div>
                                    <pre sse-swap="@steps.text-delta" > </pre>
                                    <datalist id="idx-prompt" >
                                        <option value="please create me a dataflow which sync my accounts with sftp"></option>
                                    </datalist>
                                </form>
                               
                                <pre class="text-pretty" contenteditable><code sse-swap="steps" hx-swap="beforeend"></code> </pre>
                                <pre class="text-red-900 text-pretty" sse-swap="error" hx-swap="innerHTML" contenteditable> </pre> 
       
                            </div>
                        </main>`,
        type: "message",
      }),
      on: {
        request: {
          target: "draft",
          actions: [
            assign({
              request: ({ event }) => event.request,
              completedSteps: () => [],
              currentStep: () => 0,
            }),
            emit(({ event: { request } }) => ({
              data: `<div class="flex gap-2 w-full p-4">
                                   <input type="text"
                                   class="flex-1 p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                   name="request"
                                   disabled
                                   value="${request}" />
                                 </div> `,
              type: "request",
              defer: 250,
            })),
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
            currentStep: ({ context: { steps } }) => steps[0],
          }),
        },
        onError: "error",
      },
      on: {
        "output": {},
        "*": {
          actions: [
            assign({
              steps: ({ event, context: { steps } }) => [...steps, event],
            }),
            emit(({ event: { offset, timestamp, ...event } }) => ({
              data: `<article class="shadow"><code sse-swap="${event.id}" hx-swap="innerHTML" lang="json">${
                JSON.stringify(event, null, 2)
              }</code>,</article>`,
              type: "steps",
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
        input: ({ context }) => {
          const currentStep = context.currentStep;
          const previousStep = context.completedSteps[context.completedSteps.length - 1];
          const stepType = currentStep.type as keyof typeof stepSchemaMap;
          const stepConfig = stepSchemaMap[stepType];

          if (!stepConfig) {
            throw new Error(`Unknown step type: ${stepType}`);
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
            assign({
              currentStep: ({ context: { currentStep }, event: { output } }) => ({
                ...currentStep,
                ...output,
                id: currentStep.id,
              }),
            }),
            emit(({ context: { currentStep } }) => ({
              data: JSON.stringify(currentStep, null, 2),
              type: currentStep.id,
            })),
          ],
        },
        onError: {
          target: "details",
          reentrant: true,
          actions: [
            assign({
              currentStep: ({ context: { currentStep }, event: { error } }) => ({
                ...currentStep,
                error: error,
                id: currentStep.id,
              }),
            }),
            emit(({ context: { currentStep } }) => ({
              data: JSON.stringify(currentStep, null, 2),
              type: currentStep.id,
            })),
          ],
        },
      },
    },
    next_step: {
      always: [
        {
          guard: ({ context: { currentStep } }) => currentStep.next,
          target: "details",
          actions: assign({
            currentStep: ({ context: { currentStep, steps } }) => steps.find(e => e.id === currentStep.next),
          }),
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

const id = "idx-gen";
const rev = "203";
const agent = connectYjs(id);
agent.getMap().set("rev", rev);
agent.getMap().set("codemirror", `${machine.toJSON()}`);

const runtime = connectYjs(`${id}:${rev}`);

const service = createYjsActor(machine, runtime).start();

export default async function(req: Request): Promise<Response> {
  const snapshot = service.getSnapshot();
  const mode = req.url.split("/").slice(2).pop();
  const agentsUrl = `https://agents.cfapps.us10-001.hana.ondemand.com/agents`;
  return new Response(
    `<embed style="height: 100vh; width: 100vw;" src="${agentsUrl}/${id}/${mode || `${rev}/view`}" />`,
    {
      headers: {
        "content-type": "text/html",
      },
    },
  );
}