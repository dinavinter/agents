---
name: deployment-descriptor
description: Add deployment descriptor in order to deploy the solution.
metadata:
  owner: ibd
  version: "1.0"
---

# Deployment Descriptor Skill

The purpose of this skill is to create 'solution.yaml' and 'asset.yaml' files for the playground deployer.

## When to Use This Skill

When the user asks to:
- Create a solution YAML file
- Create an asset YAML file
- Set up a multi-asset solution
- Configure deployment YAMLs

## Instructions

### Schema Reference

**Solution YAML Structure:**
```yaml
apiVersion: solution.sap/v1
kind: Solution
metadata:
  name: string          # Required: unique identifier
  version: string       # Optional: semantic version
  description: string   # Optional
  labels: {}           # Optional: key-value pairs
type: string           # Optional: "composite" (default) or "atomic"
assets:               # Required: list of assets
  - ref: ./path/to/asset.yaml
custom: {}            # Optional: platform-specific config
```

**Asset YAML Structure (Single Container):**
```yaml
apiVersion: asset.sap/v1
kind: Asset               # Must be exactly 'Asset' (capital A)
metadata:
  id: string             # Required: unique identifier (DNS-compatible: lowercase, hyphens)
  name: string           # Optional: human-readable display name
  version: string        # Optional
type: string             # Required: "base-ui", "agent", "service", "function"
container:               # For single-container assets
  buildPath: string
  port: integer
  env:                   # Flat key-value map — NOT a list of objects
    KEY: value           # WARNING: do NOT use for type: agent — causes schema validation failure. Use Dockerfile ENV instead.
resources:               # WARNING: do NOT use for type: agent — causes schema validation failure. Platform applies defaults.
  limits: {cpu: string, memory: string}
probes:
  readiness: {path: string}
```

**Asset YAML Structure (Multi-Container):**
```yaml
apiVersion: asset.sap/v1
kind: Asset
metadata:
  id: string
type: string
components:           # For multi-container assets
  - name: string      # Component name
    buildPath: string
    port: integer
    env: {}
```

### Asset Types

- `base-ui`: Frontend web applications (Next.js, React)
- `agent`: AI agent services (LangChain, custom)
- `n8n-workflow`: N8N workflow automation
- `vercel-app`: Vercel-specific deployments

**Note**: Each asset type has a detailed JSON Schema in `assets/{type}.json` with:
- Complete property definitions (100+ properties for agents)
- Strict validation rules (patterns, enums, min/max values)
- Detailed descriptions for every field
- Default values and constraints
- Examples: agent.json includes agentCard, models, secrets, HPA, probes, resources, virtualService, etc.

### Multi-Component Pattern (AppRouter + Next.js)

**IMPORTANT**: For AppRouter + Next.js setups:

1. **Order matters**: AppRouter MUST be first component
2. **Destinations**: Use environment variable, NOT xs-app.json
3. **Ports**: AppRouter = 5000, Next.js = 3000

```yaml
components:
  - name: appRouter
    buildPath: router
    port: 5000
    env:
      destinations: '[{"name":"backend","url":"http://127.0.0.1:3000","forwardAuthToken":false}]'

  - name: server
    buildPath: src
    port: 3000
    env:
      PORT: "3000"
```

**xs-app.json** (minimal, NO destinations block):
```json
{
  "welcomeFile": "/",
  "authenticationMethod": "none",
  "sessionTimeout": 60,
  "routes": [
    {
      "source": "^/(.*)$",
      "target": "$1",
      "destination": "backend",
      "authenticationType": "none"
    }
  ],
  "compression": {"enabled": true},
  "websockets": {"enabled": true}
}
```

### Examples

**Example 1: Simple Solution**
```yaml
apiVersion: solution.sap/v1
kind: Solution
metadata:
  name: my-app
  version: "1.0.0"
assets:
  - ref: ./frontend/asset.yaml
```

**Example 2: Python Agent Asset**
```yaml
apiVersion: asset.sap/v1
kind: Asset             # Must be 'Asset' (capital A)
metadata:
  id: ai-assistant     # Required: used by deployer as asset_id
  name: AI Assistant   # Optional
type: agent
container:
  buildPath: .
  port: 5000
probes:
  startup:
    path: /.well-known/agent.json
    periodSeconds: 5
    timeoutSeconds: 3
    failureThreshold: 18
  liveness:
    path: /.well-known/agent.json
    initialDelaySeconds: 15
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3
  readiness:
    path: /.well-known/agent.json
    initialDelaySeconds: 5
    periodSeconds: 5
    timeoutSeconds: 3
    failureThreshold: 3
```

