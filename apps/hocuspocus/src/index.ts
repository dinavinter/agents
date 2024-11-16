import { Server } from '@hocuspocus/server'
import { Logger } from '@hocuspocus/extension-logger'
import { SQLite } from '@hocuspocus/extension-sqlite'
import {env} from 'node:process'
const server = Server.configure({
    port: Number.parseInt(env.PORT || "8080"),
    address: '0.0.0.0',
    name: 'hocuspocus',
    extensions: [
        new Logger(),
        new SQLite({
            database: "db.sqlite"
        }),
    ]
})

server.listen().then(r => {
    console.log(`Server listening on ${r.address.address}:${r.address.port}`)
}).catch(e => {
    console.error(e)
    process.exit(1)
})