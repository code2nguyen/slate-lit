import { isHotkey } from 'is-hotkey';
import { LitElement, customElement, html, query, property, css } from 'lit-element';
import { Editor, Node, Range, Transforms } from 'slate';
import { RenderElementAttributes } from './models';
import { SlateLit } from './slate-lit.component';
import { ifDefined } from 'lit-html/directives/if-defined';
import { styleMap } from 'lit-html/directives/style-map.js';
import { classMap } from 'lit-html/directives/class-map.js';

import { Toolbar } from './toolbar.component';

const HOTKEYS: {[key: string]: string} = {
  'mod+b': 'bold',
  'mod+i': 'italic',
  'mod+u': 'underline',
  'mod+`': 'code',
};

const LIST_TYPES = ['numbered-list', 'bulleted-list'];
@customElement('rich-text-editor')
export class RichTextEditor extends LitElement {

  static styles = css`
    :host {
      display: flex;
      position: relative;
      padding: var(--slate-lit-rich-text-editor-padding, 8px 0px 8px 8px);
    }
    .icon-button {
      padding: 4px;
      cursor: pointer;
      opacity: 0.5;
      fill: currentColor;
      transition: opacity 0.3s ease-out;
      width: 18px;
      height: 18px;
      fill: currentColor;
    }

    .icon-button:hover {
      opacity: 1;
    }
    .icon-button.active {
      opacity: 1;
    }
  `

  codeStyle = {
    fontFamily: 'monospace',
    backgroundColor: 'var(--slate-lit-code-background-color, #eee)',
    padding: '3px'
  }

  blockQuoteStyle = {
    marginLeft: '0',
    marginRight: '0',
    paddingLeft: '10px',
    color: '#aaa',
    fontStyle: 'italic',
    fontSize: '0.9em'
  }


  @query('.slate-lit') slateLit!: SlateLit;
  @query('.slate-toolbar') slateToolbar!: Toolbar;

  private _value: Node[] = [];
  @property({ type: Array })
  public get value(): Node[] {
    return this._value;
  }
  public set value(value: Node[]) {
    this._value = value;
    this.requestUpdate();
  }

  @property({ type: String }) placeholder = ''
  @property({type: Boolean}) readOnly = false;

  activeMarks = { title: { active: false }, highlight: { active: false }, quote: { active: false }, list: { active: false }, bold:  { active: false }, italic: { active: false }}

