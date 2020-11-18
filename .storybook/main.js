const fs = require('fs');
const path = require('path');
const commonjs = require('rollup-plugin-commonjs')

module.exports = {
  stories: ['../stories/*.{js,md,mdx}'],
  addons: [
    // 'storybook-prebuilt/addon-actions/register.js',
    // 'storybook-prebuilt/addon-knobs/register.js',
    'storybook-prebuilt/addon-docs/register.js',
    'storybook-prebuilt/addon-viewport/register.js',
  ],
  esDevServer: {
    // custom es-dev-server options
    nodeResolve: true,
    watch: true,
    open: true,
    plugins: [
      {
        serve(context) {
          if (context.path.includes('/node_modules/is-hotkey/lib/index.js')) {
            return {body: fs.readFileSync(path.resolve(__dirname, '../es-dev-server-override/is-hotkey.js'))};
          } else if (context.path.includes('/node_modules/direction/index.js')) {
            return {body: fs.readFileSync(path.resolve(__dirname, '../es-dev-server-override/direction.js'))};
          } else if (context.path.includes('/node_modules/esrever/esrever.js')) {
            return {body: fs.readFileSync(path.resolve(__dirname, '../es-dev-server-override/esrever.js'))};
          }
        },
      },
    ],
  },
  outputDir: '../dist',
  rollup: config => {
    config.plugins.unshift(commonjs({
      namedExports: {
        esrever: ['reverse'],
        'react-dom': ['findDOMNode'],
        'react-dom/server': ['renderToStaticMarkup'],
      }
    }))
    return config
  },
};
