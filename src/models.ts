import { TemplateResult } from 'lit-html';
import { Text, Element, NodeEntry, Range } from 'slate';
import { LitEditor } from './plugin/lit-editor';

export interface RenderElementAttributes {
  'data-slate-node': 'element';
  'data-slate-inline'?: true;
  'data-slate-void'?: true;
  contentEditable?: boolean;
  dir?: 'rtl';
  id: string;
}

export interface RenderElementProps {
  editor: LitEditor;
  children: any;
  element: Element;
  attributes: RenderElementAttributes;
}

export interface RenderLeafAttributes {
  'data-slate-leaf': true;
  id: string;
}

export interface RenderLeafProps {
  children: any;
  leaf: Text;
  text: Text;
  attributes: RenderLeafAttributes;
}

export type RenderElement = (props: RenderElementProps) => TemplateResult;
export type RenderLeaf = (props: RenderLeafProps) => TemplateResult;

export type Decorate = (entry: NodeEntry) => Range[];
