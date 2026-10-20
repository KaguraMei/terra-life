import fs from 'node:fs/promises';
const out = new URL('../dist-offline/', import.meta.url);
await fs.mkdir(out, { recursive: true });
for (const name of ['index.html', 'favicon.svg', 'css', 'assets']) {
  await fs.cp(new URL('../' + name, import.meta.url), new URL(name, out), { recursive: true });
}
for (const name of ['generated', 'bootstrap.js', 'ui', 'main.js']) {
  await fs.cp(new URL('../js/' + name, import.meta.url), new URL('js/' + name, out), { recursive: true });
}
console.log('Offline site: dist-offline/index.html');
