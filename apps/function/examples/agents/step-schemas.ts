import { z } from "https://esm.sh/zod";

const baseStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  outputs: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string()
  }))
});

export const stepSchemaMap = {
  "datasource.read.gigya.account": {
    schema: baseStepSchema.extend({
      type: z.literal("datasource.read.gigya.account"),
      params: z.object({
        select: z.string().describe("Comma-separated list of fields to extract. For the list of SAP Customer Data Cloud fields, see the Account object. For the list that includes your custom fields as well, see the Schema Editor on the Accounts Schema page of the SAP Customer Data Cloud Console). For example, enter "UID, profile.firstName" to extract the 'UID' and 'profile.firstName' fields from the Accounts object."),
        from: z.string().describe("The name of the data source. Can be accounts, emailAccounts, communications."),
        where: z.string().describe("An SQL-like WHERE clause to filter Account objects."),
        consent: z.string().describe("The consent status of the account. For example, enter 'consent' to extract only accounts with a consent status of 'consent'."),
        orderBy: z.string().describe("A comma-separated list of fields to sort by. For example, enter 'profile.firstName, profile.lastName' to sort by first name and last name."),
        deltaField: z.string().describe(`The timestamp field to filter accounts by. The component will extract accounts where this timestamp is newer than the timestamp of the last successful run of the dataflow.We recommend using this dynamic indication with the “deltaField” instead of using it with the “Where” parameter. The performance with the “deltaField” is significantly higher, because it doesn’t require a full extract of the database.`),
      })

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
        deltaField: "lastUpdatedTimestamp"
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
                  lastName: { type: "string" }
                }
              }
            }
          },
          description: "Array of user account objects containing profile data"
        }
      ]
    }
  },
  "field.rename": {
    schema: baseStepSchema.extend({
      type: z.literal("field.rename"),
      params: z.object({
        fields: z.array(z.object({
          sourceField: z.string(),
          targetField: z.string(),
        }))
      })
    }),
    example: {
      id: "rename_fields",
      type: "field.rename",
      description: "Renames fields in the data structure",
      params: {
        fields: [
          { sourceField: "oldName", targetField: "newName" }
        ]
      },
      outputs: [
        {
          name: "renamedData",
          type: "object",
          description: "Data with renamed fields"
        }
      ]
    }
  },
  "field.remove": {
    schema: baseStepSchema.extend({
      type: z.literal("field.remove"),
      params: z.object({
        fields: z.array(z.string())
      })
    }),
    example: {

      id: "remove_fields",
      type: "field.remove",
      description: "Array of user account objects containing age field",
      params: {
        fields: ["profile.firstName", "profile.lastName"]
      },
      outputs: [
        {
          name: "accounts",
          type: "object",
          description: "Array of user account objects containing age field",
          schema: {
            type: "object",
            properties: {
              UID: { type: "string" },
              profile: {
                type: "object",
                properties: {
                  age: { type: "number" }
                }
              }
            }
          }
        }
      ]

    }
  },
  "datasource.write.sftp": {
    schema: baseStepSchema.extend({
      type: z.literal("datasource.write.sftp"),
      params: z.object({
        host: z.string(),
        username: z.string(),
        password: z.string(),
        remotePath: z.string(),
        port: z.number().optional(),
      })
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
        port: 22
      }
    }
  },
  "file.format.dsv": {
    schema: baseStepSchema.extend({
      type: z.literal("file.format.dsv"),
      params: z.object({
        fileName: z.string(),
        columnSeparator: z.string(),
        quoteFields: z.boolean(),
        writeHeader: z.boolean(),
        lineEnd: z.string(),
        createEmptyFile: z.boolean()
      })
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
        createEmptyFile: false
      }
    }
  }

  // Add other step types as needed
  

};


/*{
  "name": "Export from Gigya to SFTP",
  "description": "account > rename > dsv > sftp",
  "steps": [
    {
      "id": "account",
      "type": "datasource.read.gigya.account",
      "params": {
        "select": "profile.email,profile.lastName,profile.firstName,profile.gender",
        "batchSize": 300,
        "from": "accounts", 
        "deltaField": "${lastUpdatedTimestamp-1y}",
        "maxConcurrency": 1,
        "consent": [
          {
            "id": "terms.tos",
            "status": "valid"
          },
          {
            "id": "terms.allowAds",
            "status": "expired"
          },
          {
            "id": "terms.optionalConsent",
            "status": "notGranted"
          }
        ]
      },
      "next": [
        "rename"
      ]
    },
    {
      "id": "rename",
      "type": "field.rename",
      "params": {
        "fields": [
          {
            "sourceField": "profile.email",
            "targetField": "MAIL"
          },
          {
            "sourceField": "profile.lastName",
            "targetField": "NAME"
          },
          {
            "sourceField": "profile.firstName",
            "targetField": "FIRSTNAME"
          },
          {
            "sourceField": "profile.gender",
            "targetField": "GENDER"
          }
        ]
      },
      "next": [
        "dsv"
      ]
    },
    {
      "id": "dsv",
      "type": "file.format.dsv",
      "params": {
        "fileName": "GIGYA_TO_SFTP_${now}.csv",
        "columnSeparator": ",",
        "quoteFields": true,
        "writeHeader": true,
        "lineEnd": "\n",
        "createEmptyFile": false
      },
      "next": [
        "sftp"
      ]
    },
    {
      "id": "sftp",
      "type": "datasource.write.sftp",
      "params": {
        "host": "...",
        "username": "...",
        "password": "...",
        "remotePath": "GigyaDaily",
        "port": 22
      }
    }
  ]
}

Encrypt a file using the GnuPG algorithm.

Note
Alternatively, you can password-protect your zip files using the file.compress.zip component.

Note
To ensure that the encryption job does not get stuck, if your previous step was writing the dataset to a file (for example, file.format.json), make sure that the maximum file size does not exceed 500MB.

Required	Parameter Name	Type	Default	Description
	publicKey	string		The public key used to encrypt the file.
	asciiArmor	Boolean		Whether to use ASCII armor -- a binary-to-textual encoding converter which involves encasing encrypted messaging in ASCII so that they can be sent in a standard messaging format.

  */