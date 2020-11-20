import { html, css, LitElement, property, customElement, query } from 'lit-element';
import throttle from 'lodash-es/throttle';

import { withLit } from './plugin/with-lit';
import { createEditor, Editor, Node, Transforms, Range, Point, Element, Path } from 'slate';
import { withHistory } from 'slate-history';
import { DOMNode, DOMStaticRange, isDOMElement, isDOMNode, isPlainTextOnlyPaste } from './utils/dom';
import { DomHelper, LitEditor, LitEditorHelper } from './plugin/lit-editor';
import { Decorate, RenderElement, RenderLeaf } from './models';
import { defaultElement } from './templates/element';
import { defaultLeaf } from './templates/leaf';
import { PLACEHOLDER_SYMBOL } from './utils/weak-maps';
import { childrenTemplate } from './templates/element';
import { IS_CHROME_LEGACY, IS_EDGE_LEGACY, IS_FIREFOX, IS_SAFARI } from './utils/environment';
import { Hotkeys } from './utils/hotkeys';

const HAS_BEFORE_INPUT_SUPPORT = !(
  IS_FIREFOX ||
  IS_EDGE_LEGACY ||
  IS_CHROME_LEGACY
)
@customElement('slate-lit')
export class SlateLit extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .slate-editor {
      color: var(--slate-lit-text-color, #000);
      padding-right: 8px;
      outline: none;
      white-space: 'pre-wrap';
      word-wrap: 'break-word';
    }

    .placeholder {
      pointer-events: none;
      display: inline-block;
      width: 0;
      max-width: 100%;
      white-space: nowrap;
      opacity: 0.333;
      user-select: none;
      font-family: inherit;
      font-style: inherit;
      font-weight: inherit;
      text-decoration: none
    }

