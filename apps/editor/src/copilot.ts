import {codeiumOtherDocumentsConfig, copilotPlugin, Language, startCompletion} from "@valtown/codemirror-codeium";
import { keymap } from "@codemirror/view";


export function codeiumCopilot() {
    return [
        codeiumOtherDocumentsConfig.of({
            override: () => [
                {
                    absolutePath: "https://esm.town/v/foo.ts",
                    text: `export const foo = 10;
                            const hiddenValue = "https://macwright.com/"`,
                    language: Language.TYPESCRIPT,
                    editorLanguage: "typescript",
                } 
              
               
                    
            ],
        }),
        copilotPlugin({
            apiKey: "d49954eb-cfba-4992-980f-d8fb37f0e942",
            shouldComplete(context) {
                if (context.tokenBefore(["String"])) {
                    return true;
                }
                const match = context.matchBefore(/(@(?:\w*))(?:[./](\w*))?/);
                return !match;
            },
        }),
        keymap.of([
            {
                key: "Cmd-k",
                run: startCompletion,
            },
        ])
    ];
}

export const copilotStyle = `
.cm-ghostText,
.cm-ghostText * {
  opacity: 0.6;
  filter: grayscale(20%);
  cursor: pointer;
}

.cm-ghostText:hover {
  background: #eee;
}
`;
