import resolve from 'rollup-plugin-node-resolve';
import commonJS from 'rollup-plugin-commonjs';
import postcss from 'rollup-plugin-postcss';
import { terser } from 'rollup-plugin-terser';
import json from 'rollup-plugin-json';
import typescript from '@rollup/plugin-typescript';

const extensions = ['.js', '.ts'];

const commonPlugins = [
  json(),
  commonJS({
    namedExports: {
      esrever: ['reverse'],
      'react-dom': ['findDOMNode'],
      'react-dom/server': ['renderToStaticMarkup'],
    }
  }),
  resolve({ module: true, jsnext: true, extensions }),
  postcss(),
  terser({ keep_classnames: true, keep_fnames: true }),
];

const es6Bundle = {
  input: ['src/index.ts'],
  output: {
    dir: 'dist',
    entryFileNames: 'bundle/slate-lit.js',
    format: 'cjs',
    name: 'c2n_slate_lit',
    sourcemap: true,
  },
  plugins: [typescript(), ...commonPlugins],
};

export default [es6Bundle];
