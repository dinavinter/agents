// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
        interface Platform {
            caches: CacheStorage & { default: Cache },
            env: {
                // WORKSPACES: KVNamespace
                WORKSPACES: R2Bucket
                // YOUR_DURABLE_OBJECT_NAMESPACE: DurableObjectNamespace
            }
            cf: CfProperties
            ctx: ExecutionContext
        }
    }
}

export {};