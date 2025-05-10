import type * as ts from 'typescript';
import { connect } from './connect';
import { useStore } from './store.ts';
import { Doc } from 'yjs';
const { autocompletion } = await import('@codemirror/autocomplete');
const { javascript } = await import('@codemirror/lang-javascript');
const { tsAutocompleteWorker, tsFacetWorker, tsGotoWorker, tsHoverWorker, tsLinterWorker, tsSyncWorker } = await import('@valtown/codemirror-ts');
const Comlink = await import('comlink');
const { containerStyles, editorTheme, tooltipStyles } = await import('./styles');
const { cmCollab } = await import('./collab');
const { default: TSWorker } = await import('./worker.ts?worker&inline');
const { codeiumCopilot, copilotStyle } = await import('./copilot.ts');
import * as Y from "yjs";
// import {classHighlighter} from '@lezer/highlight';
// import {syntaxHighlighting} from '@codemirror/language';
// import {tsxLanguage} from '@codemirror/lang-javascript';


const { EditorView, basicSetup } = await import('codemirror');

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
export const EDITOR_CHANGE_EVENT = "change";

export class TypeScriptEditor extends HTMLElement {
    editor: InstanceType<typeof EditorView> | null = null;
 
    static get observedAttributes() {
        return ['value' , "url", "room" , "component"];
    }
    
    attributeChangedCallback(name: string, oldValue: any, newValue: any) {
        if (name === 'value' && this.editor && newValue !== this.value) {
            this.value = newValue;
        }
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
        style.textContent = containerStyles + tooltipStyles +copilotStyle;
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
            name:"ts-editor-worker",
        })
        // const innerWorker= new ComlinkWorker<typeof import("./worker")>(new URL('./worker.ts', import.meta.url), {
        //             type: 'module',
        //         })
        const worker = Comlink.wrap(innerWorker) as any;
        
        await worker.initialize();
        
        // const  worker= new ComlinkWorker<typeof import("./worker")>(new URL('./worker.ts', import.meta.url), {
        //         type: 'module',
        //     })

        const {doc, awareness} = useStore(this.url, this.room);
        console.log("doc", doc.getText(this.component).toJSON());
        const text= useSyncedText(doc.getText(this.component));
        console.log("text", text.toJSON());
        text.observe(e => {
            console.log("text", e);
        });
        this.editor = new EditorView({
             extensions: [
                basicSetup,
                editorTheme,
                javascript({
                    typescript: true,
                    jsx: true,
                }),
                tsFacetWorker.of({ worker, path }),
                // syntaxHighlighting(classHighlighter),
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
                    awareness,
                    component: text
                }),
                codeiumCopilot()
            ],
            parent: editorContainer,
        });
        this.editor.dom.onchange =  this.onValueChanged.bind(this);
        // Dispatch ready event
        this.dispatchEvent(new CustomEvent(EDITOR_READY_EVENT, {
            detail:this.editor,
            bubbles: true,
            composed: true
        }));
    }
    
    onValueChanged(e: Event) {
        console.debug("cm: value changed",e)
        this.dispatchEvent(new CustomEvent(EDITOR_CHANGE_EVENT, {
            detail: this.value,
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

export {rooms,connect} from "./connect"

export interface HTMLTypeScriptEditor extends TypeScriptEditor, HTMLElement {
    readonly editor: InstanceType<typeof EditorView> | null;
    room: string;
    url: string;
    component: string;
}

declare global {
    interface HTMLElementTagNameMap {
        'ts-editor': HTMLTypeScriptEditor
    }
}

function useSyncedText(yText: Y.Text) {
    const doc = new Doc();
    doc.getText("text").applyDelta(yText.toDelta());
    yText.observe(e => {
        doc.getText("text").applyDelta(e.changes.delta);
    });
    return doc.getText("text");
}
