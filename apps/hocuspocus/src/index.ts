import { Server } from '@hocuspocus/server'
import { Logger } from '@hocuspocus/extension-logger'
import { SQLite } from '@hocuspocus/extension-sqlite'
import {env} from 'node:process'
import * as Y from 'yjs'
const server = Server.configure({
    port: Number.parseInt(env.PORT || "8080"),
    address: '0.0.0.0',
    name: 'agents',
    timeout: 30000,
    debounce: 500,
    maxDebounce: 3000,

    extensions: [
        new Logger(),
        new SQLite({
            database: "db.sqlite"
        }),
    ],
    onRequest(data) {
        return new Promise<void>(async (resolve, reject) => {
            const {request, response} = data;


            //logs/{agent}
            // Check if the request hits your custom route
            if (request.url?.endsWith("/agents")) {
                const docConnection = await server.openDirectConnection('agents', {})
                const agents = docConnection.document?.getMap<Y.Doc>('agents')
                
                await docConnection.disconnect()
                response.writeHead(agents ? 200 : 404, {"Content-Type": "application/json"});
                response.write(JSON.stringify(Object.entries(agents?.toJSON() ?? []).map(([id, agentDoc]) => {
                    return {
                        id,
                        ...agentDoc.meta,
                        ...agentDoc.getMap("vm").toJSON()
                    }
                })));
                 response.end()
                return reject();
            }

            if (request.url?.match(/^\/logs\/(.*)/)) {
                const agent = request.url.split("/")[2];
                console.log(agent)
                const docConnection = await server.openDirectConnection('agents', {})

                const agentDoc = docConnection.document?.getMap<Y.Doc>('agents').get(agent)
                agentDoc?.shouldLoad && agentDoc?.load()
                const vm = agentDoc?.getMap("vm")?.toJSON()
                await docConnection.disconnect()

                if (vm) {
                    response.writeHead(200, {"Content-Type": "application/json"});
                    response.write(JSON.stringify(vm));
                } else {
                    response.writeHead(404, {"Content-Type": "text/plain"});
                    response.write("Not found");
                }


                response.end()

                // Rejecting the promise will stop the chain and no further
                // onRequest hooks are run
                return reject();
            }


            resolve();
        });
    }
})

server.listen().then(r => {
    console.log(`Server listening on ${r.address.address}:${r.address.port}`)
}).catch(e => {
    console.error(e)
    process.exit(1)
})