    span {
      outline: none;
      white-space: pre-wrap;
      overflow-wrap: break-word;
    }
  `;

  private readonly emptyValue = [{ children: [{ text: '' }]}];

  private _value: Node[] = this.emptyValue;

  @property({type: String}) autoCorrect: 'on' | 'off' = 'off';

  @property({ type: Array })
  public get value(): Node[] {
    return this._value;
  }
  public set value(value: Node[]) {
    if (value === this._value) return;
    if (!value || value.length === 0) value = this.emptyValue
    this._value = value;
    this.editor.children = value;
    this.initDecorations();
    this.requestUpdate()
  }

  private _placeholder = '';
  @property({ type: String })
  public get placeholder() {
    return this._placeholder;
  }
  public set placeholder(value) {
    this._placeholder = value;
    this.initDecorations();
  }

  private _readOnly = false;
  @property({ type: Boolean })
  public get readOnly() {
    return this._readOnly;
  }
  public set readOnly(value) {
    this._readOnly = value;
  }

  private _renderElement: RenderElement = defaultElement;

  @property({ attribute: false })
  public get renderElement(): RenderElement {
    return this._renderElement;
  }
  public set renderElement(value: RenderElement) {
    this._renderElement = value;
  }

  private _renderLeaf: RenderLeaf = defaultLeaf;

  @property({ attribute: false })
  public get renderLeaf(): RenderLeaf {
    return this._renderLeaf;
  }
  public set renderLeaf(value: RenderLeaf) {
    this._renderLeaf = value;
  }

  private _editor: LitEditor = withHistory(withLit(createEditor()));

  @property({ attribute: false })
  public get editor(): LitEditor {
    return this._editor;
  }
  public set editor(value: LitEditor) {
    this._editor = value;
  }

  @property({type: String}) autoCapitalize: 'none' | 'on' | 'words' | 'characters' = 'none';

  domHelper: DomHelper = new DomHelper(this);
  decorations: Range[] = [];
  decorate: Decorate = () => [];
  state: {
    isComposing: boolean;
    isUpdatingSelection: boolean;
    latestElement: any;
  } = {
    isComposing: false,
    isUpdatingSelection: false,
    latestElement: null,
  };
  oldSelection: Range | null = null;

  constructor() {
    super();
    this._editor.children = this.emptyValue;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(
      'selectionchange',
      throttle(() => {
        this.onDOMSelectionChange();
      }, 100)
    );
  }

  async firstUpdated() {
    await new Promise((r) => setTimeout(r, 0));

    document.addEventListener(
      'selectionchange',
      throttle(() => {
        this.onDOMSelectionChange();
      }, 100)
    );
    this.editor.onChange = () => {
      this.onContextChange(this.editor.children);
    }
  }

  onContextChange(value: Node[]) {
    if (value != this.value) {
      this.value = value;
      this.dispatchEvent(new CustomEvent('valueChange', {
        bubbles: true,
        composed: true,
        detail: value
      }))
    } else if (this.oldSelection != this.editor.selection) {
        this.oldSelection = this.editor.selection;
        this.updateSelection();
        this.dispatchEvent(new CustomEvent('selectionChange', {
          bubbles: true,
          composed: true,
          detail: this.editor.selection
        }))
    }
  }

  onBeforeInput(
    event: Event & {
      data: string | null;
      dataTransfer: DataTransfer | null;
      getTargetRanges(): DOMStaticRange[];
      inputType: string;
      isComposing: boolean;
    }
  ) {
    if (this.readOnly) return;
    const editor = this.editor;
    const { selection } = editor;
    const { inputType: type } = event;
    const data = event.dataTransfer || event.data || undefined;

    // These two types occur while a user is composing text and can't be
    // cancelled. Let them through and wait for the composition to end.
    if (type === 'insertCompositionText' || type === 'deleteCompositionText') {
      return;
    }

    event.preventDefault();

    // COMPAT: For the deleting forward/backward input types we don't want
    // to change the selection because it is the range that will be deleted,
    // and those commands determine that for themselves.
    if (!type.startsWith('delete') || type.startsWith('deleteBy')) {
      const [targetRange] = event.getTargetRanges();

      if (targetRange) {
        const range = this.domHelper.toSlateRange(targetRange);

        if (!selection || !Range.equals(selection, range)) {
          Transforms.select(editor, range);
        }
      }
    }

    // COMPAT: If the selection is expanded, even if the command seems like
    // a delete forward/backward command it should delete the selection.
    if (selection && Range.isExpanded(selection) && type.startsWith('delete')) {
      Editor.deleteFragment(editor);
      return;
    }

    switch (type) {
      case 'deleteByComposition':
      case 'deleteByCut':
      case 'deleteByDrag': {
        Editor.deleteFragment(editor);
        break;
      }

      case 'deleteContent':
      case 'deleteContentForward': {
        Editor.deleteForward(editor);
        break;
      }

      case 'deleteContentBackward': {
        Editor.deleteBackward(editor);
        break;
      }

      case 'deleteEntireSoftLine': {
        Editor.deleteBackward(editor, { unit: 'line' });
        Editor.deleteForward(editor, { unit: 'line' });
        break;
      }

      case 'deleteHardLineBackward': {
        Editor.deleteBackward(editor, { unit: 'block' });
        break;
      }

      case 'deleteSoftLineBackward': {
        Editor.deleteBackward(editor, { unit: 'line' });
        break;
      }

      case 'deleteHardLineForward': {
        Editor.deleteForward(editor, { unit: 'block' });
        break;
      }

      case 'deleteSoftLineForward': {
        Editor.deleteForward(editor, { unit: 'line' });
        break;
      }

      case 'deleteWordBackward': {
        Editor.deleteBackward(editor, { unit: 'word' });
        break;
      }

      case 'deleteWordForward': {
        Editor.deleteForward(editor, { unit: 'word' });
        break;
      }

      case 'insertLineBreak':
      case 'insertParagraph': {
        Editor.insertBreak(editor);
        break;
      }

      case 'insertFromComposition':
      case 'insertFromDrop':
      case 'insertFromPaste':
      case 'insertFromYank':
      case 'insertReplacementText':
      case 'insertText': {
        if (data instanceof DataTransfer) {
          this.domHelper.insertData(data);
        } else if (typeof data === 'string') {
          Editor.insertText(editor, data);
        }
        break;
      }
    }
  }

  onDOMSelectionChange() {
    if (!this.readOnly && !this.state.isComposing && !this.state.isUpdatingSelection) {
      const { activeElement } = this.shadowRoot!;
      const el = this.domHelper.editorEl;
      const domSelection = this.shadowRoot!.getSelection();

      if (activeElement === el) {
        this.state.latestElement = activeElement;
        this.domHelper.focus();
      } else {
        this.domHelper.blur();
        this.domHelper.deselect();
        return;
      }

      if (!domSelection) {
        return Transforms.deselect(this.editor);
      }

      const { anchorNode, focusNode } = domSelection;

      const anchorNodeSelectable =
        this.domHelper.hasEditableTarget(anchorNode) || this.domHelper.isTargetInsideVoid(anchorNode);
      const focusNodeSelectable =
        this.domHelper.hasEditableTarget(focusNode) || this.domHelper.isTargetInsideVoid(focusNode);

      if (anchorNodeSelectable && focusNodeSelectable) {
        const range = this.domHelper.toSlateRange(domSelection);
        Transforms.select(this.editor, range);
      } else {
        Transforms.deselect(this.editor);
      }
    }
  }

  render() {
    return html`
      <div
        data-gramm="false"
        data-slate-editor
        data-slate-node="editor"
        class="slate-editor"
        id="slate-lit-editor"
        spellcheck=${this.spellcheck}
        autocorrect=${
          !HAS_BEFORE_INPUT_SUPPORT ? 'off' : this.autoCorrect
        }
        autocapitalize=${
          !HAS_BEFORE_INPUT_SUPPORT ? 'none' : this.autoCapitalize
        }
        ?contenteditable=${!this.readOnly}
        @beforeinput=${this.onBeforeInput}
        @focus=${this.onFocus}
        @blur=${this.onBlur}
        @click=${this.onClick}
        @compositionend=${this.onCompositionEnd}
        @compositionstart=${this.onCompositionStart}
        @copy=${this.onCopy}
        @cut=${this.onCut}
        @dragover=${this.onDragOver}
        @dragstart=${this.onDragStart}
        @drop=${this.onDrop}
        @keydown=${this.onKeyDown}
        @paste=${this.onPaste}
      >${childrenTemplate({
          editor: this.editor,
          readOnly: this.readOnly,
          decorate: this.decorate,
          renderElement: this.renderElement,
          renderLeaf: this.renderLeaf,
          node: this.editor,
          selection: this.editor.selection,
          decorations: this.decorations,
        })}</div>
    `;
  }

  onCompositionEnd(event: CompositionEvent){
    if (
      this.domHelper.hasEditableTarget(event.target)
    ) {
      this.state.isComposing = false

      // COMPAT: In Chrome, `beforeinput` events for compositions
      // aren't correct and never fire the "insertFromComposition"
      // type that we need. So instead, insert whenever a composition
      // ends since it will already have been committed to the DOM.
      if (!IS_SAFARI && !IS_FIREFOX && event.data) {
        Editor.insertText(this.editor, event.data)
      }
    }
  }

  onCompositionStart(event: CompositionEvent) {
    if (
      this.domHelper.hasEditableTarget(event.target)
    ) {
      this.state.isComposing = true
    }
  }

  initDecorations() {
    this.decorations = this.decorate([this.editor, []]);
    if (
      this._placeholder &&
      this.editor.children.length === 1 &&
      Array.from(Node.texts(this.editor)).length === 1 &&
      Node.string(this.editor) === ''
    ) {
      const start = Editor.start(this.editor, []);
      this.decorations.push({
        [PLACEHOLDER_SYMBOL]: true,
        placeholder: this._placeholder,
        anchor: start,
        focus: start,
      });
    }
  }

  // Whenever the editor updates, make sure the DOM selection state is in sync.
  updated() {
    this.updateSelection();
  }

  updateSelection() {
    const { selection } = this.editor;
    const domSelection = this.shadowRoot!.getSelection();

    if (this.state.isComposing || !domSelection || !this.domHelper.isFocused()) {
      return;
    }

    const hasDomSelection = domSelection.type !== 'None';

    // If the DOM selection is properly unset, we're done.
    if (!selection && !hasDomSelection) {
      return;
    }

    // verify that the dom selection is in the editor
    const editorElement = this.domHelper.editorEl;
    let hasDomSelectionInEditor = false;
    if (editorElement.contains(domSelection.anchorNode) && editorElement.contains(domSelection.focusNode)) {
      hasDomSelectionInEditor = true;
    }

    // If the DOM selection is in the editor and the editor selection is already correct, we're done.
    if (
      hasDomSelection &&
      hasDomSelectionInEditor &&
      selection &&
      Range.equals(this.domHelper.toSlateRange(domSelection), selection)
    ) {
      return;
    }

    // Otherwise the DOM selection is out of sync, so update it.
    const el = this.domHelper.editorEl;
    this.state.isUpdatingSelection = true;

    const newDomRange = selection && this.domHelper.toDOMRange(selection);

    if (newDomRange) {
      if (Range.isBackward(selection!)) {
        domSelection.setBaseAndExtent(
          newDomRange.endContainer,
          newDomRange.endOffset,
          newDomRange.startContainer,
          newDomRange.startOffset
        );
      } else {
        domSelection.setBaseAndExtent(
          newDomRange.startContainer,
          newDomRange.startOffset,
          newDomRange.endContainer,
          newDomRange.endOffset
        );
      }
      const leafEl = newDomRange.startContainer.parentElement!;
      leafEl.scrollIntoView({behavior: "smooth", block: "nearest", inline: "nearest"})
    } else {
      domSelection.removeAllRanges();
    }

    setTimeout(() => {
      // COMPAT: In Firefox, it's not enough to create a range, you also need
      // to focus the contenteditable element too. (2016/11/16)
      if (newDomRange && IS_FIREFOX) {
        el.focus();
      }

      this.state.isUpdatingSelection = false;
    });
  }

  onFocus(event: FocusEvent) {
    if (!this.readOnly && !this.state.isUpdatingSelection && this.domHelper.hasEditableTarget(event.target)) {
      const el = this.domHelper.editorEl;
      this.state.latestElement = this.shadowRoot!.activeElement;

      // COMPAT: If the editor has nested editable elements, the focus
      // can go to them. In Firefox, this must be prevented because it
      // results in issues with keyboard navigation. (2017/03/30)
      if (IS_FIREFOX && event.target !== el) {
        el.focus();
        return;
      }

      this.domHelper.focus();
      this.bubbleEvent(event)
    }
  }

  onBlur(event: FocusEvent) {
    if (this.readOnly || this.state.isUpdatingSelection || !this.domHelper.hasEditableTarget(event.target)) {
      return;
    }

    // COMPAT: If the current `activeElement` is still the previous
    // one, this is due to the window being blurred when the tab
    // itself becomes unfocused, so we want to abort early to allow to
    // editor to stay focused when the tab becomes focused again.
    if (this.state.latestElement === this.shadowRoot!.activeElement) {
      return;
    }

    const { relatedTarget } = event;
    const el = this.domHelper.editorEl;

    // COMPAT: The event should be ignored if the focus is returning
    // to the editor from an embedded editable element (eg. an <input>
    // element inside a void node).
    if (relatedTarget === el) {
      return;
    }

    // COMPAT: The event should be ignored if the focus is moving from
    // the editor to inside a void node's spacer element.
    if (isDOMElement(relatedTarget) && relatedTarget.hasAttribute('data-slate-spacer')) {
      return;
    }

    // COMPAT: The event should be ignored if the focus is moving to a
    // non- editable section of an element that isn't a void node (eg.
    // a list item of the check list example).
    if (relatedTarget != null && isDOMNode(relatedTarget) && this.domHelper.hasDOMNode(relatedTarget)) {
      const node = this.domHelper.toSlateNode(relatedTarget);

      if (Element.isElement(node) && !this.editor.isVoid(node)) {
        return;
      }
    }

    this.domHelper.blur();
    this.bubbleEvent(event);
  }

  onClick(event: Event){
    if (
      !this.readOnly &&
      this.domHelper.hasDOMNode(event.target as DOMNode) &&
      isDOMNode(event.target)
    ) {
      const node = this.domHelper.toSlateNode(event.target)
      const path = LitEditorHelper.findPath(node!)
      const start = Editor.start(this.editor, path)
      const end = Editor.end(this.editor, path)

      const startVoid = Editor.void(this.editor, { at: start })
      const endVoid = Editor.void(this.editor, { at: end })

      if (
        startVoid &&
        endVoid &&
        Path.equals(startVoid[1], endVoid[1])
      ) {
        const range = Editor.range(this.editor, start)
        Transforms.select(this.editor, range)
      }
      return;
    }
    this.bubbleEvent(event);
  }

  onCopy(event: ClipboardEvent) {
    if (this.domHelper.hasEditableTarget(event.target) && event.clipboardData) {
      event.preventDefault()
      this.domHelper.setFragmentData(event.clipboardData)
      return;
    }
    this.bubbleEvent(event);
  }

  onCut(event: ClipboardEvent) {
    if (
      !this.readOnly &&
      this.domHelper.hasEditableTarget(event.target) && event.clipboardData
    ) {
      event.preventDefault()
      this.domHelper.setFragmentData(event.clipboardData)
      const { selection } = this.editor

      if (selection && Range.isExpanded(selection)) {
        Editor.deleteFragment(this.editor);
      }
      return;
    }
    this.bubbleEvent(event)
  }

  onDragOver(event: DragEvent){
    if (
      this.domHelper.hasDOMNode(event.target as DOMNode)
    ) {
      // Only when the target is void, call `preventDefault` to signal
      // that drops are allowed. Editable content is droppable by
      // default, and calling `preventDefault` hides the cursor.
      const node = this.domHelper.toSlateNode(event.target as DOMNode)

      if (Editor.isVoid(this.editor, node)) {
        event.preventDefault()
        return;
      }
    }
    this.bubbleEvent(event);
  }

  onDragStart(event: DragEvent){
    if (
      this.domHelper.hasDOMNode(event.target as DOMNode)
      && event.dataTransfer
    ) {
      const node = this.domHelper.toSlateNode(event.target as DOMNode)
      const path = LitEditorHelper.findPath(node)
      const voidMatch = Editor.void(this.editor, { at: path })

      // If starting a drag on a void node, make sure it is selected
      // so that it shows up in the selection's fragment.
      if (voidMatch) {
        const range = Editor.range(this.editor, path)
        Transforms.select(this.editor, range)
      }

      this.domHelper.setFragmentData(event.dataTransfer)
      return;
    }
    this.bubbleEvent(event);
  }

  onDrop(event: DragEvent){
    if (
      this.domHelper.hasDOMNode(event.target as DOMNode) &&
      !this.readOnly && event.dataTransfer
    ) {
      // COMPAT: Certain browsers don't fire `beforeinput` events at all, and
      // Chromium browsers don't properly fire them for files being
      // dropped into a `contenteditable`. (2019/11/26)
      // https://bugs.chromium.org/p/chromium/issues/detail?id=1028668
      if (
        !HAS_BEFORE_INPUT_SUPPORT ||
        (!IS_SAFARI || IS_CHROME_LEGACY && event.dataTransfer.files.length > 0)
      ) {

        // some error on shadown DOM here, so disable it for this moment.
        event.preventDefault()


        const range = this.domHelper.findEventRange(event)
        const data = event.dataTransfer
        Transforms.select(this.editor, range)
        this.domHelper.insertData(data);
        return;
      }

      this.bubbleEvent(event);
    }
  }

  onKeyDown(event: KeyboardEvent) {
    if (
      !this.readOnly &&
      this.domHelper.hasEditableTarget(event.target)
    ) {
      const editor = this.editor
      const { selection } = editor;

      // COMPAT: Since we prevent the default behavior on
      // `beforeinput` events, the browser doesn't think there's ever
      // any history stack to undo or redo, so we have to manage these
      // hotkeys ourselves. (2019/11/06)
      if (Hotkeys.isRedo(event)) {
        event.preventDefault()

        if (typeof this.editor.redo === 'function') {
          this.editor.redo()
        }
        return
      }

      if (Hotkeys.isUndo(event)) {
        event.preventDefault()

        if (typeof editor.undo === 'function') {
          editor.undo();
        }
        return
      }

      // COMPAT: Certain browsers don't handle the selection updates
      // properly. In Chrome, the selection isn't properly extended.
      // And in Firefox, the selection isn't properly collapsed.
      // (2017/10/17)
      if (Hotkeys.isMoveLineBackward(event)) {
        event.preventDefault()
        Transforms.move(editor, { unit: 'line', reverse: true })
        return
      }

      if (Hotkeys.isMoveLineForward(event)) {
        event.preventDefault()
        Transforms.move(editor, { unit: 'line' })
        return
      }

      if (Hotkeys.isExtendLineBackward(event)) {
        event.preventDefault()
        Transforms.move(editor, {
          unit: 'line',
          edge: 'focus',
          reverse: true,
        })
        return
      }

      if (Hotkeys.isExtendLineForward(event)) {
        event.preventDefault()
        Transforms.move(editor, { unit: 'line', edge: 'focus' })
        return
      }

      // COMPAT: If a void node is selected, or a zero-width text node
      // adjacent to an inline is selected, we need to handle these
      // hotkeys manually because browsers won't be able to skip over
      // the void node with the zero-width space not being an empty
      // string.
      if (Hotkeys.isMoveBackward(event)) {
        event.preventDefault()

        if (selection && Range.isCollapsed(selection)) {
          Transforms.move(editor, { reverse: true })
        } else {
          Transforms.collapse(editor, { edge: 'start' })
        }
        return
      }

      if (Hotkeys.isMoveForward(event)) {
        event.preventDefault()

        if (selection && Range.isCollapsed(selection)) {
          Transforms.move(editor)
        } else {
          Transforms.collapse(editor, { edge: 'end' })
        }
        return
      }

      if (Hotkeys.isMoveWordBackward(event)) {
        event.preventDefault()
        Transforms.move(editor, { unit: 'word', reverse: true })
        return
      }

      if (Hotkeys.isMoveWordForward(event)) {
        event.preventDefault()
        Transforms.move(editor, { unit: 'word' })
        return
      }

      // COMPAT: Certain browsers don't support the `beforeinput` event, so we
      // fall back to guessing at the input intention for hotkeys.
      // COMPAT: In iOS, some of these hotkeys are handled in the
      if (!HAS_BEFORE_INPUT_SUPPORT) {
        // We don't have a core behavior for these, but they change the
        // DOM if we don't prevent them, so we have to.
        if (
          Hotkeys.isBold(event) ||
          Hotkeys.isItalic(event) ||
          Hotkeys.isTransposeCharacter(event)
        ) {
          event.preventDefault()
          return
        }

        if (Hotkeys.isSplitBlock(event)) {
          event.preventDefault()
          Editor.insertBreak(editor)
          return
        }

        if (Hotkeys.isDeleteBackward(event)) {
          event.preventDefault()

          if (selection && Range.isExpanded(selection)) {
            Editor.deleteFragment(editor)
          } else {
            Editor.deleteBackward(editor)
          }

          return
        }

        if (Hotkeys.isDeleteForward(event)) {
          event.preventDefault()

          if (selection && Range.isExpanded(selection)) {
            Editor.deleteFragment(editor)
          } else {
            Editor.deleteForward(editor)
          }

          return
        }

        if (Hotkeys.isDeleteLineBackward(event)) {
          event.preventDefault()

          if (selection && Range.isExpanded(selection)) {
            Editor.deleteFragment(editor)
          } else {
            Editor.deleteBackward(editor, { unit: 'line' })
          }

          return
        }

        if (Hotkeys.isDeleteLineForward(event)) {
          event.preventDefault()

          if (selection && Range.isExpanded(selection)) {
            Editor.deleteFragment(editor)
          } else {
            Editor.deleteForward(editor, { unit: 'line' })
          }

          return
        }

        if (Hotkeys.isDeleteWordBackward(event)) {
          event.preventDefault()

          if (selection && Range.isExpanded(selection)) {
            Editor.deleteFragment(editor)
          } else {
            Editor.deleteBackward(editor, { unit: 'word' })
          }

          return
        }

        if (Hotkeys.isDeleteWordForward(event)) {
          event.preventDefault()

          if (selection && Range.isExpanded(selection)) {
            Editor.deleteFragment(editor)
          } else {
            Editor.deleteForward(editor, { unit: 'word' })
          }

          return
        }
      }

      this.bubbleEvent(event);
    }
  }

  private bubbleEvent(event: Event) {
    this.dispatchEvent(new CustomEvent(event.type, event));
  }

  onPaste(event: ClipboardEvent) {
    // COMPAT: Certain browsers don't support the `beforeinput` event, so we
    // fall back to React's `onPaste` here instead.
    // COMPAT: Firefox, Chrome and Safari are not emitting `beforeinput` events
    // when "paste without formatting" option is used.
    // This unfortunately needs to be handled with paste events instead.
    if (
      this.domHelper.hasEditableTarget(event.target) &&
      (!HAS_BEFORE_INPUT_SUPPORT ||
        isPlainTextOnlyPaste(event))&&
      !this.readOnly &&
      event.clipboardData
    ) {
      event.preventDefault()
      this.domHelper.insertData(event.clipboardData)
      return;
    }

    this.bubbleEvent(event);
  }
}