**Example 3: Multi-Asset Solution**
```yaml
apiVersion: solution.sap/v1
kind: Solution
metadata:
  name: full-stack-app
  version: "1.0.0"
  description: "Frontend + Agent"
assets:
  - ref: ./agent/asset.yaml
  - ref: ./frontend/asset.yaml
```

### Best Practices

1. **Do NOT add `container.env` to agent assets** — it causes schema validation errors on the platform. Set environment variables via `ENV` instructions in the Dockerfile instead. The `env` block is only valid for `base-ui` / `service` component definitions.

2. **Keep agent `asset.yaml` minimal** — omit `resources` and `hpa` blocks unless you have a specific reason to override platform defaults. Extra fields have caused schema validation failures on the platform.

3. **Include health probes** (use `/.well-known/agent.json` for A2A agents):
   ```yaml
   probes:
     startup:
       path: /.well-known/agent.json
       periodSeconds: 5
       timeoutSeconds: 3
       failureThreshold: 18
     liveness:
       path: /.well-known/agent.json
       initialDelaySeconds: 15
       periodSeconds: 10
       timeoutSeconds: 5
       failureThreshold: 3
     readiness:
       path: /.well-known/agent.json
       initialDelaySeconds: 5
       periodSeconds: 5
       timeoutSeconds: 3
       failureThreshold: 3
   ```

4. **Use environment variables** for configuration (UI/service assets only — see note 1 for agents):
   ```yaml
   env:
     PORT: "3000"
     LOG_LEVEL: info
   ```

5. **For AppRouter assets**, NEVER include destinations in xs-app.json - use env var instead

6. **Standard ports**:
   - Python agents: 5000
   - Node.js: 3000
   - Java: 8080
   - AppRouter: 5000

7. **Required folder structure** — always use this layout:
   ```
   solution/
   ├── solution.yaml          # refs ./<name>/asset.yaml
   └── <asset-name>/
       ├── asset.yaml     # buildPath: .
       ├── Dockerfile
       └── app/           # agent source code
   ```
   The `Dockerfile` MUST be co-located with `asset.yaml` (i.e. inside `<asset-name>/`).
   The `container.buildPath` in `asset.yaml` must be `.` (relative to asset.yaml location).

### Common Issues

**AppRouter Fails with "unknown destination backend"**
- ✅ Remove `destinations` block from xs-app.json
- ✅ Add `destinations` environment variable in asset.yaml

**Service exposes wrong port**
- ✅ Ensure AppRouter is first component in list

**Build fails**
- ✅ Check buildPath points to correct directory
- ✅ Verify package.json exists

### Workflow

When user requests YAML creation:

1. **Ask clarifying questions if unclear**:
   - What type of asset? (UI, agent, service)
   - Single or multi-container?
   - What framework? (Next.js, Python, etc.)

2. **Consult JSON schemas for validation rules**:
   - Check `assets/solution-schema.json` for solution structure
   - Check `assets/{type}.json` for asset-specific fields
   - Note required fields, patterns (e.g., DNS-compatible names), and enums

3. **Create appropriate structure**:
   - Use single-container for simple apps
   - Use multi-component for AppRouter patterns

4. **Include all required fields**:
   - metadata.name (solution) - must match pattern `^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`
   - metadata.id (asset) - DNS-compatible
   - type - must match available schemas
   - container OR components

 5. **Add best practices**:
    - Resource limits and environment variables (UI/service assets only — omit for agent assets, see Best Practices)
    - Health probes

6. **Validate**:
   - Check YAML syntax
   - Verify all required fields present (per JSON schema)
   - Ensure paths are correct
   - Validate against patterns and constraints

## Important Notes

- Schema version: v3.0.0
- All paths are relative to solution.yaml location
- Field names are case-sensitive
- Use lowercase-with-hyphens for IDs
- The `Dockerfile` must live inside the asset folder (co-located with `asset.yaml`), not at the solution root
- For A2A agents, always use `/.well-known/agent.json` as the probe path (startup + liveness + readiness)

## Documentation

For complete reference, see:
- **assets/solution-schema.json** - Complete JSON Schema validation for solution.yaml
- **assets/*.json** - Type-specific JSON Schema validation for asset.yaml
  - agent.json - AI agent assets (22KB with full config)
  - base-ui.json - UI assets with framework support
  - n8n-workflow.json - N8N workflow automation
  - vercel-app.json - Vercel-specific deployments
- **references/YAML-GUIDE.md** - Comprehensive examples and patterns

The JSON schemas include:
- Strict validation (required fields, patterns, enums)
- Detailed property descriptions
- Default values and constraints
- Complete field reference for all asset types

