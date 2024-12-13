
import { YDocProvider } from '@y-sweet/react'
import {ClientToken, decodeClientToken, DocumentManager} from '@y-sweet/sdk'
import {FormEvent, useCallback, useEffect, useState} from 'react'
import { Debugger } from './debugger'
import {CONNECTION_STRING} from "@/lib/config";

const manager = new DocumentManager(CONNECTION_STRING)

export default function Home() {

    'use client'
    const [docId, setDocId] = useState<string | undefined>(undefined)


    const loadDoc =  (e:FormEvent<{docId:string}>) => {
        e.preventDefault()
        setDocId(e.currentTarget.docId)
    }
  
    return (<div>
        <form onSubmit={loadDoc} >
        <input type="text" name="docId" />
        <button type="submit">Load Doc</button>
        </form>
        <DebuggerWrapper docId={docId} />
       </div>
    )
  
}

function DebuggerWrapper({ docId }: { docId: string | undefined }) {
    async function getClientToken() {
        'use server'
        // In a production app, this is where you'd authenticate the user
        // and check that they are authorized to access the doc.
        return await manager.getOrCreateDocAndToken(docId)
    }

    return (<div>
            {docId && <YDocProvider docId={docId} authEndpoint={getClientToken} showDebuggerLink={false}>
                <Debugger/>
            </YDocProvider> || <div>Enter a docId</div>}
        </div>
    )
}
