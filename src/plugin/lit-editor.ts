import { Editor, Node, Path, Point, Range, Transforms, Descendant, Element } from 'slate';

import { Key } from '../utils/key';
import { NODE_TO_INDEX, NODE_TO_KEY, NODE_TO_PARENT } from '../utils/weak-maps';
import {
  DOMElement,
  DOMNode,
  DOMPoint,
  DOMRange,
  DOMSelection,
  DOMStaticRange,
  getPlainText,
  isDOMElement,
  isDOMNode,
  isDOMComment,
  isDOMText,
  normalizeDOMPoint,
} from '../utils/dom';
import { SlateLit } from '../slate-lit.component';

/**
 * A React and DOM-specific version of the `Editor` interface.
 */

export interface LitEditor extends Editor {
  insertData: (data: DataTransfer) => void;
}

export const LitEditorHelper = {
  /**
   * Find a key for a Slate node.
   */

  findKey(node: Node): Key {
    let key = NODE_TO_KEY.get(node);

    if (!key) {
      key = new Key();
      NODE_TO_KEY.set(node, key);
    }

    return key;
  },

  getKey(node: Node): Key {
    let key = NODE_TO_KEY.get(node);

    if (!key) {
      throw new Error(`Unable to find the key for Slate node: ${JSON.stringify(node)}`);
    }

    return key;
  },

  /**
   * Find the path of Slate node.
   */

  findPath(node: Node): Path {
    const path: Path = [];
    let child = node;

    while (true) {
      const parent = NODE_TO_PARENT.get(child);

      if (parent == null) {
        if (Editor.isEditor(child)) {
          return path;
        } else {
          break;
        }
      }

      const i = NODE_TO_INDEX.get(child);

      if (i == null) {
        break;
      }

      path.unshift(i);
      child = parent;
    }

    throw new Error(`Unable to find the path for Slate node: ${JSON.stringify(node)}`);
  },

  findNode(editor: Editor, path: number[]): Node {
    let currentNode: Node = editor;
    for (const p of path) {
      if (currentNode && currentNode.children) {
        currentNode = (currentNode as Element).children[p];
      } else {
          throw new Error(`Unable to find the Node for Slate path: ${JSON.stringify(path)}`);
      }
    }
    return currentNode;
  },
};

export class DomHelper {
  _focus = false;
  _editorEl: HTMLElement | null = null;

  constructor(private root: SlateLit) {}

  get shadowRoot(): ShadowRoot {
    return this.root.shadowRoot!;
  }

  get editor() {
    return this.root.editor;
  }

  get editorEl(): HTMLElement {
    if (!this._editorEl) {
      this._editorEl = this.shadowRoot.getElementById('slate-lit-editor');
      if (!this._editorEl) {
        throw new Error(`Cannot resolve a DOM node from Slate Editor`);
      }
    }
    return this._editorEl;
  }

  isFocused(): boolean {
    return !!this._focus;
  }

  focus(): void {
    this._focus = true;

    if (this.shadowRoot.activeElement !== this.editorEl) {
      this.editorEl.focus({ preventScroll: true });
    }
  }

  isReadOnly(): boolean {
    return this.root.readOnly;
  }

  blur(): void {
    this._focus = false;
    if (this.shadowRoot.activeElement === this.editorEl) {
      this.editorEl.blur();
    }
  }

  deselect(): void {
    const { selection } = this.editor;
    const domSelection = this.shadowRoot.getSelection();

    if (domSelection && domSelection.rangeCount > 0) {
      domSelection.removeAllRanges();
    }
    if (selection) {
      Transforms.deselect(this.editor);
    }
  }

  hasDOMNode(target: DOMNode, options: { editable?: boolean } = {}): boolean {
    const { editable = false } = options;
    let targetEl;

    // COMPAT: In Firefox, reading `target.nodeType` will throw an error if
    // target is originating from an internal "restricted" element (e.g. a
    // stepper arrow on a number input). (2018/05/04)
    // https://github.com/ianstormtaylor/slate/issues/1819
    try {
      targetEl = (isDOMElement(target) ? target : target.parentElement) as HTMLElement;
    } catch (err) {
      if (!err.message.includes('Permission denied to access property "nodeType"')) {
        throw err;
      }
    }

    if (!targetEl) {
      return false;
    }

    return (
      targetEl.closest(`[data-slate-editor]`) === this.editorEl &&
      (!editable || targetEl.isContentEditable || !!targetEl.getAttribute('data-slate-zero-width'))
    );
  }

  hasEditableTarget(target: EventTarget | null): target is DOMNode {
    return isDOMNode(target) && this.hasDOMNode(target, { editable: true });
  }

  isTargetInsideVoid(target: EventTarget | null): boolean {
    const slateNode = this.hasDOMNode(target as DOMNode, {}) && this.toSlateNode(target as DOMNode);
    return Editor.isVoid(this.editor, slateNode);
  }

