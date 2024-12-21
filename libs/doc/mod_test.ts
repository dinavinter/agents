import { assertEquals, assert } from "@std/assert";
import { HPYjsDocManager } from "./provider/hp.ts";



Deno.test("hp tests", {
  sanitizeResources: false,
  sanitizeOps: false
},async (t) => {
  const manager = new HPYjsDocManager("yjs-test.cfapps.us10-001.hana.ondemand");
  const doc = "test-doc-1"
  const connectedDoc = manager.connect({doc: doc, connect: true});


 await t.step("HPYjsDocManager - connect method", () => {
    assert(connectedDoc);
    assertEquals(connectedDoc.guid, doc);
    assertEquals(manager.providers.get(doc)!.isConnected, true);
  });

  await t.step("HPYjsDocManager - get method", () => {
    const retrievedDoc = manager.get(doc);

    assert(retrievedDoc);
    assertEquals(retrievedDoc.guid, doc);

  });
  
  manager.providers.get(doc)!.disconnect();

})
 
 