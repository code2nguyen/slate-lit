import { css, customElement, html, LitElement, query } from 'lit-element';
import { classMap } from 'lit-html/directives/class-map';
import { styleMap } from 'lit-html/directives/style-map';
import { Range as SlateRange} from 'slate';
import { SlateLit } from './slate-lit.component';
declare const window: any;

@customElement('slate-toolbar')
export class Toolbar extends LitElement {

  static styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      z-index: -1;
    }
    .toolbar-container {
      display: flex;
      padding: 4px 8px;
      border-radius: 4px;
      position: relative;
      align-items: center;
      visibility: hidden;
      background-color: rgb(var(--slate-toolbar-bg-color, 18,18,18));
      transition: visibility 0.3s ease-out;
    }
    ::slotted(*) {
      color: rgb(var(--slate-toolbar-color, 255,255,255));
    }
    .toolbar-container.show {
      visibility: visible;
    }

    .toolbar-container.top::after {
      top: 100%;
      left: 50%;
      border: solid transparent;
      content: "";
      height: 0;
      width: 0;
      position: absolute;
      pointer-events: none;
      border-color: rgba(136, 183, 213, 0);
      border-top-color: rgb(var(--slate-toolbar-bg-color, 18,18,18));
      border-width: 6px;
      margin-left: -6px;
    }


    .toolbar-container.bottom::after {
      bottom: 100%;
      left: 50%;
      border: solid transparent;
      content: "";
      height: 0;
      width: 0;
      position: absolute;
      pointer-events: none;
      border-bottom-color: rgb(var(--slate-toolbar-bg-color, 18,18,18));
      border-width: 6px;
      margin-left: -6px;
    }

    .toolbar-container.right::after {
      left: 100%;
      top: 50%;
      border: solid transparent;
      content: "";
      height: 0;
      width: 0;
      position: absolute;
      pointer-events: none;
      border-left-color: rgb(var(--slate-toolbar-bg-color, 18,18,18));
      border-width: 6px;
      margin-top: -6px;
    }


    .toolbar-container.left::after {
      right: 100%;
      top: 50%;
      border: solid transparent;
      content: "";
      height: 0;
      width: 0;
      position: absolute;
      pointer-events: none;
      border-right-color: rgb(var(--slate-toolbar-bg-color, 18,18,18));
      border-width: 6px;
      margin-top: -6px;
    }

  `
  @query('.toolbar-container') container!: HTMLElement;
  private _open = false;

  private showClasses: {[key: string]: boolean} = { show: false, left: false, right: false, top: false, bottom: false };
  private positionStyles = { transform: 'translate3d(0,0,0)'};
  private selectionRange?: Range;

  _slateLit?: SlateLit;

  get slateLit(): SlateLit {
    if (!this._slateLit) {
      this._slateLit = this.parentNode?.querySelector('slate-lit') as SlateLit;
    }
    return this._slateLit!;
  }

  get scroller() {
    // return parent of toolbar, TODO need to find scroller if parent is not.
    if (this.parentNode instanceof ShadowRoot) {
      return (this.parentNode as ShadowRoot).host as HTMLElement;
    } else {
      return this.parentNode as HTMLElement;
    }
  }

  private resizeObserver: any;
  private slateLitRect?: DOMRect;
  private clientRect?: DOMRect;
  private selectionRect?: DOMRect;

  async firstUpdated() {
    await new Promise((r) => setTimeout(r, 0));
    this.setupResizeObserver();
    this.resizeObserver.observe(this.slateLit);
    this.slateLit.addEventListener('selectionChange', this.onSelectionChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver.unobserve(this.slateLit)
  }

  setupResizeObserver() {
    this.resizeObserver = new window.ResizeObserver((entries: any) => {
      const entry = entries && entries[0];
      if (entry) {
        this.slateLitRect =  this.slateLit.getBoundingClientRect();
        if (this.isOpening()) {
          this._show();
        }
      }
    });
  }

  onSelectionChange = (event: any) => {
    if (event.detail && !SlateRange.isCollapsed(event.detail)) {
      const domSelection = this.slateLit.shadowRoot!.getSelection();
      if (!domSelection || !this.slateLitRect) return;
      const domRange = domSelection.getRangeAt(0)
      this.show(domRange)
    } else {
      this.close()
    }

  }

  close() {
    if (!this._open) return;
    this._open = false;
    this._close()
  }

  show(selectionRange: Range) {
    if (!this.clientRect) {
      this.clientRect = this.container.getBoundingClientRect();
    }
    this.selectionRange = selectionRange;
    this._open = true;
    this._show()
  }

  getPosition() {
    if (!this.clientRect || !this.selectionRect || !this.slateLitRect) return;
    let left = Math.max(this.selectionRect.left + this.selectionRect.width/2 - this.clientRect.width/2, this.slateLitRect.left);
    let top = this.selectionRect.bottom + 10;
    let direction: 'top' | 'bottom' = 'bottom';
    if (top + this.clientRect.height > this.scroller.clientHeight + this.scroller.scrollTop + this.slateLitRect.top) {
      direction = 'top';
      top = this.selectionRect.top - this.clientRect.height - 10;
    }
    top = top - this.slateLitRect.top;
    left = left - this.slateLitRect.left;
    return {top, left, direction}
  }

  updateParentSize(parentRect: DOMRectReadOnly) {

  }

  isOpening() {
    return this._open;
  }

  _show() {
    this.slateLitRect =  this.slateLit.getBoundingClientRect();
    this.selectionRect = this.selectionRange!.getBoundingClientRect();
    const position = this.getPosition();
    if (!position) {
      return;
    }
    const {left, top, direction} = position
    for (const property of Object.keys(this.showClasses)) {
      this.showClasses[property] = false;
    }
    this.showClasses.show = true;
    this.showClasses[direction] = true;
    this.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    this.style.zIndex = "1";
    this.requestUpdate();
  }

  _close() {
    for (const property of Object.keys(this.showClasses)) {
      this.showClasses[property] = false;
    }
    this.style.zIndex = "-1";
    this.requestUpdate();
  }

  render() {
    return html`<div class="toolbar-container ${classMap(this.showClasses)}"><slot></slot></div>`;
  }
}
