import {HocuspocusProvider} from "@hocuspocus/provider";
import * as Y from "yjs";
const doc = new Y.Doc();
const provider = new HocuspocusProvider({
    url: 'wss://hp.cfapps.us10-001.hana.ondemand.com',
    name: 'hocuspocus',
    document: doc 
});

// Define `tasks` as an Array
const tasks = provider.document.getArray("tasks");

// Listen for changes
tasks.observe(() => {
    console.log("tasks were modified");
    console.log(doc.getArray("tasks").toJSON());
});

// Add a new task
tasks.push(["buy milk"]);
