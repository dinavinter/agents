/**
 * OpenCode AI Provider
 * 
 * Wraps @opencode-ai/sdk via the ai-sdk-provider for use with Vercel AI SDK.
 * This enables using OpenCode's model routing (any model via opencode proxy)
 * as a native AI SDK provider alongside the existing SAP AI Core provider.
 * 
 * Usage:
 *   import { opencodeModel } from './opencode';
 *   const result = await streamText({ model: opencodeModel('gpt-4o'), prompt: '...' });
 */

import { createOpencode } from "ai-sdk-provider-opencode-sdk";

// Create the opencode provider instance
// When running alongside opencode (e.g. in the same environment),
// it auto-connects to the running opencode server
const opencode = createOpencode({
  autoStartServer: false,  // Don't auto-start in server environment
});

/**
 * Get an opencode-routed model for use with AI SDK.
 * Model format: "provider/model" e.g. "openai/gpt-4o", "anthropic/claude-sonnet-4-6"
 */
export const opencodeModel = (modelId: string) => opencode(modelId);

/**
 * Dispose the opencode client (cleanup)
 */
export const disposeOpencode = () => opencode.dispose?.();

export { opencode };
