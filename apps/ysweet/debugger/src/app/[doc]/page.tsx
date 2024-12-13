import { YDocProvider } from '@y-sweet/react'
import {Debugger} from "@/app/debugger";

export default async function Home({
                                   params,
                               }: {
    params: Promise<{ doc: string }>
}) {
    const docId = (await params).doc
    return (
        <YDocProvider docId={docId} setQueryParam="doc" authEndpoint="/api/auth"   showDebuggerLink={false}>
            <Debugger /> 
        </YDocProvider>
    )
}