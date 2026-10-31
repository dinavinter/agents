import type * as ts from 'typescript';
declare const EditorView: any;
export declare function renderDisplayParts(dp: ts.SymbolDisplayPart[]): HTMLDivElement;
export declare const EDITOR_READY_EVENT = "cm:ts:ready";
export declare const EDITOR_CHANGE_EVENT = "change";
export declare class TypeScriptEditor extends HTMLElement {
    editor: InstanceType<typeof EditorView> | null;
    static get observedAttributes(): string[];
    constructor();
    get url(): string;
    get room(): string;
    get component(): string;
    connectedCallback(): Promise<void>;
    onValueChanged(e: Event): void;
    disconnectedCallback(): void;
    get value(): string;
    set value(newValue: string);
}
export { rooms } from "./collab";
export interface HTMLTypeScriptEditor extends TypeScriptEditor, HTMLElement {
    readonly editor: InstanceType<typeof EditorView> | null;
    room: string;
    url: string;
    component: string;
}
declare global {
    interface HTMLElementTagNameMap {
        'ts-editor': HTMLTypeScriptEditor;
    }
}
