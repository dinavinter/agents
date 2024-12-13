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
        level: 'warn'

        // transport: {
        //     target: '@fastify/one-line-logger'
        // }
    }
})

app.register(import('../plugins/log.dev'))

app.register(import('../app'))
app.listen({ port: 3001}, function (err) {
    if (err) {
        app.log.error(err)
        process.exit(1)
    }
})
export default app;