  insertData(data: DataTransfer): void {
    this.editor.insertData(data);
  }

  setFragmentData = (data: DataTransfer) => {
    const { selection } = this.editor;

    if (!selection) {
      return;
    }

    const [start, end] = Range.edges(selection);
    const startVoid = Editor.void(this.editor, { at: start.path });
    const endVoid = Editor.void(this.editor, { at: end.path });

    if (Range.isCollapsed(selection) && !startVoid) {
      return;
    }

    // Create a fake selection so that we can add a Base64-encoded copy of the
    // fragment to the HTML, to decode on future pastes.
    const domRange = this.toDOMRange(selection);
    let contents = domRange.cloneContents();
    let attach = this.getFirstNode(contents.childNodes) as HTMLElement;

    // Make sure attach is non-empty, since empty nodes will not get copied.
    contents.childNodes.forEach((node) => {
      if (node.textContent && node.textContent.trim() !== '') {
        attach = node as HTMLElement;
      }
    });

    // COMPAT: If the end node is a void node, we need to move the end of the
    // range from the void node's spacer span, to the end of the void node's
    // content, since the spacer is before void's content in the DOM.
    if (endVoid) {
      const [voidNode] = endVoid;
      const r = domRange.cloneRange();
      const domNode = this.toDOMNode(voidNode);
      r.setEndAfter(domNode);
      contents = r.cloneContents();
    }

    // COMPAT: If the start node is a void node, we need to attach the encoded
    // fragment to the void node's content node instead of the spacer, because
    // attaching it to empty `<div>/<span>` nodes will end up having it erased by
    // most browsers. (2018/04/27)
    if (startVoid) {
      attach = contents.querySelector('[data-slate-spacer]')! as HTMLElement;
    }

    // Remove any zero-width space spans from the cloned DOM so that they don't
    // show up elsewhere when pasted.
    Array.from(contents.querySelectorAll('[data-slate-zero-width]')).forEach((zw) => {
      const isNewline = zw.getAttribute('data-slate-zero-width') === 'n';
      zw.textContent = isNewline ? '\n' : '';
    });

    // Set a `data-slate-fragment` attribute on a non-empty node, so it shows up
    // in the HTML, and can be used for intra-Slate pasting. If it's a text
    // node, wrap it in a `<span>` so we have something to set an attribute on.
    if (isDOMText(attach)) {
      const span = document.createElement('span');
      // COMPAT: In Chrome and Safari, if we don't add the `white-space` style
      // then leading and trailing spaces will be ignored. (2017/09/21)
      span.style.whiteSpace = 'pre';
      span.appendChild(attach);
      contents.appendChild(span);
      attach = span;
    }

    const fragment = this.editor.getFragment();
    const string = JSON.stringify(fragment);
    const encoded = window.btoa(encodeURIComponent(string));
    attach.setAttribute('data-slate-fragment', encoded);
    data.setData('application/x-slate-fragment', encoded);

    // Add the content to a <div> so that we can get its inner HTML.
    const div = document.createElement('div');
    div.appendChild(contents);
    div.setAttribute('hidden', 'true');
    document.body.appendChild(div);
    data.setData('text/html', div.innerHTML);
    data.setData('text/plain', getPlainText(div));
    document.body.removeChild(div);
  };

  getElementByKey(key: Key) {
    return this.shadowRoot.getElementById(key.id);;
  }

  getNodeByElement(element: HTMLElement): Node {
    const path: number[]= [];
    let currentElement: DOMElement = element
    while(currentElement !== this.editorEl) {
      const parentNode = (currentElement.parentElement as HTMLElement).closest(`[data-slate-node]`);
      if (parentNode) {
        const children =Array.from(parentNode.childNodes).filter(item => isDOMElement(item) &&  (item as HTMLElement).getAttribute('data-slate-node'))
        path.push(children.indexOf(currentElement));
        currentElement = parentNode;
      }
    }
    return LitEditorHelper.findNode(this.editor, path.reverse());
  }
  /**
   * Find the native DOM element from a Slate node.
   */

  toDOMNode(node: Node): HTMLElement {
    const domNode = Editor.isEditor(node) ? this.editorEl : this.getElementByKey(LitEditorHelper.getKey(node));

    if (!domNode) {
      throw new Error(`Cannot resolve a DOM node from Slate node: ${JSON.stringify(node)}`);
    }

    return domNode;
  }

  /**
   * Find a native DOM selection point from a Slate point.
   */

  getFirstNode(children: NodeList): DOMNode | undefined {
    for (const child of children) {
      if (!isDOMComment(child))
        // comment node
        return child;
    }
    return undefined;
  }

