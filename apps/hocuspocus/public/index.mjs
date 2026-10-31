import { Server } from '@hocuspocus/server';
import { Logger } from '@hocuspocus/extension-logger';
import { SQLite } from '@hocuspocus/extension-sqlite';
import { env } from 'node:process';

const server = Server.configure({
  port: Number.parseInt(env.PORT || "8080"),
  address: "0.0.0.0",
  name: "agents",
  timeout: 3e4,
  debounce: 500,
  maxDebounce: 3e3,
  extensions: [
    new Logger({
      // log: (...args)=>rootLogger.logMessage(Level.Info, ...args),
      onRequest: true,
      onConnect: true,
      onDisconnect: true,
      onUpgrade: true,
      onConfigure: true,
      onDestroy: true,
      onChange: true,
      onLoadDocument: true,
      onStoreDocument: true
    }),
    new SQLite({
      database: env.DATABASE || "yjs.sqlite"
    })
  ],
  onRequest(data) {
    return new Promise(async (resolve, reject) => {
      const { request, response } = data;
      const path = request.url?.split("/") || [];
      if (request.url?.match(/^\/docs\/(.*)/)) {
        const docId = path.pop();
        const doc = await server.openDirectConnection(docId || ":agents", {});
        if (doc.document) {
          doc.document.shouldLoad && doc.document.load();
          response.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
          });
          response.write(JSON.stringify(docJSON(doc.document)));
          response.end();
          return reject();
        } else {
          return resolve();
        }
      }
      if (request.url?.match(/^\/logs\/(.*)/)) {
        const agent = request.url.split("/")[2];
        console.log(agent);
        const docConnection = await server.openDirectConnection("agents", {});
        const agentDoc = docConnection.document?.getMap("agents").get(agent);
        agentDoc?.shouldLoad && agentDoc?.load();
        const vm = agentDoc?.getMap("vm")?.toJSON();
        await docConnection.disconnect();
        if (vm) {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.write(JSON.stringify(vm));
        } else {
          response.writeHead(404, { "Content-Type": "text/plain" });
          response.write("Not found");
        }
        response.end();
        return reject();
      }
      resolve();
    });
  }
});
server.listen().then((r) => {
  console.log(`Server listening on ${r.address.address}:${r.address.port}`);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
function docJSON(doc) {
  return {
    id: doc.guid,
    href: doc.getMap().get("href"),
    rev: doc.getMap().get("rev"),
    loaded: doc.isLoaded,
    synced: doc.isSynced,
    should_load: doc.shouldLoad,
    meta: doc.meta,
    content: doc.toJSON(),
    subdocs: Array.from(doc.subdocs).map(({ guid, collectionid, meta }) => ({ guid, collectionid, meta })),
    ...Array.from(doc.share.entries()).reduce((acc, [key, value]) => {
      acc[key] = value.toJSON();
      return acc;
    }, {})
  };
}
