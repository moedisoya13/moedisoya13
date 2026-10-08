// 빌드: src/*.js 를 shell.html 에 인라인하고, 쓰인 글자만 남긴 Galmuri 서브셋을 base64 로 박는다.
//   node tools/build.mjs
// 폰트 원본: npm 의 galmuri@2.40.3 (dist/Galmuri11.ttf, Galmuri11-Bold.ttf) 을 tools/fonts/ 에 둔다. (SIL OFL 1.1)
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['core', 'art', 'data', 'gfx', 'audio', 'market', 'game', 'weapons', 'bosses', 'input', 'render', 'hud', 'ui', 'main'];
const js = ORDER.map(n => `// ── ${n}.js ──\n` + readFileSync(join(root, 'src', n + '.js'), 'utf8')).join('\n');
let shell = readFileSync(join(root, 'src', 'shell.html'), 'utf8');

// 글자 모음 (ASCII 전체 + 소스에 나온 모든 비ASCII)
const chars = new Set();
for (let c = 32; c < 127; c++) chars.add(String.fromCharCode(c));
for (const ch of shell + js) if (ch.codePointAt(0) > 127) chars.add(ch);
const tmp = mkdtempSync(join(tmpdir(), 'ai-font-'));
const textFile = join(tmp, 'chars.txt');
writeFileSync(textFile, [...chars].join(''));

const faces = [];
for (const [file, weight] of [['Galmuri11.ttf', 400], ['Galmuri11-Bold.ttf', 700]]) {
  const src = join(root, 'tools', 'fonts', file);
  if (!existsSync(src)) throw new Error('폰트 없음: ' + src + ' (npm galmuri@2.40.3 의 dist 에서 복사)');
  const out = join(tmp, file.replace('.ttf', '.woff2'));
  execFileSync('python3', ['-m', 'fontTools.subset', src, '--text-file=' + textFile, '--flavor=woff2', '--output-file=' + out, '--no-hinting', '--desubroutinize'], { stdio: 'inherit' });
  const b64 = readFileSync(out).toString('base64');
  faces.push(`@font-face{font-family:"Galmuri11";font-weight:${weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`);
}
const fontCss = '/* Galmuri11 © 2019–2025 Lee Minseo, SIL Open Font License 1.1 (서브셋) */\n' + faces.join('\n');
shell = shell.replace('/*FONT_FACES*/', () => fontCss);
const page = shell.replace('<!--SCRIPTS-->', () => '<script>\n' + js + '\n</script>');

writeFileSync(join(root, 'dist', 'arrow-index.html'), page);
writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n' + page + '\n</html>\n');
console.log('built', (page.length / 1024).toFixed(1) + 'KB', 'chars', chars.size);
