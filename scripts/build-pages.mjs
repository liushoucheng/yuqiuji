import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
await mkdir(new URL('docs/', root), { recursive: true });
for (const [source, target] of [['preview/index.html', 'index.html'], ['preview/app.js', 'app.js'], ['miniprogram/lib/domain.js', 'domain.js'], ['miniprogram/lib/demo.js', 'demo.js']]) await writeFile(new URL('docs/' + target, root), await read(source));
const css = (await read('miniprogram/app.wxss')).replace(/([\d.]+)rpx/g, (_, n) => Number(n) / 2 + 'px').replace(/\bpage\b/g, '.screen').replace(/view, text, button, input/g, 'div, span, button, input').replace(/>view/g, '>div');
await writeFile(new URL('docs/app.css', root), css);
await writeFile(new URL('docs/.nojekyll', root), '');
console.log('GitHub Pages 体验页已构建；页面明确标注仅当前浏览器保存。');
