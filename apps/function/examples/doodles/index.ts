import doodles from "./index.json" with { type: "json" };


export * from "./embedded.ts";
  

 export type Doodle =typeof doodles[number];