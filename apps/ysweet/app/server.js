import express from 'express'
import cors from 'cors'
import { getOrCreateDocAndToken } from '@y-sweet/sdk'
import { DocumentManager } from '@y-sweet/sdk'
import * as Y from 'yjs'
import * as http from "node:http";
const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 9090
const CONNECTION_STRING = process.env.CONNECTION_STRING || "ys://127.0.0.1:8080"




// app.param('doc', async function(req, res, next, id){
//     try {
//         const manager = new DocumentManager(CONNECTION_STRING)
//         let update = await manager.getDocAsUpdate(id)
//         let doc = new Y.Doc()
//         doc.transact(() => {
//             Y.applyUpdate(doc, update)
//         })
//         req.doc = doc
//         next()
//     }
//     catch (error) {
//          console.error(`Error loading doc ${id}: ${error}`)
//     }
//
// });

app.param(['doc'], (req, res, next, value) => {
    console.log('CALLED ONLY ONCE with', value)
    next()
})


app.post('/y-sweet-auth', async (req, res) => {
    
    const docId = req.body?.docId ?? null
    if (docId) {
        console.log('Received client token request for doc', docId)
    } else {
        console.log('Received client token request for new doc')
    }

    // -------- DO AN AUTH CHECK HERE TO SEE IF THE USER CAN ACCESS THIS DOC --------

    const clientToken = await getOrCreateDocAndToken(CONNECTION_STRING, docId)
    res.send(clientToken)
})
app.get('/', async (req, res) => {
    res.send('Y-Sweet VanillaJS demo server')
    
})
app.get('/docs', async (req, res) => { 
    res.send('hey man') 
})
const server =http.createServer(app).listen(PORT, "0.0.0.0")

server.on('error', (error) => {
    console.error(`Y-Sweet server error: `, error)
})
server.on('listening', () => {
    console.log(`Y-Sweet server listening on port ${PORT}`)
    console.log(`Routes:`)
    console.log(`\t GET /:doc`)
    console.log(`\t POST /y-sweet-auth`)
    console.log(`\t POST /`)
})
server.on('exit', () => {
    console.log(`Y-Sweet server exited`)
})


// https.createServer(options, app).listen(443)

// app.listen = function () {
//     const server = http.createServer(this)
//     return server.listen.apply(server, arguments)
// } 
// app.listen(PORT, () => {
//     console.log(`Y-Sweet server listening on port ${PORT}`)
//     console.log(`Routes:`)
//     console.log(`\t GET /:doc`)
//     console.log(`\t POST /y-sweet-auth`)
//     console.log(`\t POST /`)
// }, () => {
//     console.log(`Y-Sweet server exited`)
// }, (error) => {
//     console.error(`Y-Sweet server error: ${error}`)
// })

 