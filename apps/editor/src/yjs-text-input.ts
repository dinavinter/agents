import * as Y from 'yjs';
import { connect } from './index';
import { useStore } from './store';
// import { connectYjs } from "https://esm.town/v/dinavinter/connect";

class YjsTextInput extends HTMLElement {
  private _awareness: any;
  static get formAssociated() {
    return true;
  }
  private _internals: ElementInternals;
  private _yDoc: Y.Doc | null = null;
  private _yText: Y.Text | null = null;
   private changeHandler: (event: Y.YTextEvent) => void;
  private _shadow: ShadowRoot;

  static get observedAttributes() {
    return ['name', 'required', 'disabled', 'url', 'room', 'component'];
  }

  constructor() {
    super();
    this._internals = this.attachInternals();
    this.changeHandler = this.handleYjsUpdate.bind(this);
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `<slot></slot> `;
  }

  // Read-only value that comes from YJS
  get value() {
    return this._yText?.toJSON() || null;
  }

  get component() {
    return this.getAttribute('component') || this.getAttribute('name') || 'shared';
  } 

  private setupYjs() {
    const url = this.getAttribute('url');
    const room = this.getAttribute('room');

    if (!url || !room) {
      console.error('YjsTextInput requires both url and room attributes');
      return;
    }

    const {doc, awareness} = useStore(url, room); 
    // this._yDoc = connectYjs(room);
    this._awareness = awareness; 
    this._yDoc = doc;
    this._yText = this._yDoc!.getText(this.component);
    this._yText.observe(this.changeHandler);
    this._internals.setFormValue(this._yText.toJSON());
  //       this.innerHTML= `  <ts-editor
  //   component="${this.component}"
  //   url="${this.getAttribute('url')}"
  //   room="${this.getAttribute('room')}"
  // ></ts-editor>`
  }

  private handleYjsUpdate(event: Y.YTextEvent) {    
    const newValue = event.target.toJSON();
    console.log('newValue', newValue);
    this._internals.setFormValue(newValue);
    this.validate();
    this.dispatchEvent(new CustomEvent('value-changed', { 
      detail: { value: newValue },
      bubbles: true,
      composed: true 
    }));
  }

  connectedCallback() {
    this.setupYjs();
  //   this.innerHTML= `  <ts-editor
  //   component="${this.component}"
  //   url="${this.getAttribute('url')}"
  //   room="${this.getAttribute('room')}"
  // ></ts-editor>`

  }

  disconnectedCallback() {
    if (this._yText ) {
      this._yText.unobserve(this.handleYjsUpdate);
     }
  }

  // attributeChangedCallback(name: string, oldValue: any, newValue: any) {
  //   if ((name === 'url' || name === 'room' || name === 'component') && oldValue !== newValue) {
  //     this.setupYjs();
  //   }
  // }

  formResetCallback() {
    this.validate();
  }

  formStateRestoreCallback(state: any) {
    this.validate();
  }

  validate() {
    if (this.getAttribute('required') !== 'false' && !this.value) {
      this._internals.setValidity(
        { valueMissing: true },
        'This field is required'
      );
    } else {
      this._internals.setValidity({});
    }
  }

  public checkValidity(): boolean {
    return this._internals.checkValidity();
  }

  public reportValidity(): boolean {
    return this._internals.reportValidity();
  }

  public get validity(): ValidityState {
    return this._internals.validity;
  }

  public get validationMessage(): string {
    return this._internals.validationMessage;
  }
}

customElements.define('yjs-text-input', YjsTextInput);

export { YjsTextInput }; 