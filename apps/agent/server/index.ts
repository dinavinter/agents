import Fastify from "fastify";
import 'dotenv/config';
 const app = Fastify( )

app.register(import('./app'))


const port = !Number.isNaN(parseInt(process.env.PORT ?? '')) ? parseInt(process.env.PORT ?? '') : 8080;

app.log.info(`Starting on port ${port}...`);

// 0.0.0.0 is needed as CF does not allow fastify's default address
app.listen({ port, host: '0.0.0.0',  }, (err) => {
    if (err) {
        console.error(err);
        app.log.error(err);
        app.log.error(err.stack);
        process.exit(1);
    }

});


export default app;