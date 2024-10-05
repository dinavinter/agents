import type { Handle, HandleServerError } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'

import handleTwind from '@twind/with-sveltekit/hooks'

import { dev } from '$app/environment'
import './app.d.ts'

const handlers: Handle[] = [handleTwind()]

if (dev) {
  handlers.push(async ({ event, resolve }) => {
    if (!event.platform) {
      const { Miniflare, Log, LogLevel } = await import('miniflare')

      const mf = new Miniflare({
        log: new Log(LogLevel.INFO),
        liveReload: false,
        kvPersist: './.mf/kv',
        r2Persist: './.mf/r2',
        durableObjectsPersist: './.mf/do',
        cachePersist: './.mf/cache',
        // kvNamespaces: ['KVNamespace'],
        r2Buckets: ['WORKSPACES'],

        script: `
          addEventListener("fetch", (event) => {
            event.waitUntil(Promise.resolve(event.request.url));
            event.respondWith(new Response(event.request.headers.get("X-Message")));
          });
          addEventListener("scheduled", (event) => {
            event.waitUntil(Promise.resolve(event.scheduledTime));
          });
        `,

        // globalRandom: true,
        // globalDate: true,
        // globalTimer: true,
      })
      const ns = `${Date.now()}_${Math.floor(
          Math.random() * Number.MAX_SAFE_INTEGER
      )}`;

      event.platform = {
        ...(event.platform || {}),
        caches: (await mf.getCaches()) as unknown as CacheStorage & { default: Cache },
        env: {
          // KVNamespace: await mf.getKVNamespace('KVNamespace'),
          WORKSPACES: (await mf.getR2Bucket('WORKSPACES')) ,
        },
      }
    }

    return resolve(event)
  })
}

export const handle = handlers.length > 1 ? sequence(...handlers) : handlers[0]

export const handleError: HandleServerError = ({ error }) => {
  return {
    message: 'Whoops! ' + (error as Error).message,
    stack: (error as Error).stack,
    ...(error as any),
  }
}
