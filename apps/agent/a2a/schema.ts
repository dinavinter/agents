/**
 * Simple Zod-to-JSON-Schema converter for A2A transport.
 * Converts Zod schemas to JSON Schema objects that can be serialized.
 */

import type { ZodType } from "zod";

export function zodToJsonSchema(schema: any): any {
  if (!schema) return undefined;

  // If it's already a plain object (JSON Schema), return as-is
  if (typeof schema === "object" && !schema._def) {
    return schema;
  }

  // Use zod's built-in describe for metadata
  const def = schema._def;
  if (!def) return { type: "object" };

  return convertZodDef(def);
}

function convertZodDef(def: any): any {
  if (!def) return { type: "string" };

  const typeName = def.typeName;

  switch (typeName) {
    case "ZodString":
      return {
        type: "string",
        ...(def.description && { description: def.description }),
      };
    case "ZodNumber":
      return {
        type: "number",
        ...(def.description && { description: def.description }),
      };
    case "ZodBoolean":
      return {
        type: "boolean",
        ...(def.description && { description: def.description }),
      };
    case "ZodArray":
      return {
        type: "array",
        items: convertZodDef(def.type?._def),
        ...(def.description && { description: def.description }),
      };
    case "ZodObject": {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      const shape = def.shape?.() || {};
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = convertZodDef((value as any)._def);
        if ((value as any)._def?.typeName !== "ZodOptional") {
          required.push(key);
        }
      }
      return {
        type: "object",
        properties,
        ...(required.length > 0 && { required }),
        ...(def.description && { description: def.description }),
      };
    }
    case "ZodLiteral":
      return {
        type: typeof def.value,
        const: def.value,
        ...(def.description && { description: def.description }),
      };
    case "ZodEnum":
      return {
        type: "string",
        enum: def.values,
        ...(def.description && { description: def.description }),
      };
    case "ZodOptional":
      return convertZodDef(def.innerType?._def);
    case "ZodDefault":
      return {
        ...convertZodDef(def.innerType?._def),
        default: def.defaultValue?.(),
      };
    case "ZodEffects":
      return convertZodDef(def.schema?._def);
    default:
      // For described types, extract the description
      if (def.description) {
        const inner = convertZodDef(def.innerType?._def || {});
        return { ...inner, description: def.description };
      }
      return { type: "string" };
  }
}
