/**
 * A2A Observable Actors - drop-in replacements for fromAIEventStream and fromAIElementStream
 * that route through a deployed A2A agent instead of calling the AI SDK directly.
 *
 * Same API surface: accepts the same options (model, template, tools, schema, etc.),
 * resolves templates with aiOptions, then sends as A2A task and streams back events.
 */

import { CoreTool, TextStreamPart } from "ai";
import { EventObject, ObservableActorLogic } from "xstate";
import { fromEventAsyncGenerator } from "../stream";
import {
  aiOptions,
  FromDefault,
  OneOf,
  StreamObjectOptions,
  StreamTextOptions,
} from "../ai/options";
import { streamA2ATask, type A2ATaskParams } from "./client";
import { zodToJsonSchema } from "./schema";

/**
 * Replaces fromAIEventStream - sends text streaming requests to the A2A agent.
 *
 * The agent machine sees the same events: text-delta, tool-call, tool-result, finish, output.
 * The A2A agent processes them server-side and streams back the same event shapes.
 */
export function fromA2AEventStream<
  TDefaultOptions extends Partial<StreamTextOptions>,
  TOptions extends FromDefault<
    StreamTextOptions,
    TDefaultOptions
  > = FromDefault<StreamTextOptions, TDefaultOptions>,
  TTools extends OneOf<TOptions, TDefaultOptions, "tools"> &
    Record<string, CoreTool> = OneOf<TOptions, TDefaultOptions, "tools"> &
    Record<string, CoreTool>
>(defaultOptions?: TDefaultOptions) {
  return fromEventAsyncGenerator(async function* ({ input, self, emit }) {
    const resolvedOptions: any = await aiOptions(
      self._parent?.getSnapshot()?.context,
      defaultOptions,
      input as any
    );

    // Serialize tools for A2A transport
    const tools = resolvedOptions.tools
      ? serializeTools(resolvedOptions.tools as Record<string, CoreTool>)
      : undefined;

    const params: A2ATaskParams = {
      prompt: resolvedOptions.prompt || "",
      mode: "text",
      system: resolvedOptions.system as string | undefined,
      temperature: resolvedOptions.temperature,
      tools,
    };

    for await (const event of streamA2ATask(params)) {
      if (event.type === "text-delta") {
        yield event as any;
        emit({
          type: "text-delta",
          data: event.textDelta,
        } as any);
      } else if (event.type === "output") {
        yield {
          type: "output",
          output: event.output,
        } as any;
      } else {
        // Forward tool-call, tool-result, finish, etc.
        yield event as any;
      }
    }
  }) satisfies ObservableActorLogic<
    TextStreamPart<TTools> | { type: "output"; output: string },
    TOptions | string,
    { type: "text-delta"; data: string }
  >;
}

/**
 * Replaces fromAIElementStream - sends structured object streaming requests to the A2A agent.
 *
 * The agent machine sees individual elements yielded one by one, then a final output array.
 * The A2A agent uses streamObject with output:'array' and streams back each element.
 */
export function fromA2AElementStream<
  OBJECT extends EventObject,
  TDefaultOptions extends Partial<StreamObjectOptions<OBJECT>>,
  TOptions extends FromDefault<
    StreamObjectOptions<OBJECT>,
    TDefaultOptions
  > = FromDefault<StreamObjectOptions<OBJECT>, TDefaultOptions>,
  TTools extends OneOf<TOptions, TDefaultOptions, "tools"> &
    Record<string, CoreTool> = OneOf<TOptions, TDefaultOptions, "tools"> &
    Record<string, CoreTool>
>(defaultOptions?: TDefaultOptions) {
  return fromEventAsyncGenerator(async function* ({ input, self, emit }) {
    console.log('[a2a/element] Generator started, resolving options...');
    const resolvedOptions: any = await aiOptions<StreamObjectOptions<OBJECT>>(
      self._parent?.getSnapshot()?.context,
      defaultOptions,
      input as any
    );
    console.log('[a2a/element] Options resolved, prompt length:', resolvedOptions.prompt?.length);

    // Convert Zod schema to JSON Schema for A2A transport
    const schema = resolvedOptions.schema
      ? zodToJsonSchema(resolvedOptions.schema)
      : undefined;

    const tools = resolvedOptions.tools
      ? serializeTools(resolvedOptions.tools as Record<string, CoreTool>)
      : undefined;

    const params: A2ATaskParams = {
      prompt: resolvedOptions.prompt || "",
      mode: "array",
      schema,
      system: resolvedOptions.system as string | undefined,
      temperature: resolvedOptions.temperature,
      tools,
    };

    const elements: OBJECT[] = [];

    for await (const event of streamA2ATask(params)) {
      if (event.type === "element") {
        // Individual element from the array stream
        const element = event.data as OBJECT;
        elements.push(element);
        yield element;
      } else if (event.type === "output") {
        // Final output
        const output = event.output || elements;
        yield {
          type: "output",
          output,
        } as any;
      } else if (event.type !== "unknown") {
        // Could be an element directly (the agent sends objects as events)
        if (event.type && event.type !== "text-delta") {
          elements.push(event as OBJECT);
          yield event as any;
        }
      }
    }
  }) satisfies ObservableActorLogic<
    OBJECT & { type: "output"; output: OBJECT[] },
    TOptions | string,
    any
  >;
}

/**
 * Serialize CoreTool definitions into a plain JSON format for A2A transport.
 */
function serializeTools(
  tools: Record<string, CoreTool>
): Record<string, { description: string; parameters: any }> {
  const serialized: Record<string, { description: string; parameters: any }> =
    {};
  for (const [name, tool] of Object.entries(tools)) {
    serialized[name] = {
      description: (tool as any).description || name,
      parameters: (tool as any).parameters
        ? zodToJsonSchema((tool as any).parameters)
        : {},
    };
  }
  return serialized;
}
