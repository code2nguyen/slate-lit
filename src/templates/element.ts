import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined';
import { Ancestor, Descendant, Editor, Element, Node, Range } from 'slate';
import { Decorate, RenderElement, RenderElementAttributes, RenderElementProps, RenderLeaf } from '../models';
import { LitEditor, LitEditorHelper } from '../plugin/lit-editor';
import { NODE_TO_INDEX, NODE_TO_PARENT } from '../utils/weak-maps';
import { textTemplate } from './leaf';
import getDirection from 'direction'

export function childrenTemplate(props: {
  renderElement: RenderElement;
  renderLeaf: RenderLeaf;
  readOnly: boolean;
  editor: LitEditor;
  decorate: Decorate;
  node: Ancestor;
  selection: Range | null;
  decorations: Range[];
}) {
  const { renderLeaf, renderElement, readOnly, decorations, editor, node, selection, decorate } = props;
  const path = LitEditorHelper.findPath(node);
  const children = [];
  const isLeafBlock = Element.isElement(node) && !editor.isInline(node) && Editor.hasInlines(editor, node);

  for (let i = 0; i < node.children.length; i++) {
    const p = path.concat(i);
    const n = node.children[i] as Descendant;
    LitEditorHelper.findKey(n);
    const range = Editor.range(editor, p);
    const sel = selection ? Range.intersection(range, selection) : null;
    const ds = decorate([n, p]);

    NODE_TO_INDEX.set(n, i);
    NODE_TO_PARENT.set(n, node);

    for (const dec of decorations) {
      const d = Range.intersection(dec, range);

      if (d) {
        ds.push(d);
      }
    }

    if (Element.isElement(n)) {
      children.push(
        elementTemplate({
          renderLeaf,
          readOnly,
          decorate,
          renderElement,
          editor,
          decorations: ds,
          element: n,
          selection: sel,
        })
      );
    } else {
      children.push(
        textTemplate({
          renderLeaf,
          editor,
          decorations: ds,
          isLast: isLeafBlock && i === node.children.length - 1,
          parent: node,
          text: n,
        })
      );
    }
  }
  return children;
}

export function elementTemplate(props: {
  renderElement: RenderElement;
  renderLeaf: RenderLeaf;
  editor: LitEditor;
  readOnly: boolean;
  decorate: Decorate;
  decorations: Range[];
  element: Element;
  selection: Range | null;
}) {
  const { renderElement, renderLeaf, decorate, readOnly, decorations, element, selection, editor } = props;
  const isInline = editor.isInline(element);
  let children: any;
  const path = LitEditorHelper.findPath(element);
  const key = LitEditorHelper.findKey(element);

  const attributes: RenderElementAttributes = {
    'data-slate-node': 'element',
    id: key.id,
  };

  if (isInline) {
    attributes['data-slate-inline'] = true;
  }

  // If it's a block node with inline children, add the proper `dir` attribute
  // for text direction.
  if (!isInline && Editor.hasInlines(editor, element)) {
    const text = Node.string(element);
    const dir = getDirection(text);

    if (dir === 'rtl') {
      attributes.dir = dir;
    }
  }

  // If it's a void node, wrap the children in extra void-specific elements.
  if (Editor.isVoid(editor, element)) {
    attributes['data-slate-void'] = true;

    if (!readOnly && isInline) {
      attributes.contentEditable = false;
    }
    const [[text]] = Node.texts(element);
    const Tag = isInline
      ? html`<span data-slate-spacer style="height: 0; color: transparent; outline: none;position: absolute">${textTemplate({ editor, renderLeaf, decorations: [], isLast: false, parent: element, text })}</span>`
      : html`<div data-slate-spacer style="height: 0; color: transparent; outline: none;position: absolute">${textTemplate({ editor, renderLeaf, decorations: [], isLast: false, parent: element, text })}</div>`;

    children = readOnly ? null : Tag;
    const p = path.concat(0);
    LitEditorHelper.findKey(text);
    NODE_TO_INDEX.set(text, 0);
    NODE_TO_PARENT.set(text, element);
  } else {
    children = childrenTemplate({
      editor,
      readOnly,
      renderElement,
      renderLeaf,
      decorate,
      node: element,
      selection,
      decorations,
    });
  }
  return renderElement({ editor, element, attributes, children });
}

export function defaultElement(props: RenderElementProps) {
  const { attributes, children, element, editor } = props;
  const tag = editor.isInline(element)
    ? html`<span data-slate-node="element" dir=${ifDefined(attributes.dir)} data-slate-inline="true" id=${attributes.id} style="position: relative">${children}</span>`
    : html`<div data-slate-node="element" id=${attributes.id} style="position: relative">${children}</div>`;
  return tag;
}
