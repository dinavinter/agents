# Solution and Asset YAML Guide

## Overview

This guide explains how to create `solution.yaml` and `asset.yaml` files for the playground deployer system. These YAML files define multi-asset solutions that can be deployed to Kubernetes.

## Table of Contents

1. [Solution YAML](#solution-yaml)
2. [Asset YAML](#asset-yaml)
3. [Asset Types](#asset-types)
4. [Multi-Component Assets](#multi-component-assets)
5. [Examples](#examples)
6. [Best Practices](#best-practices)

---

## Solution YAML

A solution.yaml defines a collection of related assets (services, UIs, agents) that work together.

### Minimal Example

```yaml
apiVersion: solution.sap/v1
kind: Solution

metadata:
  name: my-solution
  version: "1.0.0"

assets:
  - ref: ./frontend/asset.yaml
  - ref: ./agent/asset.yaml
```

### Complete Example

```yaml
apiVersion: solution.sap/v1
kind: Solution

metadata:
  name: multi-asset-example
  version: "1.0.0"
  description: "A complete solution with frontend and AI agent"
  labels:
    team: platform
    environment: development

# Optional: defaults to "composite"
type: composite

# Optional: declare dependencies
requires:
  - service: postgresql
    version: "^14.0"

  # Assets can be inline or referenced
assets:
  # Reference external asset file
  - ref: ./frontend/asset.yaml

  # Inline asset definition
  - apiVersion: asset.sap/v1
    kind: Asset
    metadata:
      id: simple-service
      name: Simple Service
    type: service
    container:
      buildPath: src
      port: 8080

# Optional: platform-specific configuration
custom:
  deployment:
    strategy: rolling
    maxSurge: 1
```

### Metadata Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Unique solution identifier (lowercase, hyphens) |
| `version` | ❌ | Semantic version (e.g., "1.0.0") |
| `description` | ❌ | Human-readable description |
| `labels` | ❌ | Key-value pairs for categorization |

### Type

- `composite` (default): Multiple assets that work together
- `atomic`: Single self-contained asset

---

## Asset YAML

An asset.yaml defines a deployable component - UI, service, agent, or function.

### Single-Container Asset

```yaml
apiVersion: asset.sap/v1
kind: Asset

metadata:
  id: api-service
  name: REST API Service
  version: "1.0.0"

type: service

container:
  buildPath: src
  port: 8080
  env:
    NODE_ENV: production
    LOG_LEVEL: info

resources:
  limits:
    cpu: "1000m"
    memory: "1Gi"
  requests:
    cpu: "100m"
    memory: "256Mi"

probes:
  readiness:
    path: /health
    periodSeconds: 10
  liveness:
    path: /health
    periodSeconds: 30

# For A2A agents use /.well-known/agent.json instead of /health
```

### Multi-Container Asset

For assets with multiple containers (e.g., AppRouter + Next.js):

```yaml
apiVersion: asset.sap/v1
kind: Asset

metadata:
  id: frontend-app
  name: Frontend Application

type: base-ui

framework:
  name: nextjs
  version: "16"

# Multi-component configuration
components:
  # AppRouter - entry point
  - name: appRouter
    buildPath: router
    port: 5000
    env:
      destinations: '[{"name":"backend","url":"http://127.0.0.1:3000","forwardAuthToken":false}]'

  # Next.js server
  - name: server
    buildPath: src
    port: 3000
    env:
      PORT: "3000"
    resources:
      limits:
        cpu: "500m"
        memory: "512Mi"

provides:
  ui:
    type: web-app
    title: "Dashboard"
    routes:
      - path: /
        title: "Home"
      - path: /dashboard
        title: "Dashboard"
```

### Metadata Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique asset identifier |
| `name` | ❌ | Human-readable name |
| `version` | ❌ | Semantic version |
| `description` | ❌ | Description |
| `labels` | ❌ | Key-value labels |

---

## Asset Types

### Common Asset Types

| Type | Description | Example |
|------|-------------|---------|
| `base-ui` | Frontend web application | Next.js, React app |
| `agent` | AI agent service | LangChain agent, custom AI |
| `service` | Backend service/API | REST API, GraphQL |
| `function` | Serverless function | Event handler |

### Type-Specific Configuration

#### base-ui (Frontend)

```yaml
type: base-ui

framework:
  name: nextjs
  version: "16"

provides:
  ui:
    type: web-app
    title: "My App"
    routes:
      - path: /
        title: "Home"
```

#### agent (AI Agent)

```yaml
type: agent

framework:
  name: langchain
  version: "0.1"

provides:
  agent:
    capabilities:
      - chat
      - qa

container:
  buildPath: app
  port: 8000
  env:
    PYTHONUNBUFFERED: "1"
```

---

## Multi-Component Assets

Use `components` when your asset needs multiple containers in a single pod.

### Order Matters

The first component becomes the primary container:
- Service `targetPort` uses the first component's port
- Istio routing targets the first component

```yaml
components:
  # ✅ CORRECT: AppRouter first (entry point on port 5000)
  - name: appRouter
    buildPath: router
    port: 5000

  - name: server
    buildPath: src
    port: 3000

  # Service will expose port 5000 (first component)
```

### Component Configuration

Each component supports:

```yaml
- name: component-name          # Required
  buildPath: path/to/code       # Build location
  port: 8080                    # Exposed port
  image: registry/image:tag     # Or use pre-built image
  env:                          # Environment variables
    KEY: value
  resources:                    # Resource limits
    limits:
      cpu: "500m"
      memory: "512Mi"
  requires:                     # Dependencies
    - service: database
```

---

## Examples

### Example 1: Python AI Agent

```yaml
apiVersion: asset.sap/v1
kind: Asset

metadata:
  id: ai-assistant
  name: AI Assistant Agent
  version: "1.0.0"

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

### Example 2: Next.js with AppRouter

```yaml
apiVersion: asset.sap/v1
kind: Asset

metadata:
  id: frontend-app
  name: Next.js Frontend

type: base-ui

framework:
  name: nextjs
  version: "16"

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
      NODE_ENV: production
```

### Example 3: Complete Multi-Asset Solution

```yaml
# solution.yaml
apiVersion: solution.sap/v1
kind: Solution

metadata:
  name: full-stack-app
  version: "1.0.0"
  description: "Frontend + API + AI Agent"

assets:
  - ref: ./agent/asset.yaml
  - ref: ./api/asset.yaml
  - ref: ./frontend/asset.yaml
```

```yaml
# api/asset.yaml
apiVersion: asset.sap/v1
kind: Asset

metadata:
  id: rest-api
  name: REST API

type: service

container:
  buildPath: src
  port: 8080
  env:
    DATABASE_URL: postgresql://localhost/db
```

---

## Best Practices

### 1. **Port Configuration**

- Use standard ports: 5000 (Python agents), 3000 (Node.js), 8080 (Java)
- For multi-component assets, AppRouter typically uses 5000

### 2. **Environment Variables for Agent Assets**

**IMPORTANT**: Do NOT add a `container.env` block to `agent` type assets — the platform schema validation rejects it. Set environment variables via `ENV` instructions in the Dockerfile instead.

```yaml
# ❌ BAD for agent assets — causes schema validation error
container:
  buildPath: .
  port: 5000
  env:
    PYTHONUNBUFFERED: "1"

# ✅ GOOD — set in Dockerfile instead
# ENV PYTHONUNBUFFERED=1
```

The `env` block is valid only for `base-ui` / `service` component definitions.

### 3. **Keep Agent asset.yaml Minimal**

Omit `resources` and `hpa` blocks from agent `asset.yaml` unless you have a specific reason to override platform defaults. Extra fields have caused schema validation failures in practice.

### 4. **Environment Variables (UI/Service assets)**

```yaml
# ✅ GOOD: Use env for configuration (UI/service only)
components:
  - name: server
    env:
      PORT: "3000"
      LOG_LEVEL: info

# ❌ BAD: Hardcoding in code
```

### 5. **Resource Limits (UI/Service assets)**

For UI and service assets, specify resources to prevent resource exhaustion:

```yaml
resources:
  limits:
    cpu: "500m"      # 0.5 CPU cores
    memory: "512Mi"  # 512 megabytes
  requests:
    cpu: "100m"      # 0.1 CPU cores minimum
    memory: "128Mi"  # 128 megabytes minimum
```

### 6. **Health Probes**

Always include health checks. For A2A agents use `/.well-known/agent.json`:

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

### 7. **AppRouter Configuration**

For AppRouter + Next.js patterns:

```yaml
components:
  # 1. AppRouter first (entry point)
  - name: appRouter
    buildPath: router
    port: 5000
    env:
      # Use environment variable for destinations
      destinations: '[{"name":"backend","url":"http://127.0.0.1:3000","forwardAuthToken":false}]'

  # 2. Next.js server
  - name: server
    buildPath: src
    port: 3000
    env:
      PORT: "3000"
```

The xs-app.json should NOT include the `destinations` block - it causes validation errors in the CNB runtime.

### 8. **File Structure**

**IMPORTANT:** The `Dockerfile` must be co-located with `asset.yaml` inside the asset folder. The `container.buildPath` must be `.` (relative to asset.yaml).

```
solution/
├── solution.yaml              # refs ./<name>/asset.yaml
└── <asset-name>/
    ├── asset.yaml         # buildPath: .
    ├── Dockerfile
    ├── requirements.txt
    └── app/
        └── (Python code)
```

(Note: for frontend assets, place router/ and src/ directly under the asset folder)

### 9. **Validation**

Before deploying:
- ✅ Check YAML syntax
- ✅ Verify all paths exist
- ✅ Test locally if possible
- ✅ Review resource limits

---

## Common Issues

### Issue: AppRouter Validation Error

**Error**: `Route references unknown destination "backend"`

**Solution**: Remove `destinations` block from xs-app.json and use environment variable in asset.yaml:

```yaml
components:
  - name: appRouter
    env:
      destinations: '[{"name":"backend","url":"http://127.0.0.1:3000","forwardAuthToken":false}]'
```

### Issue: Wrong Port Exposed

**Problem**: Service targets wrong container port

**Solution**: Ensure AppRouter is the FIRST component in the list (order matters!)

### Issue: Build Fails

**Check**:
- BuildPath points to correct directory
- package.json exists in buildPath
- Dependencies are compatible

---

## Schema Versions

- **v3.0.0** (current): Multi-asset solutions with component support
- Backwards compatible with previous versions

---

## Additional Resources

- Schema files: See `schemas/` directory
- Real examples: See `examples/` directory
- API documentation: https://playground.c-27b3a58.stage.kyma.ondemand.com/docs
