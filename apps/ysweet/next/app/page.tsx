'use client';
import {router} from "next/client";
import React from "react";
import {DocViewer} from "@/components/viewer";
import {YDocProvider} from "@y-sweet/react";
import {App} from "@/components/App";
import {Debugger} from "@/components/debugger";



export async function DocIdForm() {
   "use client";
    const [docId, setDocId] = React.useState("");
    return (
        <form onSubmit={(e) => {
            e.preventDefault();
            router.push(`/${docId}`);
        }}>
            <input value={docId} onChange={(e) => setDocId(e.target.value)} />
            <button type="submit">Go</button>
        </form>
    );
}

 
export default  function Home() {
   const [docId, setDocId] = React.useState("");
   const [doc, setDoc] = React.useState("");
    return (<div>
          <form onSubmit={(e) => {
            e.preventDefault();
              setDoc(docId);
          }}>
            <input value={docId} onChange={(e) => setDocId(e.target.value)} />
            <button type="submit">Go</button>
          </form>
            <YDocProvider docId={doc} authEndpoint={"/api/auth"}>
               <Debugger />
            </YDocProvider>
        </div>
      );
}
