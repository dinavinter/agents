import { z } from "npm:zod";

const FileSchema = z.object({
    kind: z.literal("file"),
    content: z.string().optional(),
    encoding: z.enum(["utf-8", "base64"]).optional(),
    gitSha1: z.string().optional(),
  });
  
  const SymlinkSchema = z.object({
    kind: z.literal("symlink"),
    target: z.string(),
  });
  
  const DeploymentSchema = z.object({
    id: z.string(),
    url: z.string(),
    data: z.object({
      value: z.string(),
      context: z.object({
        deployment: z.object({
          id: z.string(),
          status: z.string(),
        }).optional(),
        error: z.any().optional(),
      }),
    }),
    links: z.object({
      self: z.string(),
      status: z.string(),
      ping: z.string(),
      stop: z.string(),
      retry: z.string(),
      redeploy: z.string(),
    }),
  });
  
  const ErrorSchema = z.object({
    error: z.string(),
  });
   
  const schemas = {
    File: FileSchema,
    Symlink: SymlinkSchema,
    Deployment: DeploymentSchema,
    Error: ErrorSchema,
    Project: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
    }),
    Worker: z.object({
      id: z.string(),
      url: z.string(),
      status: z.string(),
    }),
  };
  // Define OpenAPI document
  export const openApiDocument = {
    "openapi": "3.0.0",
    "info": {
      "title": "Deployment API",
      "description": "API for managing deployments, workers, and projects",
      "version": "1.0.0"
    },
    "servers": [
      {
        "url": "https://your-api.com"
      },
      {
        "url": "http://localhost:8002",
        "description": "Local development server"
      }
    ],
    "paths": {
      "/projects": {
        "get": {
          "summary": "Get all projects",
          "operationId": "getProjects",
          "responses": {
            "200": {
              "description": "A list of projects",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/Project"
                    }
                  },
                  "examples": {
                    "example1": {
                      "value": [
                        {
                          "id": "123",
                          "name": "Project Alpha"
                        },
                        {
                          "id": "456",
                          "name": "Project Beta"
                        }
                      ]
                    }
                  }
                }
              },
              "links": {
                "getProjectById": {
                  "operationId": "getProject",
                  "parameters": {
                    "project": "$response.body#/id"
                  }
                }
              }
            }
          }
        },
        "post": {
          "summary": "Create a new project",
          "operationId": "createProject",
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CreateProjectRequest"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Project created successfully",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/Project"
                  },
                  "examples": {
                    "example1": {
                      "value": {
                        "id": "789",
                        "name": "New Project"
                      }
                    }
                  }
                }
              },
              "links": {
                "getCreatedProject": {
                  "operationId": "getProject",
                  "parameters": {
                    "project": "$response.body#/id"
                  }
                }
              }
            }
          }
        }
      },
      "/projects/{project}": {
        "get": {
          "summary": "Get project details",
          "operationId": "getProject",
          "parameters": [
            {
              "name": "project",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "Project details",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/Project"
                  },
                  "examples": {
                    "example1": {
                      "value": {
                        "id": "123",
                        "name": "Project Alpha"
                      }
                    }
                  }
                }
              },
              "links": {
                "getProjectWorkers": {
                  "operationId": "getWorkers",
                  "parameters": {
                    "project": "$response.body#/id"
                  }
                }
              }
            }
          }
        }
      },
      "/projects/{project}/workers": {
        "get": {
          "summary": "Get all workers for a project",
          "operationId": "getWorkers",
          "parameters": [
            {
              "name": "project",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "A list of workers",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/Worker"
                    }
                  },
                  "examples": {
                    "example1": {
                      "value": [
                        {
                          "id": "w1",
                          "status": "running",
                          "logs": []
                        },
                        {
                          "id": "w2",
                          "status": "stopped",
                          "logs": []
                        }
                      ]
                    }
                  }
                }
              },
              "links": {
                "getWorker": {
                  "operationId": "configureWorker",
                  "parameters": {
                    "worker": "$response.body#/id"
                  }
                }
              }
            }
          }
        }
      },
      "/workers/{worker}": {
        "post": {
          "summary": "Configure a worker",
          "operationId": "configureWorker",
          "parameters": [
            {
              "name": "worker",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/WorkerConfigRequest"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "Worker configured successfully",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "message": {
                        "type": "string",
                        "example": "Worker configured successfully"
                      }
                    }
                  }
                }
              },
              "links": {
                "getWorkerStatus": {
                  "operationId": "getWorkerBuildLogs",
                  "parameters": {
                    "worker": "$response.body#/id"
                  }
                }
              }
            }
          }
        }
      },
      "/workers/{worker}/start": {
        "post": {
          "summary": "Start a worker",
          "operationId": "startWorker",
          "parameters": [
            {
              "name": "worker",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "Worker started successfully"
            }
          }
        }
      },
      "/workers/{worker}/status": {
        "post": {
          "summary": "Get worker status",
          "operationId": "getWorkerStatus",
          "parameters": [
            {
              "name": "worker",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "Worker status retrieved successfully"
            }
          }
        }
      },
      "/workers/{worker}/stop": {
        "post": {
          "summary": "Stop a worker",
          "operationId": "stopWorker",
          "parameters": [
            {
              "name": "worker",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "Worker stopped successfully"
            }
          }
        }
      },
      "/workers/{worker}/retry": {
        "post": {
          "summary": "Retry a worker deployment",
          "operationId": "retryWorker",
          "parameters": [
            {
              "name": "worker",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "Worker retried successfully"
            }
          }
        }
      },
      "/workers/{worker}/logs/build": {
        "get": {
          "summary": "Get build logs for a worker",
          "operationId": "getWorkerBuildLogs",
          "parameters": [
            {
              "name": "worker",
              "in": "path",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "Build logs retrieved successfully",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  }
                }
              },
              "links": {
                "getWorker": {
                  "operationId": "configureWorker",
                  "parameters": {
                    "worker": "$response.body#/id"
                  }
                }
              }
            }
          }
        }
      }
    },
    "components": {
      "schemas": {
        "Project": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            }
          }
        },
        "Worker": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "status": {
              "type": "string"
            },
            "logs": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          }
        },
        "CreateProjectRequest": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "example": "my-project"
            }
          }
        },
        "WorkerConfigRequest": {
          "type": "object",
          "properties": {
            "code": {
              "type": "string",
              "example": "Deno.serve(req => new Response('Hello World!'));"
            },
            "envVars": {
              "type": "object",
              "additionalProperties": {
                "type": "string"
              }
            },
            "assets": {
              "type": "object",
              "additionalProperties": {
                "type": "object",
                "properties": {
                  "kind": {
                    "type": "string",
                    "enum": [
                      "file",
                      "symlink"
                    ]
                  },
                  "content": {
                    "type": "string"
                  },
                  "encoding": {
                    "type": "string",
                    "enum": [
                      "utf-8",
                      "base64"
                    ]
                  },
                  "target": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
      }
    }
  }