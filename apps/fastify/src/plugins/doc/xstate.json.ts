 const schema=   {
    "$id": "https://stately.ai/schemas/0.1/statechart.json",
    "$schema": "http://json-schema.org/draft-07/schema#",
    "description": "Stately Statechart Specification",
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "description": "Statechart unique identifier",
            "minLength": 1
        },
        "description": {
            "type": "string",
            "description": "Statechart description"
        },
        "version": {
            "type": "string",
            "description": "Statechart version",
            "minLength": 1
        },
         "context": {
            "type": "object",
            "description": "The initial context object",
            "additionalProperties": true
        },
        "initial": {
            "$ref": "#/definitions/initialObject"
        },
        "entry": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/actionObject"
            }
        },
        "exit": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/actionObject"
            }
        },
        "invoke": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/invokeObject"
            }
        },
        "on": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/transitionObject"
            }
        },
        "states": {
            "$ref": "#/definitions/statesObject"
        },
        "meta": {
            "$ref": "#/definitions/metaObject"
        }
    },
    "required": ["id", "initial", "states"],
    "additionalProperties": false,
    "definitions": {
        "actionObject": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "description": "The action type",
                    "minLength": 1
                },
                "params": {
                    "type": "object",
                    "description": "Action parameters",
                    "additionalProperties": true
                }
            },
            "additionalProperties": false,
            "required": ["type"]
        },
        "baseStateNode": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "The state node ID"
                },
                "type": { 
                    "type": ["string", "null"],
                    "enum": ["parallel", "final", "history", "atomic", "compound" ],
                    "description": "The state type, if not a normal (atomic or compound) state node."
                },
                "description": {
                    "type": "string",
                    "description": "The text description of this state node."
                },
                "tags": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    }
                }
            }
        },
        "compoundStateNode": {
            "allOf": [
                { "$ref": "#/definitions/baseStateNode" },
                {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": ["string", "null"],
                            "enum": ["compound"]
                        },
                        "entry": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/actionObject"
                            }
                        },
                        "exit": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/actionObject"
                            }
                        },
                        "initial": {
                            "$ref": "#/definitions/initialObject"
                        },
                        "invoke": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/invokeObject"
                            }
                        },
                        "on": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/transitionObject"
                            }
                        },
                        "states": {
                            "$ref": "#/definitions/statesObject"
                        },
                        "onDone": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/invokeObject"
                            }
                        }
                    },
                    "required": ["initial", "states"]
                }
            ]
        },
        "parallelStateNode": {
            "allOf": [
                { "$ref": "#/definitions/baseStateNode" },
                {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "const": "parallel"
                        },
                        "entry": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/actionObject"
                            }
                        },
                        "exit": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/actionObject"
                            }
                        },
                        "invoke": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/invokeObject"
                            }
                        },
                        "on": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/transitionObject"
                            }
                        },
                        "states": {
                            "$ref": "#/definitions/statesObject"
                        },
                        "onDone": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/invokeObject"
                            }
                        }
                    },
                    "required": ["type", "states"]
                }
            ]
        },
        "atomicStateNode": {
            "allOf": [
                { "$ref": "#/definitions/baseStateNode" },
                {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": ["string", "null"],
                            "enum": ["atomic"]
                        },
                        "entry": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/actionObject"
                            }
                        },
                        "exit": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/actionObject"
                            }
                        },
                        "invoke": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/invokeObject"
                            }
                        },
                        "on": {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/transitionsDef"
                            }
                        }
                    }
                }
            ]
        },
        "historyStateNode": {
            "allOf": [
                { "$ref": "#/definitions/baseStateNode" },
                {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["history"]
                        },
                        "history": {
                            "type": "string",
                            "enum": ["shallow", "deep"]
                        },
                        "target": {
                            "type": "string",
                            "description": "The default target if no history exists for its parent node"
                        }
                    },
                    "required": ["type"]
                }
            ]
        },
        "finalStateNode": {
            "allOf": [
                { "$ref": "#/definitions/baseStateNode" },
                {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["final"]
                        }
                    },
                    "required": ["type"]
                }
            ]
        },
        "statesObject": {
            "type": "object",
            "patternProperties": {
                "^.*$": {
                    "oneOf": [
                        { "$ref": "#/definitions/atomicStateNode" },
                        { "$ref": "#/definitions/compoundStateNode" },
                        { "$ref": "#/definitions/parallelStateNode" },
                        { "$ref": "#/definitions/historyStateNode" },
                        { "$ref": "#/definitions/finalStateNode" }
                    ]
                }
            }
        },
        "transitionsDef": {
            "type": "object",
            "patternProperties": {
                "^.*$": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/transitionObject"
                    }
                }
            }
        },
        "transitionObject": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "The text description of this transition."
                },
                "target": {
                    "oneOf": [
                        {
                            "type": "string"
                        },
                        {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    ]
                },
                "actions": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/actionObject"
                    }
                },
                "guard": {
                    "$ref": "#/definitions/guardObject"
                },
                "meta": {
                    "$ref": "#/definitions/metaObject"
                }
            },
            "required": []
        },
        "invokeObject": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "string"
                },
                "src": {
                    "type": "string"
                },
                "input": {
                    "type": "object",
                    "additionalProperties": true
                },
                "meta": {
                    "type": "object",
                    "additionalProperties": true
                },
                "onDone": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/invokeObject"
                    }
                },
                "onError": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/invokeObject"
                    }
                },
                "onSnapshot": {
                    "type": "array",
                    "items": {
                        "$ref": "#/definitions/invokeObject"
                    }
                }
            },
            "required": ["src"],
            "additionalProperties": false
        },
        "guardObject": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "description": "The guard type"
                },
                "params": {
                    "type": "object",
                    "description": "Guard parameters"
                }
            },
            "required": ["type"]
        },
        "metaObject": {
            "type": "object",
            "description": "Meta properties",
            "additionalProperties": true
        },
        "initialObject": {
            "oneOf": [
                {
                    "type": "string",
                    "description": "The inital state node key",
                    "minLength": 1
                },
                {
                    "$ref": "#/definitions/transitionObject"
                }
            ]
        }
    },
    "examples": [{
        id: "light",
        version: "1.0.0",
        description: "A light switch",
        context: {
            light: "off"
        },
        initial: "off",
        states: {
            off: {
                 on: {
                    TOGGLE: "on"
                }
            },
            on: {
                 on: {
                    TOGGLE: "off"
                }
            }
        }
    }]
      
}   as const ;

export default schema;

