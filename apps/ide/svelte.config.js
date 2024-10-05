import adapter from '@sveltejs/adapter-cloudflare'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      routes: {
        include: ['/*'],
        exclude: ['<all>']
      },
      platformProxy: {
        configPath: 'wrangler.toml',
        // environment: import.meta.env?.NODE_ENV ?? 'development',
        experimentalJsonConfig: true,
        persist: true,
        debug: true
      }
    }),
    prerender: {
      origin: "https://localhost:5174"  ,
      entries: ['*', '/manifest.json', '/msapplication-config.xml'],
    },
    // csrf: {
    //   checkOrigin: true,
    // },
  },
}

export default config
