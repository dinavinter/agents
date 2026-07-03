---
name: mcp-translation-file
description: Generate an MCP translation file based on API specs (openapi,odata)
---

# MCP Translation File Generator

This skill generates an MCP translation file based on supplied API specifications and ORD IDs, such as OpenAPI or OData.

## Inputs:

- **API Spec**: Can be a file, raw text or a URL pointing to the API specification (if URL the content needs to be fetched using tools like `curl` or `wget`).
- **ORD ID**: A unique identifier for the API resource, which will be used in the translation file. This identifier will be returned in the previous interaction (last one before the current) in the conversation.

## Output:

- **MCP Translation File**: A structured JSON file that contains the necessary translations for the API based on the provided specifications and ORD ID.

## Steps to Generate the MCP Translation File:

1. **Fetch API Spec**: If the input is a URL, fetch the content of the API specification using tools like `curl` or `wget`. If it's a file or raw text, read the content directly.
2. **Parse API Spec**: Extract all the relevant information from the API specification, such as endpoints, parameters, and descriptions.
3. **Generate Translation**: Create corresponding MCP translation file. This includes mapping the ORD ID to the appropriate fields in the translation file.
4. **Validate Translation**: Ensure that the generated MCP translation is correctly formatted and contains all necessary information. For this, you MUST USE the `validate-schema` tool script to validate the generated translation file against the MCP schema. If the validation fails, double check the generated file for any missing or incorrect fields, make necessary adjustments and re-validate until the file is valid.
5. **Output the Translation File**: Once the translation is validated, output it as a JSON file or in raw text format, depending on the requirements.

## Tools:

To assist in the generation and validation process, you MUST utilize the following tools:

### validate-schema

Validates a JSON file against MCP translation schema.

```bash
node /path/to/skills/mcp-translation-file/scripts/validate-schema.mjs <translation_file> /path/to/skills/mcp-translation-file/assets/translation.schema.json
```

#### Example Usage:

```bash
node /path/to/skills/mcp-translation-file/scripts/validate-schema.mjs assets/ConsumeBlockingAndDeletionOfDataSubjectsAPIs_NG/input.json /path/to/skills/mcp-translation-file/assets/translation.schema.json
```

## Translation file generation rules:

- The translation file MUST MATCH the structure defined in the MCP translation schema (assets/translation.schema.json)
- The `ordId` field MUST be populated with the provided ORD ID input.
- The `systemNamespace` field MUST consist in the "dots" section of the provided ORD ID. (Example: ORD ID: "sap.dpi:apiResource:ConsumeBlockingAndDeletionOfDataSubjectsAPIs_NG:v1" -> systemNamespace: "sap.dpi").

#### REST Files:

- The `name` field for each tool in the translation file MUST be generated based on the HTTP method and the endpoint path defined in the API specification. For example, a POST request to the endpoint "/users/create" could result in a name like "POST_users_create".

#### OData Files:

- The `name` field for each tool in the translation file MUST be generated based on the OData action or function name and the entity set it is associated with. For example, an OData action named "Approve" associated with an entity set "PurchaseOrder" could result in a name like "ACTION_PurchaseOrder_Approve".

## Examples:

You can find example input and output files in the `assets/ConsumeBlockingAndDeletionOfDataSubjectsAPIs_NG` folder of this skill. These examples show the input API specifications and the corresponding generated MCP translation files.

- Example Input: `assets/ConsumeBlockingAndDeletionOfDataSubjectsAPIs_NG/input.json` | ORD ID: "sap.dpi:apiResource:ConsumeBlockingAndDeletionOfDataSubjectsAPIs_NG:v1"
- Example Output: `assets/ConsumeBlockingAndDeletionOfDataSubjectsAPIs_NG/output.json`
