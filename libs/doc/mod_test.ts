import { HPYjsDocManager } from "./provider/hp.ts";

import { expect } from "@std/expect";

Deno.test("hp tests", {
  sanitizeResources: false,
  sanitizeOps: false
},async (t) => {
  const manager = new HPYjsDocManager("yjs-test.cfapps.us10-001.hana.ondemand");
  const doc = "test-doc-1"
  const connectedDoc = manager.connect({doc: doc, connect: true});


 await t.step("HPYjsDocManager - connect method", () => {
     expect(connectedDoc).toBeDefined();
     expect(connectedDoc.guid).toEqual(doc);
     expect(manager.providers.get(doc)).toBeDefined();
  });

  await t.step("HPYjsDocManager - get method", () => {
    const retrievedDoc = manager.get(doc);

    expect(retrievedDoc).toBeDefined();
    expect(doc).toEqual(doc);

  });

  manager.providers.get(doc)!.disconnect();

})

