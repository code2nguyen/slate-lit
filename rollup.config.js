import resolve from 'rollup-plugin-node-resolve';
import commonJS from 'rollup-plugin-commonjs';
import postcss from 'rollup-plugin-postcss';
import { terser } from 'rollup-plugin-terser';
import json from 'rollup-plugin-json';
import typescript from '@rollup/plugin-typescript';

const extensions = ['.js', '.ts'];

const commonPlugins = [
  json(),
  commonJS(),
  resolve({ module: true, jsnext: true, extensions }),
  postcss(),
  terser({ keep_classnames: true, keep_fnames: true }),
];

const es6Bundle = {
  input: ['src/index.ts'],
  output: {
    dir: 'dist',
    entryFileNames: 'bundle/webcomponents.js',
    format: 'cjs',
    name: 'calendar-clock',
    sourcemap: true,
  },
  plugins: [typescript(), ...commonPlugins],
};

export default [es6Bundle];
