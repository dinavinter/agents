import * as Y from "https://esm.sh/yjs@13.6.23";
import type { DeclarationItem, ExportItem, ImportItem } from "https://esm.town/v/dinavinter/cxai/schema";

import { connectYjs } from "https://esm.town/v/dinavinter/connect";
function compareIdentifier(
    [keyA, {section: sectionA, body: bodyA}]: [string, Statement],
    [keyB, {section: sectionB, body: bodyb}]: [string, Statement],
) {
    function sectionOrder(s: string): number {
        const sections: { [key: string]: number } = {
            ["imports"]: 0,
            ["declarations"]: 1,
            ["exports"]: 2,
        };

        return sections[s]!;
    }

    return `${sectionOrder(sectionA)}_${keyA}_${bodyA}`.localeCompare(`${sectionOrder(sectionB)}_${keyB}_${bodyb}`);
}

// Main text for CodeMirror.
// Use maps (instead of arrays) for each section.
type Statement = {
    body: string;
    after?: string;
    section: string;
    tags: string;
};

export function syncstatements(doc: Y.Doc | string) {
    const ydoc = typeof doc === "string" ? connectYjs(doc) :doc;
    const statements = ydoc.getMap<Statement>("statements");
    const importsMap = ydoc.getMap<ImportItem>("import");
    const declarationsMap = ydoc.getMap<DeclarationItem>("declaration");
    const exportsMap = ydoc.getMap<ExportItem>("export");
    const sourceMap = ydoc.getMap();

    statements.observe((e) => {
        const sortedStatements = Array.from(statements).sort(compareIdentifier);
        ydoc.transact(() => {
            ydoc.getText("codemirror").delete(0, ydoc.getText("codemirror").length);
            ydoc.getText("codemirror").insert(1, sortedStatements.map(([, {body}]) => body).join("\n\n"));
            sourceMap.set("src", sortedStatements.map(([, {body}]) => body).join("\n"));
        });
    })

    importsMap.observe((e) => {
        ydoc.transact(() => {
            e.keysChanged.forEach((key) => {
                const item = importsMap.get(key);
                item && statements.set(key, {
                    tags: "imports",
                    body: `import {${item.names.join(",")}} from '${item.module}';`,
                    section: "imports",
                });
            });
        });
    });
// For declarations.
    declarationsMap.observe((e) => {
        ydoc.transact(() => {
            e.keysChanged.forEach((key) => {
                const item = declarationsMap.get(key);
                item && statements.set(key, {
                    tags: "declarations",
                    body: item.content,
                    section: "declarations",
                    after: "imports",
                });
            });
        });
    });
    exportsMap.observe((e) => {
        ydoc.transact(() => {
            e.keysChanged.forEach((key) => {
                const item = exportsMap.get(key);
                item && statements.set(key, {
                    tags: "exports",
                    body: `export default {\n  ${item.handler.name}(${
                        item.handler.params.join(
                            ", ",
                        )
                    }) {\n    ${item.handler.body}\n  }\n};\n\n`,
                    section: "exports",
                    after: "declarations",
                });
            });
        });
    });
    return {
        statements: statements,
        importsMap,
        declarationsMap,
        exportsMap,
        sourceMap,
        yText: ydoc.getText("codemirror")
    }
}