  toDOMPoint(point: Point): DOMPoint {
    const [node] = Editor.node(this.editor, point.path);
    const el = this.toDOMNode(node);
    let domPoint: DOMPoint | undefined;

    // If we're inside a void node, force the offset to 0, otherwise the zero
    // width spacing character will result in an incorrect offset of 1
    if (Editor.void(this.editor, { at: point })) {
      point = { path: point.path, offset: 0 };
    }

    // For each leaf, we need to isolate its content, which means filtering
    // to its direct text and zero-width spans. (We have to filter out any
    // other siblings that may have been rendered alongside them.)
    const selector = `[data-slate-string], [data-slate-zero-width]`;
    const texts = Array.from(el.querySelectorAll(selector));
    let start = 0;

    for (const text of texts) {
      const domNode = this.getFirstNode(text.childNodes) as HTMLElement;

      if (domNode == null || domNode.textContent == null) {
        continue;
      }

      const { length } = domNode.textContent;
      const attr = text.getAttribute('data-slate-length');
      const trueLength = attr == null ? length : parseInt(attr, 10);
      const end = start + trueLength;

      if (point.offset <= end) {
        const offset = Math.min(length, Math.max(0, point.offset - start));
        domPoint = [domNode, offset];
        break;
      }

      start = end;
    }

    if (!domPoint) {
      throw new Error(`Cannot resolve a DOM point from Slate point: ${JSON.stringify(point)}`);
    }

    return domPoint;
  }

  /**
   * Find a native DOM range from a Slate `range`.
   *
   * Notice: the returned range will always be ordinal regardless of the direction of Slate `range` due to DOM API limit.
   *
   * there is no way to create a reverse DOM Range using Range.setStart/setEnd
   * according to https://dom.spec.whatwg.org/#concept-range-bp-set.
   */

  toDOMRange(range: Range): DOMRange {
    const { anchor, focus } = range;
    const isBackward = Range.isBackward(range);
    const domAnchor = this.toDOMPoint(anchor);
    const domFocus = Range.isCollapsed(range) ? domAnchor : this.toDOMPoint(focus);

    const domRange = window.document.createRange();
    const [startNode, startOffset] = isBackward ? domFocus : domAnchor;
    const [endNode, endOffset] = isBackward ? domAnchor : domFocus;

    // A slate Point at zero-width Leaf always has an offset of 0 but a native DOM selection at
    // zero-width node has an offset of 1 so we have to check if we are in a zero-width node and
    // adjust the offset accordingly.
    const startEl = (isDOMElement(startNode) ? startNode : startNode.parentElement) as HTMLElement;
    const isStartAtZeroWidth = !!startEl.getAttribute('data-slate-zero-width');
    const endEl = (isDOMElement(endNode) ? endNode : endNode.parentElement) as HTMLElement;
    const isEndAtZeroWidth = !!endEl.getAttribute('data-slate-zero-width');

    domRange.setStart(startNode, isStartAtZeroWidth ? 1 : startOffset);
    domRange.setEnd(endNode, isEndAtZeroWidth ? 1 : endOffset);
    return domRange;
  }

  /**
   * Find a Slate node from a native DOM `element`.
   */

  toSlateNode(domNode: DOMNode): Node {
    let domEl = isDOMElement(domNode) ? domNode : domNode.parentElement;

    if (domEl && !domEl.hasAttribute('data-slate-node')) {
      domEl = domEl.closest(`[data-slate-node]`);
    }

    const node = domEl ? this.getNodeByElement(domEl as HTMLElement) : null;

    if (!node) {
      throw new Error(`Cannot resolve a Slate node from DOM node: ${domEl}`)
    }

    return node;
  }

  /**
   * Find a Slate point from a DOM selection's `domNode` and `domOffset`.
   */

