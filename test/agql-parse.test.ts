import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, Tok } from '../src/agql/lexer/tokenizer.ts';
import { parse, ParseError } from '../src/agql/parser/parser.ts';

test('lexer: tach duoc AGQL -> AV', () => {
  const t = tokenize('AGQL -> AV { id }');
  assert.equal(t[0].type, Tok.Agql);
  assert.equal(t[1].type, Tok.Arrow);
  assert.equal(t[2].type, Tok.Ident);
  assert.equal(t[2].value, 'AV');
  assert.equal(t[3].type, Tok.LBrace);
});

test('lexer: -> la MOT token', () => {
  const t = tokenize('{ -> characters }');
  assert.equal(t[1].type, Tok.Arrow);
  assert.equal(t[2].value, 'characters');
});

test('lexer: chuoi nhay doi va dau nhay don', () => {
  assert.equal(tokenize('"Frieren"')[0]!.value, 'Frieren');
  assert.equal(tokenize("'Frieren'")[0]!.value, 'Frieren');
  assert.equal(tokenize('"a\\"b"')[0]!.value, 'a"b');
});

test('lexer: comment va so', () => {
  const t = tokenize('// moi\n/* x */ -12.5');
  assert.equal(t[0]!.type, Tok.Number);
  assert.equal(t[0]!.value, '-12.5');
});

test('lexer: comment chua dong -> nem loi', () => {
  assert.throws(() => tokenize('/* unterminated'), /Comment/);
});

test('parser: query don gian', () => {
  const d = parse('AGQL { anime(id: "ag_anime_1") { id title } }');
  assert.equal(d.platform, null);
  assert.equal(d.selection.selections.length, 1);
  const f = d.selection.selections[0]!;
  assert.equal(f.kind, 'field');
  assert.equal(f.name, 'anime');
  assert.equal(f.args[0]!.name, 'id');
  assert.equal(f.args[0]!.value.kind, 'string');
});

test('parser: routing nen tang', () => {
  assert.equal(parse('AGQL -> AV { id }').platform, 'AV');
  assert.equal(parse('AGQL -> ae { id }').platform, 'AE');
  assert.equal(parse('AGQL -> AC { id }').platform, 'AC');
});

test('parser: nen tang sai -> nem loi', () => {
  assert.throws(() => parse('AGQL -> XX { id }'), /khong hop le/);
});

test('parser: khong bat dau bang AGQL -> nem loi', () => {
  assert.throws(() => parse('{ anime { id } }'), /AGQL/);
});

test('parser: duyet quan he ->', () => {
  const d = parse(`
    AGQL -> AV {
      anime(id: "ag_anime_1") {
        id
        title
        -> characters @merge { id name }
        -> staff { id role }
      }
    }
  `);
  const anime = d.selection.selections[0]!;
  assert.equal(anime.selection!.selections.length, 4);
  const rel = anime.selection!.selections[2]!;
  assert.equal(rel.kind, 'relation');
  assert.equal(rel.name, 'characters');
  assert.equal(rel.directives[0]!.name, 'merge');
});

test('parser: alias', () => {
  const d = parse('AGQL { ten: anime(id: "1") { id } }');
  const f = d.selection.selections[0]!;
  assert.equal(f.kind, 'field');
  if (f.kind !== 'field') throw new Error('phai la field');
  assert.equal(f.alias, 'ten');
  assert.equal(f.name, 'anime');
});

test('parser: directive cap doc @locale', () => {
  const d = parse('AGQL -> AV @locale("vi-VN") { anime { id } }');
  assert.equal(d.directives[0]!.name, 'locale');
  const v = d.directives[0]!.args[0]!.value;
  assert.equal(v.kind, 'string');
  assert.equal(v.kind === 'string' ? v.value : '', 'vi-VN');
});

test('parser: gia tri nhieu kieu', () => {
  const d = parse(`
    AGQL {
      anime(limit: 10, active: true, nothing: null, kind: MOVIE, tags: ["a","b"], filter: {y: 2024}) { id }
    }
  `);
  const a = d.selection.selections[0]!.args;
  const byName = Object.fromEntries(a.map((x) => [x.name, x.value]));
  assert.equal(byName.limit?.kind === 'number' ? byName.limit.value : 0, 10);
  assert.equal(byName.active?.kind === 'boolean' ? byName.active.value : false, true);
  assert.equal(byName.nothing?.kind, 'null');
  assert.equal(byName.kind?.kind === 'enum' ? byName.kind.value : '', 'MOVIE');
  assert.equal(byName.tags?.kind, 'list');
  assert.equal(byName.filter?.kind, 'object');
});

test('parser: thieu dau ngoac -> nem loi co vi tri', () => {
  try {
    parse('AGQL { anime(id: "1" { id } }');
    assert.fail('phai nem loi');
  } catch (e) {
    assert.ok(e instanceof ParseError);
    assert.ok(e.line >= 1);
    assert.ok(e.message.includes('dong'));
  }
});

test('parser: comment nhieu dong khong lam hong vi tri', () => {
  const d = parse(`
    AGQL {
      /*注释
         多行 */
      anime { id }
    }
  `);
  assert.equal(d.selection.selections.length, 1);
});