  render() {
    return html`<slate-lit
      class="slate-lit"
      .renderLeaf=${this.renderLeaf}
      .renderElement=${this.renderElement}
      .value=${this.value}
      .placeholder=${this.placeholder}
      spellcheck=${this.spellcheck}
      .readOnly=${this.readOnly}
      @keydown=${this.onKeyDown}
      @selectionChange=${this.onSelectionChange}
      @valueChange=${this.onValueChange}
    ></slate-lit>
    <slate-toolbar class="slate-toolbar">
      <!-- title -->
      <svg @mousedown=${this.onToolbarItemClick} class="icon-button ${classMap(this.activeMarks.title)}" data-type="block" data-format="heading-two" viewBox="0 0 24 24"><path d="M5 5.5C5 6.33 5.67 7 6.5 7h4v10.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V7h4c.83 0 1.5-.67 1.5-1.5S18.33 4 17.5 4h-11C5.67 4 5 4.67 5 5.5z"/></svg>
      <!-- bold -->
      <svg @mousedown=${this.onToolbarItemClick} class="icon-button ${classMap(this.activeMarks.bold)}" data-type="mark" data-format="bold"  viewBox="0 0 24 24"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H8c-.55 0-1 .45-1 1v12c0 .55.45 1 1 1h5.78c2.07 0 3.96-1.69 3.97-3.77.01-1.53-.85-2.84-2.15-3.44zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
      <!-- italic -->
      <svg @mousedown=${this.onToolbarItemClick} class="icon-button ${classMap(this.activeMarks.italic)}" data-type="mark" data-format="italic"  viewBox="0 0 24 24"><path d="M10 5.5c0 .83.67 1.5 1.5 1.5h.71l-3.42 8H7.5c-.83 0-1.5.67-1.5 1.5S6.67 18 7.5 18h5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5h-.71l3.42-8h1.29c.83 0 1.5-.67 1.5-1.5S17.33 4 16.5 4h-5c-.83 0-1.5.67-1.5 1.5z"/></svg>
      <!-- highlight -->
      <svg @mousedown=${this.onToolbarItemClick} class="icon-button ${classMap(this.activeMarks.highlight)}" data-type="mark" data-format="highlight" viewBox="0 0 24 24"><path d="M5 18c0 .55.45 1 1 1h12c.55 0 1-.45 1-1s-.45-1-1-1H6c-.55 0-1 .45-1 1zm4.5-5.2h5l.66 1.6c.15.36.5.6.89.6.69 0 1.15-.71.88-1.34l-3.88-8.97C12.87 4.27 12.46 4 12 4c-.46 0-.87.27-1.05.69l-3.88 8.97c-.27.63.2 1.34.89 1.34.39 0 .74-.24.89-.6l.65-1.6zM12 5.98L13.87 11h-3.74L12 5.98z"/></svg>
      <!-- quote -->
      <svg @mousedown=${this.onToolbarItemClick} class="icon-button ${classMap(this.activeMarks.quote)}" data-type="block" data-format="block-quote" viewBox="0 0 24 24"><path d="M7.17 17c.51 0 .98-.29 1.2-.74l1.42-2.84c.14-.28.21-.58.21-.89V8c0-.55-.45-1-1-1H5c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h2l-1.03 2.06c-.45.89.2 1.94 1.2 1.94zm10 0c.51 0 .98-.29 1.2-.74l1.42-2.84c.14-.28.21-.58.21-.89V8c0-.55-.45-1-1-1h-4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h2l-1.03 2.06c-.45.89.2 1.94 1.2 1.94z"/></svg>
      <!-- list -->
      <svg @mousedown=${this.onToolbarItemClick} class="icon-button ${classMap(this.activeMarks.list)}" data-type="block" data-format="bulleted-list" viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM8 19h12c.55 0 1-.45 1-1s-.45-1-1-1H8c-.55 0-1 .45-1 1s.45 1 1 1zm0-6h12c.55 0 1-.45 1-1s-.45-1-1-1H8c-.55 0-1 .45-1 1s.45 1 1 1zM7 6c0 .55.45 1 1 1h12c.55 0 1-.45 1-1s-.45-1-1-1H8c-.55 0-1 .45-1 1z"/></svg>
    </slate-toolbar>`;
  }

  onValueChange(event: CustomEvent) {
    this._value = event.detail;
    this.dispatchEvent(new CustomEvent(event.type, event));
  }

  onToolbarItemClick(event: MouseEvent) {
    event.preventDefault();
    this.slateToolbar.close();
    const currentTarget = event.composedPath().find(item => (item as HTMLElement).dataset && (item as HTMLElement).dataset.type)
    const { format, type } = (currentTarget as HTMLElement).dataset;
    if (type === 'block') {
      this.toggleBlock(this.slateLit.editor, format!);
    } else if (type === 'mark') {
      this.toggleMark(this.slateLit.editor, format!)
    }
  }



  onSelectionChange(event: CustomEvent) {
    if (event.detail && !Range.isCollapsed(event.detail)) {
      this.activeMarks.title.active = this.isBlockActive(this.slateLit.editor, 'heading-two');
      this.activeMarks.bold.active = this.isMarkActive(this.slateLit.editor, 'bold');
      this.activeMarks.italic.active = this.isMarkActive(this.slateLit.editor, 'italic');
      this.activeMarks.highlight.active = this.isMarkActive(this.slateLit.editor, 'highlight');
      this.activeMarks.list.active = this.isBlockActive(this.slateLit.editor, 'bulleted-list');
      this.activeMarks.quote.active = this.isBlockActive(this.slateLit.editor, 'block-quote');
      this.requestUpdate()
    }
  }

  onKeyDown(event: InputEvent) {
    for (const hotkey in HOTKEYS) {
      if (isHotkey(hotkey, event as any)) {
        event.preventDefault()
        const mark = HOTKEYS[hotkey]
        this.toggleMark(this.slateLit.editor, mark)
      }
  }}


  toggleBlock = (editor: Editor, format: string) => {
    const isActive = this.isBlockActive(editor, format);
    console.log('do it', isActive)

    const isList = LIST_TYPES.includes(format);
    Transforms.unwrapNodes(editor, {
      match: (n) => LIST_TYPES.includes(n.type as string),
      split: true,
    });

    Transforms.setNodes(editor, {
      type: isActive ? 'paragraph' : isList ? 'list-item' : format,
    });

    if (!isActive && isList) {
      const block = { type: format, children: [] };
      Transforms.wrapNodes(editor, block);
    }
  };

