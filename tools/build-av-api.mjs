// Bundle workers/av-api thanh MOT file JS de deploy len Cloudflare Dashboard.
//
//   node tools/build-av-api.mjs
//
// Dung `wrangler deploy --dry-run --outdir` de bundle ma KHONG deploy that.
// Doi thu tu: file sinh ra se la workers/av-api/av-api.js.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { statSync } from 'node:fs';

const WRANGLER_DIR = 'workers/av-api';
const OUT_DIR = join(WRANGLER_DIR, '.bundle-tmp');
const OUT_FILE = join(WRANGLER_DIR, 'av-api.js');

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
execFileSync(
  npx,
  ['wrangler', 'deploy', '--dry-run', '--outdir', '.bundle-tmp', '--config', 'wrangler.toml'],
  { cwd: WRANGLER_DIR, stdio: 'inherit', shell: true }
);

const produced = readdirSync(OUT_DIR).filter((f) => f.endsWith('.js'));
if (!produced.length) {
  console.error('Khong tim thay file .js trong .bundle-tmp');
  process.exit(1);
}

copyFileSync(join(OUT_DIR, produced[0]), OUT_FILE);
rmSync(OUT_DIR, { recursive: true, force: true });

const size = statSync(OUT_FILE).size;
console.log(`\nDa bundle ${OUT_FILE}`);
console.log(`  ${(size / 1024).toFixed(1)} kB`);
console.log('  Deploy: Cloudflare Dashboard > Worker "av-api" > Edit code > Paste > Deploy');
if (existsSync(join(WRANGLER_DIR, 'wrangler.toml'))) {
  console.log('  Nho doi database_id trong wrangler.toml truoc khi gan D1 binding.');
}
