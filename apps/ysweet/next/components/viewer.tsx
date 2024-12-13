
import {YDocProvider} from "@y-sweet/react";
import {App} from "@/components/App";
import React from "react";
import {DocumentManager} from "@y-sweet/sdk";

const manager = new DocumentManager(
    process.env.CONNECTION_STRING || "ys://127.0.0.1:8080",
);
export async function DocViewer({id}: { id: string }) {
    // async function getClientToken() {
    //     "use server";
    //
    //     // In a production app, this is where you'd authenticate the user
    //     // and check that they are authorized to access the doc.
    //     return await manager.getOrCreateDocAndToken(id);
    // }

    return (
        <YDocProvider docId={id} authEndpoint={"/api/auth"}>
            <App />
        </YDocProvider>
    );
}
