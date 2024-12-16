import {Server} from '@hocuspocus/server'
import {Logger} from '@hocuspocus/extension-logger'
import {SQLite} from '@hocuspocus/extension-sqlite'
import rootLogger, {CustomFieldsFormat, CustomFieldsTypeConversion, Level} from 'cf-nodejs-logging-support'
rootLogger.setCustomFieldsFormat(CustomFieldsFormat.All);
rootLogger.setCustomFieldsTypeConversion(CustomFieldsTypeConversion.Retain)
rootLogger.setLoggingLevel('Debug');
rootLogger.logMessage(Level.Info, `Log level is set to Debug`);

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
        new Logger({
            log: (...args)=>rootLogger.logMessage(Level.Info, ...args),
            onRequest: true,
            onConnect: true,
            onDisconnect: true,
            onUpgrade: true,
            onConfigure: true,
            onDestroy: true,
            onChange: true,
            onLoadDocument: true,
            onStoreDocument: true,
            
        }),
        new SQLite({
            database: env.DATABASE || "yjs.sqlite",
        }),
    ],
    onRequest(data) {
        return new Promise<void>(async (resolve, reject) => {
            const {request, response} = data;
            rootLogger.info(`Request for ${request.url  }`)

            const path=request.url?.split('/') || [];
            if(request.url?.match(/^\/docs\/(.*)/)) { 
                const docId=path.pop()
                const doc=   await server.openDirectConnection(docId || ":agents", {})
                rootLogger.warn(`Document request `, docId ,doc.document?.guid)

                if(doc.document) {
                    doc.document.shouldLoad && doc.document.load()
                    response.writeHead(200, {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "Cache-Control": "no-cache"
                    });
                    response.write(JSON.stringify(docJSON(doc.document)));
                    response.end()

                    return reject()
                }
                else {
                    // response.writeHead(404, {
                    //     "Content-Type": "text/plain",
                    //     "Access-Control-Allow-Origin": "*",
                    //     "Cache-Control": "no-cache"
                    // });
                    // response.write("Not found");
                    return resolve();
                }

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


function docJSON(doc: Y.Doc) {
    return  {
        id: doc.guid,
        href: doc.getMap().get("href"),
        rev: doc.getMap().get("rev"),
        loaded: doc.isLoaded,
        synced: doc.isSynced ,
        should_load: doc.shouldLoad,
        meta: doc.meta,
        subdocs: Array.from(doc.subdocs).map(({guid, collectionid, meta}) => ({guid, collectionid, meta})),
        ...Array.from(doc.share.entries()).reduce((acc, [key, value]) => {
            acc[key] = value.toJSON();
            return acc
        }, {} as Record<string, any>)
    }
}