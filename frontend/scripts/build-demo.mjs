// Збирає односторінкову демо-версію (усе в одному HTML-файлі) у dist/kyivair-demo.html.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const js = await build({ entryPoints: ['js/app.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' });
const css = await readFile('css/styles.css', 'utf8');
let html = await readFile('index.html', 'utf8');
html = html
  .replace('<link rel="stylesheet" href="css/styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script>\n${js.outputFiles[0].text}</script>`);
await mkdir('dist', { recursive: true });
await writeFile('dist/kyivair-demo.html', html);
console.log('dist/kyivair-demo.html', (html.length / 1024).toFixed(0), 'KB');
