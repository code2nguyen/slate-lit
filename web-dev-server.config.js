const fs = require('fs');
const path = require('path');

module.exports = {
  nodeResolve: {
    jsnext: true,
    browser: true,
    // set default to false because es-dev-server always
    // runs in the browser
    preferBuiltins: true,
    // will overwrite es-dev-server's fileExtensions option
    extensions: ['.mjs', '.js'],
    // will overwrite es-dev-server's dedupe option
    dedupe: ['lit-html'],
    customResolveOptions: {
      // will overwrite es-dev-server's moduleDirs option
      moduleDirectory: ['./node_modules'],
      preserveSymlinks: true,
    },
  },
  // plugins: [esbuildPlugin({ ts: true, target: 'auto' })],

  plugins: [
    {
      serve(context) {
        console.log(context.path)
        if (context.path.includes('/node_modules/is-hotkey/lib/index.js')) {
          return {body: fs.readFileSync(path.resolve(__dirname, 'es-dev-server-override/is-hotkey.js'))};
        } else if (context.path.includes('/node_modules/direction/index.js')) {
          return {body: fs.readFileSync(path.resolve(__dirname, 'es-dev-server-override/direction.js'))};
        } else if (context.path.includes('/node_modules/esrever/esrever.js')) {
          return {body: fs.readFileSync(path.resolve(__dirname, 'es-dev-server-override/esrever.js'))};
        }
      },
    },
  ],
};
