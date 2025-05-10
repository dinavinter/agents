import type { HTMLTypeScriptEditor } from './index';

class TsEditorForm extends HTMLElement {
  static formAssociated = true;
  private _internals: ElementInternals;
  private _defaultValue = null;
  private $editor: HTMLTypeScriptEditor | null = null;

  static get observedAttributes() {
    return ['value', 'name', 'required', 'disabled', 'initialvalue', "url", "room"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._internals = this.attachInternals();
  }

  get value() {
    return this.$editor?.value || null;
  }
  set value(val: string | null) {
    const effectiveValue = val || this.defaultValue;
    if (this.$editor  && effectiveValue) {
      this.$editor.value = effectiveValue
    }
    else if (this.$editor) {
      this.$editor.value = ""
    }
 

    this._internals.setFormValue(effectiveValue);
  }

  get defaultValue() {
    return this.getAttribute('initialvalue') || this._defaultValue 
  }
 

  get name() {
    return this.getAttribute('name') || '';
  }
  set name(val: string) {
    this.setAttribute('name', val);
  }

  get required() {
    return this.hasAttribute('required');
  }
  set required(val: boolean) {
    if (val) this.setAttribute('required', '');
    else this.removeAttribute('required');
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }
  set disabled(val: boolean) {
    if (val) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }

  connectedCallback() {
    // Style
    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        font-family: inherit;
      }
      label {
        display: block;
        font-weight: 500;
        margin-bottom: 0.5rem;
      }
      ts-editor {
        min-height: 120px;
        border-radius: 0.5rem;
        border: 1px solid #e5e7eb;
        background: #fff;
        box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.03);
        transition: border 0.2s;
      }
      ts-editor[disabled] {
        opacity: 0.6;
        pointer-events: none;
      }
      .error {
        color: #ef4444;
        font-size: 0.9em;
        margin-top: 0.25rem;
      }
    `;
    this.shadowRoot!.appendChild(style);

    // Label
    const label = document.createElement('label');
    label.textContent = this.getAttribute('label') || this.name || 'Code';
    this.shadowRoot!.appendChild(label);

    // ts-editor
    const editor = document.createElement('ts-editor') as HTMLTypeScriptEditor;
    // Determine the initial value for the editor 
    if (this.hasAttribute('room')) editor.setAttribute('room', this.getAttribute('room')!);
    if (this.hasAttribute('url')) editor.setAttribute('url', this.getAttribute('url')!);
    if (this.disabled) editor.setAttribute('disabled', '');
   
    this.shadowRoot!.appendChild(editor);
    this.$editor = editor;
    // this.value = this.getAttribute('value')
    console.log("connectedCallback", this.value)

    // Listen for changes
    editor.addEventListener('change', () => {
      this._internals.setFormValue(this.value);
      this.validate();
    });
  }

  attributeChangedCallback(name: string, oldValue: any, newValue: any) {
    if (!this.$editor) return;
    if (name === 'value') this.value = newValue;
    if (name === 'disabled') {
      if (this.disabled) this.$editor.setAttribute('disabled', '');
      else this.$editor.removeAttribute('disabled');
    }
    if (name === 'required') this.validate();
    if (name === 'url') this.$editor.setAttribute('url', newValue);
    if (name === 'room') this.$editor.setAttribute('room', newValue);

    
  }

  // Form association
  formDisabledCallback(disabled: boolean) {
    if (this.$editor) {
      if (disabled) this.$editor.setAttribute('disabled', '');
      else this.$editor.removeAttribute('disabled');
    }
  }
  formResetCallback() {
    this.value = this.getAttribute('initialvalue') || this._defaultValue;
    this._internals.setFormValue(this.value);
    this.validate();
  }
  formStateRestoreCallback(state: any) {
    this.value = state;
    this._internals.setFormValue(this.value);
  }

  // Validation
  validate() {
    if (this.required && !this.value) {
      this._internals.setValidity({ valueMissing: true }, 'This field is required', this.$editor || undefined);
      this.showError('This field is required');
    } else {
      this._internals.setValidity({}, '', this.$editor || undefined);
      this.showError('');
    }
  }
  showError(msg: string) {
    let error = this.shadowRoot!.querySelector('.error') as HTMLElement;
    if (!error) {
      error = document.createElement('div');
      error.className = 'error';
      this.shadowRoot!.appendChild(error);
    }
    error.textContent = msg;
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

customElements.define('ts-editor-form', TsEditorForm);

export { TsEditorForm }; 