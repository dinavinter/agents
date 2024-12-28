import { EditorView } from '@codemirror/view';

// Base editor container styles
export const containerStyles = `
  :host {
    display: block;
    width: 100%;
    height: 100%;
  }
  #editor {
    width: 100%;
    height: 100%;
  }
`;

// CodeMirror theme extension
export const editorTheme = EditorView.theme({
  "&": {
    height: "100%"
  },
  ".cm-scroller": {
    height: "100%",
    overflow: "auto"
  },
  ".cm-content": {
    fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
    fontSize: "14px",
    lineHeight: "1.6"
  }
});

// Tooltip styles
export const tooltipStyles = `
  .cm-tooltip {
    background-color: #252526;
    border: 1px solid #454545;
    border-radius: 3px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.5;
    color: #d4d4d4;
    max-width: 800px;
    padding: 8px 10px;
  }
  .quick-info-signature {
    padding-bottom: 8px;
    border-bottom: 1px solid #454545;
    margin-bottom: 8px;
  }
  .quick-info-documentation {
    color: #989898;
    font-size: 12px;
  }
  .quick-info-punctuation { color: #808080; }
  .quick-info-text { color: #ce9178; }
  .quick-info-keyword { color: #569cd6; }
  .quick-info-aliasName { color: #4ec9b0; }
  .quick-info-typeParameterName { color: #c586c0; }
  .quick-info-space { display: inline-block; width: 4px; }
  .quick-info-lineBreak { display: block; height: 1em; margin: 4px 0; }
  .quick-info-operator { color: #d4d4d4; }
  .quick-info-parameterName { color: #9cdcfe; }
  .quick-info-propertyName { color: #9cdcfe; }
`;