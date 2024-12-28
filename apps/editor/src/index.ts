import { autocompletion } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import {
    tsAutocompleteWorker,
    tsFacetWorker,
    tsGotoWorker,
    tsHoverWorker,
    tsLinterWorker,
    tsSyncWorker,
} from '@valtown/codemirror-ts';
import { EditorView, basicSetup } from 'codemirror';
import * as Comlink from 'comlink';
import { containerStyles, editorTheme, tooltipStyles } from './styles';
import {cmCollab} from "./collab"
import * as ts from "typescript";
import TSWorker from "./worker.ts?worker&inline"  
export function renderDisplayParts(dp: ts.SymbolDisplayPart[]) {
    const div = document.createElement('div');
    for (const part of dp) {
        const span = div.appendChild(document.createElement('span'));
        span.className = `quick-info-${part.kind}`;
        span.innerText = part.text;
    }
    return div;
}

export const EDITOR_READY_EVENT = "cm:ts:ready";


export class TypeScriptEditor extends HTMLElement {
    editor: EditorView | null = null;
 
    static get observedAttributes() {
        return ['value' , "url", "room" , "component"];
    }
    
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    
    }
    
    
    get  url() {
        return this.getAttribute('url') || "ws://localhost:1234";
    }
    
    get  room() {
        return this.getAttribute('room') || "default";
    }
    
    get component(){
        return this.getAttribute('component') || "codemirror";
    }

    async connectedCallback() {
        // Add styles
        const style = document.createElement('style');
        style.textContent = containerStyles + tooltipStyles;
        this.shadowRoot?.appendChild(style);

        // Create editor container
        const editorContainer = document.createElement('div');
        editorContainer.id = 'editor';
        this.shadowRoot?.appendChild(editorContainer);
 
        

         const path = 'index.ts';
        // const innerWorker = new Worker(new URL('worker.ts?worker&inline', import.meta.url), {
        //     name: "ts-worker",
        //     type: 'module',
        // });
        const innerWorker= new TSWorker({
            name:"na"
        })
        // const innerWorker= new ComlinkWorker<typeof import("./worker")>(new URL('./worker.ts', import.meta.url), {
        //             type: 'module',
        //         })
        const worker = Comlink.wrap(innerWorker) as any;
        
        await worker.initialize();
        
        // const  worker= new ComlinkWorker<typeof import("./worker")>(new URL('./worker.ts', import.meta.url), {
        //         type: 'module',
        //     })
        this.editor = new EditorView({
            extensions: [
                basicSetup,
                editorTheme,
                javascript({
                    typescript: true,
                    jsx: true,
                }),
                tsFacetWorker.of({ worker, path }),
                tsSyncWorker(),
                tsLinterWorker(),
                autocompletion({
                    override: [
                        tsAutocompleteWorker({
                            renderAutocomplete: (raw) => {
                                return () => {
                                    const div = document.createElement('div');
                                    div.classList.add('cm-tooltip');

                                    if (raw.displayParts) {
                                        const signature = div.appendChild(document.createElement('div'));
                                        signature.className = 'quick-info-signature';
                                        signature.appendChild(renderDisplayParts(raw.displayParts));
                                    }

                                    if (raw.documentation) {
                                        const docs = div.appendChild(document.createElement('div'));
                                        docs.className = 'quick-info-documentation';
                                        docs.appendChild(renderDisplayParts(raw.documentation));
                                    }

                                    return { dom: div };
                                };
                            },
                        }),
                    ],
                }),
                tsHoverWorker(),
                tsGotoWorker(),
                cmCollab({
                    url: this.url,
                    room: this.room,
                    component: this.component
                })
            ],
            parent: editorContainer,
        });

        // Dispatch ready event
        this.dispatchEvent(new CustomEvent(EDITOR_READY_EVENT, {
            detail:this.editor,
            bubbles: true,
            composed: true
        }));
    }

    disconnectedCallback() {
        this.editor?.destroy();
    }

    get value() {
        return this.editor?.state.doc.toString() || '';
    }

    set value(newValue: string) {
        if (this.editor) {
            this.editor.dispatch({
                changes: {
                    from: 0,
                    to: this.editor.state.doc.length,
                    insert: newValue
                }
            });
        }
    }
}

customElements.define('ts-editor', TypeScriptEditor);