  toggleMark = (editor: Editor, format: string) => {
    const isActive = this.isMarkActive(editor, format);

    if (isActive) {
      Editor.removeMark(editor, format);
    } else {
      Editor.addMark(editor, format, true);
    }
  };

  isBlockActive = (editor: Editor, format: string) => {
    const [match] = Editor.nodes(editor, {
      match: (n) => n.type === format,
    });

    return !!match;
  };

  isMarkActive = (editor: Editor, format: string) => {
    const marks = Editor.marks(editor);
    return marks ? marks[format] === true : false;
  };

  renderElement = (props: { attributes: RenderElementAttributes; children: any; element: Node }) => {
    const { element, attributes, children } = props;
    switch (element.type) {
      case 'block-quote':
        return html`<blockquote
          id=${attributes.id}
          style=${styleMap(this.blockQuoteStyle)}
          dir=${ifDefined(attributes.dir)}
          ?contenteditable=${attributes.contentEditable}
          ?data-slate-void=${attributes['data-slate-void']}
          data-slate-node=${attributes['data-slate-node']}
          ?data-slate-inline=${attributes['data-slate-inline']}
        >${children}</blockquote>`;
      case 'bulleted-list':
        return html`<ul
          id=${attributes.id}
          dir=${ifDefined(attributes.dir)}
          ?contenteditable=${attributes.contentEditable}
          ?data-slate-void=${attributes['data-slate-void']}
          data-slate-node=${attributes['data-slate-node']}
          ?data-slate-inline=${attributes['data-slate-inline']}
        >${children}</ul>`;
      case 'heading-one':
        return html`<h1
          id=${attributes.id}
          dir=${ifDefined(attributes.dir)}
          ?contenteditable=${attributes.contentEditable}
          ?data-slate-void=${attributes['data-slate-void']}
          data-slate-node=${attributes['data-slate-node']}
          ?data-slate-inline=${attributes['data-slate-inline']}
        >${children}</h1>`;
      case 'heading-two':
        return html`<h2
          id=${attributes.id}
          dir=${ifDefined(attributes.dir)}
          ?contenteditable=${attributes.contentEditable}
          ?data-slate-void=${attributes['data-slate-void']}
          data-slate-node=${attributes['data-slate-node']}
          ?data-slate-inline=${attributes['data-slate-inline']}
        >${children}</h2>`;
      case 'list-item':
        return html`<li
          id=${attributes.id}
          dir=${ifDefined(attributes.dir)}
          ?contenteditable=${attributes.contentEditable}
          ?data-slate-void=${attributes['data-slate-void']}
          data-slate-node=${attributes['data-slate-node']}
          ?data-slate-inline=${attributes['data-slate-inline']}
        >${children}</li>`;
      case 'numbered-list':
        return html`<ol
          id=${attributes.id}
          dir=${ifDefined(attributes.dir)}
          ?contenteditable=${attributes.contentEditable}
          ?data-slate-void=${attributes['data-slate-void']}
          data-slate-node=${attributes['data-slate-node']}
          ?data-slate-inline=${attributes['data-slate-inline']}
        >${children}</ol>`;
      default:
        return html`<p
          id=${attributes.id}
          dir=${ifDefined(attributes.dir)}
          ?contenteditable=${attributes.contentEditable}
          ?data-slate-void=${attributes['data-slate-void']}
          data-slate-node=${attributes['data-slate-node']}
          ?data-slate-inline=${attributes['data-slate-inline']}
        >${children}</p>`;
    }
  };

  renderLeaf = (props: {
    attributes: {
      id: string;
      'data-slate-leaf': true;
    };
    children: any;
    leaf: Node;
  }) => {
    const { leaf, attributes, children } = props;
    let modifiedChildren = children;
    if (leaf.bold) {
      modifiedChildren = html`<strong>${modifiedChildren}</strong>`;
    }

    if (leaf.code) {
      modifiedChildren = html`<code style=${styleMap(this.codeStyle)}>${modifiedChildren}</code>`;
    }

    if (leaf.italic) {
      modifiedChildren = html`<em>${modifiedChildren}</em>`;
    }

    if (leaf.underline) {
      modifiedChildren = html`<u>${modifiedChildren}</u>`;
    }

    if (leaf.highlight) {
      modifiedChildren = html`<span style="color: var(--slate-lit-highlight-color, hsl(0, 70%, 50%))">${modifiedChildren}</span>`;
    }

    return html`<span data-slate-leaf id=${attributes.id}>${modifiedChildren}</span>`;
  };
}
