```js script
import { html } from '@open-wc/demoing-storybook';
import '../dist/index.js';

export default {
  title: 'slate-lit',
  component: 'slate-lit',
};
```


# Slate-lit
A text editor component using Slate and lit-element libraries.

## API
<sb-props of="slate-lit"></sb-props>


```js preview-story
export const Demo = () =>
  html`<slate-lit placeholder="This is slate-lit component"></slate-lit>`;
```

```js preview-story
export const RichText = () => {
  const initialValue = [
        {
          type: 'paragraph',
          children: [
            { text: 'This is editable ' },
            { text: 'rich', bold: true },
            { text: ' text, ' },
            { text: 'much', italic: true },
            { text: ' better than a ' },
            { text: '<textarea>', code: true },
            { text: '!' },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              text: "Since it's rich text, you can do things like turn a selection of text ",
            },
            { text: 'bold', bold: true },
            {
              text: ', or add a semantically rendered block quote in the middle of the page, like this:',
            },
          ],
        },
        {
          type: 'block-quote',
          children: [{ text: 'A wise quote.' }],
        },
        {
          type: 'paragraph',
          children: [{ text: 'Try it out for yourself!' }],
        },
      ];

      return html`<rich-text-editor .value=${initialValue}> some more light-dom </rich-text-editor>`;
}
  
```

```js preview-story
export const RichTextDarkTheme = () => {
  const initialValue = [
        {
          type: 'paragraph',
          children: [
            { text: 'This is editable ' },
            { text: 'rich', bold: true },
            { text: ' text, ' },
            { text: 'much', italic: true },
            { text: ' better than a ' },
            { text: '<textarea>', code: true },
            { text: '!' },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              text: "Since it's rich text, you can do things like turn a selection of text ",
            },
            { text: 'bold', bold: true },
            {
              text: ', or add a semantically rendered block quote in the middle of the page, like this:',
            },
          ],
        },
        {
          type: 'block-quote',
          children: [{ text: 'A wise quote.' }],
        },
        {
          type: 'paragraph',
          children: [{ text: 'Try it out for yourself!' }],
        },
      ];

      return html`
      <style>
        .dark-theme {
          --slate-lit-text-color: #e8eaed;
          --slate-lit-bg-color: #303236;
          --slate-lit-code-background-color: hsl(220, 11%, 10%);
          --slate-lit-highlight-color: hsl(60, 100%, 50%);
        }
      </style>
      <rich-text-editor class="dark-theme" .value=${initialValue}> some more light-dom </rich-text-editor>`;
}
  
```
