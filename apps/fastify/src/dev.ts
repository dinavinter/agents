import Fastify from "fastify";
 
/*
{
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }
 */

const app = Fastify({
    logger: {
        transport: {
            target: '@fastify/one-line-logger'
        },
        level: 'debug'
    }
})

app.register(import('./plugins/log.dev'))

app.register(import('./app'))
app.listen({ port: 3000}, function (err) {
    if (err) {
        app.log.error(err)
        process.exit(1)
    }
})
export default app;