import { html } from 'lit-html';
import { Ancestor, Path, Text, Node, Editor, Range } from 'slate';
import { RenderLeaf, RenderLeafAttributes, RenderLeafProps } from '../models';
import { LitEditor, LitEditorHelper } from '../plugin/lit-editor';
import { PLACEHOLDER_SYMBOL } from '../utils/weak-maps';

export function textTemplate(props: {
  renderLeaf: RenderLeaf;
  editor: LitEditor;
  decorations: Range[];
  isLast: boolean;
  parent: Ancestor;
  text: Text;
}) {
  const { renderLeaf, decorations, isLast, parent, text, editor } = props;
  const key = LitEditorHelper.getKey(text);
  const leaves = Text.decorations(text, decorations);
  const children = [];

  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    children.push(
      leafTemplate({
        renderLeaf,
        editor,
        isLast: isLast && i === leaves.length - 1,
        key: `${key.id}-${i}`,
        leaf,
        text,
        parent,
      })
    );
  }

  return html`<span data-slate-node="text" id=${key.id}>${children}</span>`;
}

export function leafTemplate(props: {
  renderLeaf: RenderLeaf;
  editor: LitEditor;
  isLast: boolean;
  key: string;
  leaf: Text;
  text: Text;
  parent: Ancestor;
}) {
  const { renderLeaf, key, leaf, isLast, text, parent, editor } = props;
  let children: any;
  if (leaf[PLACEHOLDER_SYMBOL]) {
    children = html`<span
      contentEditable="false"
      class="placeholder">${leaf.placeholder}</span>${stringTemplate({ editor, isLast, leaf, text, parent })}`;
  } else {
    children = stringTemplate({ editor, isLast, leaf, text, parent });
  }
  const attributes: RenderLeafAttributes = {
    id: key,
    'data-slate-leaf': true,
  };
  return renderLeaf({ attributes, children, leaf, text });
}

export function defaultLeaf(props: RenderLeafProps) {
  return html`<span id=${props.attributes.id} ?data-slate-leaf=${props.attributes['data-slate-leaf']}>${props.children}</span>`;
}

export function stringTemplate(props: {
  editor: LitEditor;
  isLast: boolean;
  leaf: Text;
  text: Text;
  parent: Ancestor;
}) {
  const { isLast, leaf, parent, text, editor } = props;
  const path = LitEditorHelper.findPath(text);
  const parentPath = Path.parent(path);

  // COMPAT: Render text inside void nodes with a zero-width space.
  // So the node can contain selection but the text is not visible.
  if (editor.isVoid(parent)) {
    return zeroWidthString({ length: Node.string(parent).length });
  }

  // COMPAT: If this is the last text node in an empty block, render a zero-
  // width space that will convert into a line break when copying and pasting
  // to support expected plain text.
  if (
    leaf.text === '' &&
    parent.children[parent.children.length - 1] === text &&
    !editor.isInline(parent) &&
    Editor.string(editor, parentPath) === ''
  ) {
    return zeroWidthString({ isLineBreak: true });
  }

  // COMPAT: If the text is empty, it's because it's on the edge of an inline
  // node, so we render a zero-width space so that the selection can be
  // inserted next to it still.
  if (leaf.text === '') {
    return zeroWidthString({});
  }

  // COMPAT: Browsers will collapse trailing new lines at the end of blocks,
  // so we need to add an extra trailing new lines to prevent that.
  if (isLast && leaf.text.slice(-1) === '\n') {
    return textString({ isTrailing: true, text: leaf.text });
  }

  return textString({ text: leaf.text });
}

export function zeroWidthString(props: { length?: number; isLineBreak?: boolean }) {
  const { length = 0, isLineBreak = false } = props;
  return html`<span data-slate-zero-width=${isLineBreak ? 'n' : 'z'} data-slate-length=${length}>${isLineBreak ? html`\uFEFF<br />` : html``}</span>`;
}

export function textString(props: { text: string; isTrailing?: boolean }) {
  const { text, isTrailing = false } = props;
  return html`<span data-slate-string>${isTrailing ? text + ' ' : text}</span>`;
}
