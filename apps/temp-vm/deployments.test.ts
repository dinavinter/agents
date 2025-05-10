import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createActor } from "npm:xstate";
import { deploymentMachine } from "./deployments.ts";
import { waitFor } from "npm:xstate";

Deno.test("deployment machine workflow", async () => {
   
    const actor = createActor(deploymentMachine, {
        input: {
            project:  "soft-alpaca-12",
            assets: {
                "main.ts": {
                    kind: "file",
                    content: `Deno.serve(req => new Response("Hello!"));`,
                    encoding: "utf-8",
                  }
            }
        },
        inspector: {
           next: (state) => console.log(state.value, state.event)   
        }
    }).start();

    // Initial state should be idle
    assertEquals(actor.getSnapshot().value, "idle");

    // Start deployment
    actor.send({ type: "START" });
    await waitFor(actor, (state) => state.matches("building"))
    // assertEquals(actor.getSnapshot().value, "building");

    // // Wait for state transitions
    // await new Promise(resolve => setTimeout(resolve, 2500));

    // // Should be in running state after transitions
    // assertEquals(actor.getSnapshot().value, "running");

    // // Test error handling
    // actor.send({ type: "ERROR", error: new Error("Test error") });
    // assertEquals(actor.getSnapshot().value, "error");

    // Clean up
    actor.stop();
});

// Deno.test("deployment machine error handling", () => {
//     const actor = createActor(deploymentMachine).start();

//     // Send error event
//     actor.send({ type: "ERROR", error: new Error("Test error") });
//     assertEquals(actor.getSnapshot().value, "error");

//     // Try retry
//     actor.send({ type: "RETRY" });
//     assertEquals(actor.getSnapshot().value, "building");

//     // Reset to idle
//     actor.send({ type: "RESET" });
//     assertEquals(actor.getSnapshot().value, "idle");

//     // Clean up
//     actor.stop();
// });
