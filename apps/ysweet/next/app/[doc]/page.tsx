import { YDocProvider } from '@y-sweet/react'
import {Debugger} from "@/components/debugger";
import {DocumentManager} from "@y-sweet/sdk";

const manager = new DocumentManager(
    process.env.CONNECTION_STRING || "ys://127.0.0.1:8080",
);
export default async function Home({
                                   params,
                               }: {
    params: Promise<{ doc: string }>
}) {
    const docId = (await params).doc

    async function getClientToken() {
        "use server";
        // In a production app, this is where you'd authenticate the user
        // and check that they are authorized to access the doc.
        return await manager.getOrCreateDocAndToken(docId);
    }
    console.log("docId", docId) 
    return (<div>
        {docId &&
        <YDocProvider docId={docId}  authEndpoint={getClientToken}   showDebuggerLink={false}>
            <Debugger docId={docId} /> 
        </YDocProvider>  || <div>docId not found</div>}
        </div>
    )
}