  toSlatePoint(domPoint: DOMPoint): Point {
    const [nearestNode, nearestOffset] = normalizeDOMPoint(domPoint);
    const parentNode = nearestNode.parentNode as DOMElement;
    let textNode: DOMElement | null = null;
    let offset = 0;

    if (parentNode) {
      const voidNode = parentNode.closest('[data-slate-void="true"]');
      let leafNode = parentNode.closest('[data-slate-leaf]');
      let domNode: DOMElement | null = null;

      // Calculate how far into the text node the `nearestNode` is, so that we
      // can determine what the offset relative to the text node is.
      if (leafNode) {
        textNode = leafNode.closest('[data-slate-node="text"]')!;
        const range = window.document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(nearestNode, nearestOffset);
        const contents = range.cloneContents();
        const removals = [
          ...contents.querySelectorAll('[data-slate-zero-width]'),
          ...contents.querySelectorAll('[contenteditable=false]'),
        ];

        removals.forEach((el) => {
          el!.parentNode!.removeChild(el);
        });

        // COMPAT: Edge has a bug where Range.prototype.toString() will
        // convert \n into \r\n. The bug causes a loop when slate-react
        // attempts to reposition its cursor to match the native position. Use
        // textContent.length instead.
        // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/10291116/
        offset = contents.textContent!.length;
        domNode = textNode;
      } else if (voidNode) {
        // For void nodes, the element with the offset key will be a cousin, not an
        // ancestor, so find it by going down from the nearest void parent.

        leafNode = voidNode.querySelector('[data-slate-leaf]')!;
        textNode = leafNode.closest('[data-slate-node="text"]')!;
        domNode = leafNode;
        offset = domNode.textContent!.length;
      }

      // COMPAT: If the parent node is a Slate zero-width space, editor is
      // because the text node should have no characters. However, during IME
      // composition the ASCII characters will be prepended to the zero-width
      // space, so subtract 1 from the offset to account for the zero-width
      // space character.
      if (domNode && offset === domNode.textContent!.length && parentNode.hasAttribute('data-slate-zero-width')) {
        offset--;
      }
    }

    if (!textNode) {
      throw new Error(`Cannot resolve a Slate point from DOM point: ${domPoint}`);
    }

    // COMPAT: If someone is clicking from one Slate editor into another,
    // the select event fires twice, once for the old editor's `element`
    // first, and then afterwards for the correct `element`. (2017/03/03)
    const slateNode = this.toSlateNode(textNode!);
    const path = slateNode ? LitEditorHelper.findPath(slateNode) : [];
    return { path, offset };
  }

  isCollapsed(sel: Selection): boolean {
    // Selection.isCollapsed is broken in Chrome 52.
    return sel.focusNode === sel.anchorNode && sel.focusOffset === sel.anchorOffset;
  }

  /**
   * Find a Slate range from a DOM range or selection.
   */

  toSlateRange(domRange: DOMRange | DOMStaticRange | DOMSelection): Range {
    const el = domRange instanceof Selection ? domRange.anchorNode : domRange.startContainer;
    let anchorNode;
    let anchorOffset;
    let focusNode;
    let focusOffset;
    let isCollapsed;

    if (el) {
      if (domRange instanceof Selection) {
        anchorNode = domRange.anchorNode;
        anchorOffset = domRange.anchorOffset;
        focusNode = domRange.focusNode;
        focusOffset = domRange.focusOffset;
        isCollapsed = this.isCollapsed(domRange);
      } else {
        anchorNode = domRange.startContainer;
        anchorOffset = domRange.startOffset;
        focusNode = domRange.endContainer;
        focusOffset = domRange.endOffset;
        isCollapsed = domRange.collapsed;
      }
    }

    if (anchorNode == null || focusNode == null || anchorOffset == null || focusOffset == null) {
      throw new Error(`Cannot resolve a Slate range from DOM range: ${domRange}`);
    }

    const anchor = this.toSlatePoint([anchorNode, anchorOffset]);
    const focus = isCollapsed ? anchor : this.toSlatePoint([focusNode, focusOffset]);

    return { anchor, focus };
  }

  /**
   * Get the target range from a DOM `event`.
   */

  findEventRange(event: any): Range {
    const { clientX: x, clientY: y, target } = event;

    if (x == null || y == null) {
      throw new Error(`Cannot resolve a Slate range from a DOM event: ${event}`);
    }

    const node = this.toSlateNode(event.target);
    const path = node ? LitEditorHelper.findPath(node) : [];

    // If the drop target is inside a void node, move it into either the
    // next or previous node, depending on which side the `x` and `y`
    // coordinates are closest to.
    if (Editor.isVoid(this.editor, node)) {
      const rect = target.getBoundingClientRect();
      const isPrev = this.editor.isInline(node)
        ? x - rect.left < rect.left + rect.width - x
        : y - rect.top < rect.top + rect.height - y;

      const edge = Editor.point(this.editor, path, {
        edge: isPrev ? 'start' : 'end',
      });
      const point = isPrev ? Editor.before(this.editor, edge) : Editor.after(this.editor, edge);

      if (point) {
        const range = Editor.range(this.editor, point);
        return range;
      }
    }

    // Else resolve a range from the caret position where the drop occured.
    let domRange;
    const { document } = window;

    if (!!this.shadowRoot.caretPositionFromPoint) {
      const position = this.shadowRoot.caretPositionFromPoint(x, y);
      if (position) {
        domRange = document.createRange();
        domRange.setStart(position.offsetNode, position.offset);
        domRange.setEnd(position.offsetNode, position.offset);
      }
    } else {
      // TODO
      domRange = document.createRange();
      domRange.setStart(target, 0);
      domRange.setEnd(target, 0);
    }

    if (!domRange) {
      throw new Error(`Cannot resolve a Slate range from a DOM event: ${event}`);
    }

    // Resolve a Slate range from the DOM range.
    const range = this.toSlateRange(domRange);
    return range;
  }
}
