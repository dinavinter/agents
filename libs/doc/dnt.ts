import { build, emptyDir } from "@deno/dnt";

await emptyDir("./npm");

await build({
    entryPoints: ["./provider/hp.ts", "./provider/type.ts"],
    // mappings:{
    //    
    // }
    filterDiagnostic(diagnostic) {
        return !diagnostic.file?.fileName.includes("_test.ts")  ;
    },
    outDir: "./npm",
    shims: {
        deno: true,
        webSocket: true,
    },
    package: {
        name: "@ylm/doc",
        version: Deno.args[0],
        
        description:
            "A simple doc manager to connect to Yjs documents using Hocuspocus, YSweet, or YPartykit",
        license: "MIT",
        repository: {
            type: "git",
            url: "git+https://github.com/dinavinter/y-block",
        },
        bugs: {
            url: "https://github.com/dinavinter/y-block/issues",
        }
            
    },
    postBuild() {
        // Deno.copyFileSync("LICENSE", "npm/LICENSE");
        // Deno.copyFileSync("README.md", "npm/README.md");
    },
});
