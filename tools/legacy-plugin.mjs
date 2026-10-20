import fs from 'node:fs/promises';
import path from 'node:path';

/** A build-time bridge, never eval/new Function in the shipped runtime. */
export async function wrapLegacy(filename) {
  const source = await fs.readFile(filename, 'utf8');
  const suffix = '})(window.TL = window.TL || {});';
  if (!source.includes('(function (TL) {') || !source.trimEnd().endsWith(suffix)) {
    throw new Error(`Unsupported legacy wrapper: ${filename}`);
  }
  // Replace only the IIFE boundary. Browser globals used by UI remain real globals.
  return source.replace('(function (TL) {', 'export default function initialize(TL) {')
    .replace(suffix, '}');
}

export function esbuildLegacyPlugin() {
  return {
    name: 'legacy-initializers',
    setup(build) {
      build.onResolve({ filter: /\?legacy$/ }, args => ({
        path: path.resolve(args.resolveDir, args.path.slice(0, -7)),
        namespace: 'legacy'
      }));
      build.onLoad({ filter: /.*/, namespace: 'legacy' }, async args => ({
        contents: await wrapLegacy(args.path), loader: 'js', resolveDir: path.dirname(args.path),
        watchFiles: [args.path]
      }));
    }
  };
}

export function viteLegacyPlugin() {
  return {
    name: 'legacy-initializers',
    async load(id) {
      if (!id.endsWith('?legacy')) return null;
      const filename = id.slice(0, -7);
      this.addWatchFile(filename);
      return wrapLegacy(filename);
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(/<script src="js\/[^"]+"><\/script>\s*/g, '')
          .replace('</body>', '<script type="module" src="/src/bootstrap/browser.ts"></script>\n</body>');
      }
    }
  };
}
