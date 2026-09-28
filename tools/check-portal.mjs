// Kiem tra developer portal cua ANIGLOBAL-client: file ton tai, link noi bo
// dung, lang="en", va khong con tro toi ten cu.
import { readFileSync, existsSync } from 'node:fs';

const PAGES = ['index.html', 'ANIVIET.html', 'docs.html'];
const problems = [];
let links = 0;
let pages = 0;

for (const p of PAGES) {
  if (!existsSync(p)) {
    problems.push(`thieu file: ${p}`);
    continue;
  }
  pages++;
  const html = readFileSync(p, 'utf8');

  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const h = m[1];
    links++;
    if (h.startsWith('http') || h.startsWith('#') || h === '/') continue;
    const file = h.split('#')[0].split('?')[0];
    if (!file) continue;
    if (!existsSync(file)) problems.push(`${p}: link hong -> ${h}`);
  }

  const lang = /<html[^>]*lang="([^"]+)"/.exec(html);
  if (!lang) problems.push(`${p}: thieu <html lang>`);
  else if (lang[1] !== 'en') problems.push(`${p}: lang="${lang[1]}", nen la "en"`);

  if (!/<title>[^<]+<\/title>/.test(html)) problems.push(`${p}: thieu <title>`);
  if (!/name="description"/.test(html)) problems.push(`${p}: thieu meta description`);
  if (!/assets\/style\.css/.test(html)) problems.push(`${p}: khong link style.css`);

  if (!/aria-current="page"/.test(html)) problems.push(`${p}: khong trang nao danh dau trang hien tai`);
  if (!/class="parent-bar"/.test(html)) problems.push(`${p}: thieu parent-bar ve ANIGLOBAL`);
  if (/ANIGLOBAL_API/.test(html)) problems.push(`${p}: van con tro toi ANIGLOBAL_API`);
}

console.log('='.repeat(64));
console.log(`ANIGLOBAL-client portal: ${pages} trang, ${links} link`);
console.log('='.repeat(64));
if (problems.length === 0) console.log('OK — khong co van de');
else for (const p of problems) console.log('  [FAIL] ' + p);
console.log('='.repeat(64));
process.exit(problems.length ? 1 : 0);
