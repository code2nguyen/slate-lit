import { isHotkey } from 'is-hotkey';
import { LitElement, customElement, html, query, property, css } from 'lit-element';
import { Editor, Node, Transforms } from 'slate';
import { RenderElementAttributes } from './models';
import { SlateLit } from './slate-lit.component';
import { ifDefined } from 'lit-html/directives/if-defined';
import { styleMap } from 'lit-html/directives/style-map.js';

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
      display: block;
      position: relative;
    }
  `

  codeStyle = {
    fontFamily: 'monospace',
    backgroundColor: '#eee',
    padding: '3px'
  }

  blockQuoteStyle = {
    borderLeft: '2px solid #ddd',
    marginLeft: '0',
    marginRight: '0',
    paddingLeft: '10px',
    color: '#aaa',
    fontStyle: 'italic',
  }


  @query('.slate-lit') slateLit!: SlateLit;

  private _value: Node[] = [];
  @property({ type: Array })
  public get value(): Node[] {
    return this._value;
  }
  public set value(value: Node[]) {
    this._value = value;
    this.requestUpdate();
  }

  render() {
    return html`<slate-lit
      class="slate-lit"
      .renderLeaf=${this.renderLeaf}
      .renderElement=${this.renderElement}
      .value=${this.value}
      @keydown=${this.onKeyDown}
    ></slate-lit>`;
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

    return html`<span data-slate-leaf id=${attributes.id}>${modifiedChildren}</span>`;
  };
}
