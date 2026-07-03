#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
  console.error("Usage: node scripts/validate-json.mjs <file.json> <schema.json>");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonTypeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function escapeJsonPointer(token) {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

function pointerJoin(base, token) {
  const escaped = escapeJsonPointer(String(token));
  return base === "" ? `/${escaped}` : `${base}/${escaped}`;
}

function loadJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Could not read or parse JSON file '${filePath}': ${error.message}`);
  }
}

function resolveRef(rootSchema, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    throw new Error(`Unsupported $ref '${ref}'. Only local refs like '#/...' are supported.`);
  }

  const parts = ref
    .slice(2)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));

  let current = rootSchema;
  for (const part of parts) {
    if (!isObject(current) && !Array.isArray(current)) {
      throw new Error(`Invalid $ref '${ref}': '${part}' is not reachable.`);
    }
    current = current[part];
    if (current === undefined) {
      throw new Error(`Invalid $ref '${ref}': '${part}' not found.`);
    }
  }

  return current;
}

function validate(data, schema, rootSchema, dataPath = "") {
  const errors = [];

  if (!isObject(schema)) {
    return errors;
  }

  if (schema.$ref) {
    const resolved = resolveRef(rootSchema, schema.$ref);
    return validate(data, resolved, rootSchema, dataPath);
  }

  if (schema.not) {
    const notErrors = validate(data, schema.not, rootSchema, dataPath);
    if (notErrors.length === 0) {
      errors.push({
        path: dataPath,
        message: "must NOT match schema in 'not'",
      });
    }
  }

  if (schema.oneOf) {
    const matches = [];
    for (let i = 0; i < schema.oneOf.length; i += 1) {
      const candidate = schema.oneOf[i];
      const candidateErrors = validate(data, candidate, rootSchema, dataPath);
      if (candidateErrors.length === 0) {
        matches.push(i);
      }
    }

    if (matches.length !== 1) {
      errors.push({
        path: dataPath,
        message: `must match exactly one schema in 'oneOf' (matched ${matches.length})`,
      });
    }
  }

  if (schema.type) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = jsonTypeOf(data);
    const typeMatches = expected.some((t) => t === actual);

    if (!typeMatches) {
      errors.push({
        path: dataPath,
        message: `must be of type ${expected.join(" | ")}, got ${actual}`,
      });
      return errors;
    }
  }

  if (schema.enum) {
    const found = schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(data));
    if (!found) {
      errors.push({
        path: dataPath,
        message: `must be one of enum values: ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`,
      });
    }
  }

  if (typeof schema.pattern === "string" && typeof data === "string") {
    let regex;
    try {
      regex = new RegExp(schema.pattern);
    } catch (error) {
      throw new Error(`Invalid pattern '${schema.pattern}': ${error.message}`);
    }

    if (!regex.test(data)) {
      errors.push({
        path: dataPath,
        message: `must match pattern ${schema.pattern}`,
      });
    }
  }

  if (schema.required && isObject(data)) {
    for (const key of schema.required) {
      if (!Object.hasOwn(data, key)) {
        errors.push({
          path: dataPath,
          message: `must have required property '${key}'`,
        });
      }
    }
  }

  if (schema.properties && isObject(data)) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (Object.hasOwn(data, key)) {
        errors.push(...validate(data[key], propSchema, rootSchema, pointerJoin(dataPath, key)));
      }
    }
  }

  if (schema.additionalProperties === false && isObject(data)) {
    const allowed = isObject(schema.properties)
      ? new Set(Object.keys(schema.properties))
      : new Set();
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) {
        errors.push({
          path: pointerJoin(dataPath, key),
          message: "must NOT have additional properties",
        });
      }
    }
  }

  if (schema.items && Array.isArray(data)) {
    for (let i = 0; i < data.length; i += 1) {
      errors.push(...validate(data[i], schema.items, rootSchema, pointerJoin(dataPath, i)));
    }
  }

  return errors;
}

function main() {
  const [, , fileArg, schemaArg] = process.argv;

  if (!fileArg || !schemaArg) {
    usage();
    process.exitCode = 2;
    return;
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  const schemaPath = path.resolve(process.cwd(), schemaArg);

  let data;
  let schema;

  try {
    data = loadJson(filePath);
    schema = loadJson(schemaPath);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }

  let errors;
  try {
    errors = validate(data, schema, schema, "");
  } catch (error) {
    console.error(`Validation setup error: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  if (errors.length === 0) {
    console.log(`VALID: ${fileArg}`);
    return;
  }

  console.error(`INVALID: ${fileArg}`);
  for (const error of errors) {
    const where = error.path === "" ? "/" : error.path;
    console.error(`- ${where}: ${error.message}`);
  }
  process.exitCode = 1;
}

main();
