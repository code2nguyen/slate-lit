import { Editor, Node, Path, Operation, Transforms, Range } from 'slate';

import { LitEditor, LitEditorHelper } from './lit-editor';
import { Key } from '../utils/key';
import { NODE_TO_KEY } from '../utils/weak-maps';
import { isDOMText, getPlainText } from '../utils/dom';

/**
 * `withReact` adds React and DOM specific behaviors to the editor.
 */

export const withLit = <T extends Editor>(editor: T) => {
  const e = editor as T & LitEditor;
  const { apply, onChange } = e;

  e.apply = (op: Operation) => {
    const matches: [Path, Key][] = [];

    switch (op.type) {
      case 'insert_text':
      case 'remove_text':
      case 'set_node': {
        for (const [node, path] of Editor.levels(e, { at: op.path })) {
          const key = LitEditorHelper.findKey(node);
          matches.push([path, key]);
        }
        break;
      }

      case 'insert_node':
      case 'remove_node':
      case 'merge_node':
      case 'split_node': {
        for (const [node, path] of Editor.levels(e, {
          at: Path.parent(op.path),
        })) {
          const key = LitEditorHelper.findKey(node);
          matches.push([path, key]);
        }
        break;
      }

      case 'move_node': {
        // TODO
        break;
      }
    }

    apply(op);

    for (const [path, key] of matches) {
      const [node] = Editor.node(e, path);
      NODE_TO_KEY.set(node, key);
    }
  };

  e.insertData = (data: DataTransfer) => {
    const fragment = data.getData('application/x-slate-fragment');

    if (fragment) {
      const decoded = decodeURIComponent(window.atob(fragment));
      const parsed = JSON.parse(decoded) as Node[];
      e.insertFragment(parsed);
      return;
    }

    const text = data.getData('text/plain');

    if (text) {
      const lines = text.split(/\r\n|\r|\n/);
      let split = false;

      for (const line of lines) {
        if (split) {
          Transforms.splitNodes(e, { always: true });
        }

        e.insertText(line);
        split = true;
      }
    }
  };

  e.onChange = () => {
    // COMPAT: React doesn't batch `setState` hook calls, which means that the
    // children and selection can get out of sync for one render pass. So we
    // have to use this unstable API to ensure it batches them. (2019/12/03)
    // https://github.com/facebook/react/issues/14259#issuecomment-439702367
    // ReactDOM.unstable_batchedUpdates(() => {
    //   const onContextChange = EDITOR_TO_ON_CHANGE.get(e);
    //   if (onContextChange) {
    //     onContextChange();
    //   }
    //   onChange();
    // });
  };

  return e;
};
