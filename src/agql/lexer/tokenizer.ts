/**
 * AGQL Lexer.
 *
 * Cu phap:
 *   AGQL { ... }
 *   AGQL -> AV { ... }
 *   AGQL -> AV @locale("vi-VN") { anime(id: "x") { id title } }
 *
 * Ban ghi `->` la MOT token (TRAVERSE) de giup ba lenh duyet quan he.
 */

/** Loai token. Dung object hang so + union type de chay duoc voi
 *  Node --experimental-strip-types (khong ho tro `const enum`). */
export const Tok = {
  Agql: 'AGQL',
  Arrow: '->',
  LBrace: '{',
  RBrace: '}',
  LBracket: '[',
  RBracket: ']',
  LParen: '(',
  RParen: ')',
  Colon: ':',
  At: '@',
  Comma: ',',
  String: 'String',
  Number: 'Number',
  Ident: 'Ident',
  Eof: 'EOF',
} as const;

export type Tok = (typeof Tok)[keyof typeof Tok];

export interface Token {
  type: Tok;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export class LexError extends Error {
  readonly line: number;
  readonly column: number;
  readonly position: number;

  constructor(message: string, line: number, column: number, position: number) {
    super(`${message} (dong ${line}, cot ${column})`);
    this.name = 'LexError';
    this.line = line;
    this.column = column;
    this.position = position;
  }
}

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_]/.test(c);

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;

  const col = (pos: number) => pos - lineStart + 1;

  const push = (type: Tok, value: string, start: number, end: number) => {
    tokens.push({ type, value, start, end, line, column: col(start) });
  };

  while (i < input.length) {
    const c = input[i]!;

    // ---- khoang trang + xuoi dong moi ----
    if (c === '\n') {
      i++;
      line++;
      lineStart = i;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }

    // ---- comment // va /* */ ----
    if (c === '/' && input[i + 1] === '/') {
      while (i < input.length && input[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && input[i + 1] === '*') {
      const start = i;
      i += 2;
      let closed = false;
      while (i < input.length) {
        if (input[i] === '*' && input[i + 1] === '/') {
          i += 2;
          closed = true;
          break;
        }
        if (input[i] === '\n') {
          line++;
          lineStart = i + 1;
        }
        i++;
      }
      if (!closed) throw new LexError('Comment /* chua dong', line, col(start), start);
      continue;
    }

    // ---- toan tu (->) ----
    if (c === '-' && input[i + 1] === '>') {
      const start = i;
      i += 2;
      push(Tok.Arrow, '->', start, i);
      continue;
    }

    // ---- dau nhay don ----
    if (c === "'") {
      const start = i;
      const startLine = line;
      const startCol = col(start);
      i++;
      let out = '';
      let closed = false;
      while (i < input.length) {
        const ch = input[i]!;
        if (ch === '\\') {
          const n = input[i + 1];
          if (n === undefined) break;
          if (n === 'n') out += '\n';
          else if (n === 't') out += '\t';
          else if (n === 'r') out += '\r';
          else if (n === '\\') out += '\\';
          else if (n === "'") out += "'";
          else if (n === '"') out += '"';
          else out += n;
          i += 2;
          continue;
        }
        if (ch === "'") {
          i++;
          closed = true;
          break;
        }
        if (ch === '\n') {
          line++;
          lineStart = i + 1;
        }
        out += ch;
        i++;
      }
      if (!closed) throw new LexError('Chuoi ky tu chua dong', startLine, startCol, start);
      push(Tok.String, out, start, i);
      continue;
    }

    // ---- chuoi nhay doi ----
    if (c === '"') {
      const start = i;
      const startLine = line;
      const startCol = col(start);
      i++;
      let out = '';
      let closed = false;
      while (i < input.length) {
        const ch = input[i]!;
        if (ch === '\\') {
          const n = input[i + 1];
          if (n === undefined) break;
          if (n === 'n') out += '\n';
          else if (n === 't') out += '\t';
          else if (n === 'r') out += '\r';
          else if (n === '\\') out += '\\';
          else if (n === '"') out += '"';
          else if (n === "'") out += "'";
          else out += n;
          i += 2;
          continue;
        }
        if (ch === '"') {
          i++;
          closed = true;
          break;
        }
        if (ch === '\n') {
          line++;
          lineStart = i + 1;
        }
        out += ch;
        i++;
      }
      if (!closed) throw new LexError('Chuoi nhay doi chua dong', startLine, startCol, start);
      push(Tok.String, out, start, i);
      continue;
    }

    // ---- so ----
    if (isDigit(c) || (c === '-' && isDigit(input[i + 1] ?? ''))) {
      const start = i;
      if (c === '-') i++;
      while (i < input.length && isDigit(input[i]!)) i++;
      if (input[i] === '.') {
        i++;
        while (i < input.length && isDigit(input[i]!)) i++;
      }
      push(Tok.Number, input.slice(start, i), start, i);
      continue;
    }

    // ---- dinh danh / tu khoa ----
    if (isIdentStart(c)) {
      const start = i;
      while (i < input.length && isIdentPart(input[i]!)) i++;
      const raw = input.slice(start, i);
      if (raw.toUpperCase() === 'AGQL') push(Tok.Agql, 'AGQL', start, i);
      else push(Tok.Ident, raw, start, i);
      continue;
    }

    // ---- dau mot ky tu ----
    const single: Record<string, Tok> = {
      '{': Tok.LBrace,
      '}': Tok.RBrace,
      '[': Tok.LBracket,
      ']': Tok.RBracket,
      '(': Tok.LParen,
      ')': Tok.RParen,
      ':': Tok.Colon,
      '@': Tok.At,
      ',': Tok.Comma,
    };
    const t = single[c];
    if (t) {
      const start = i;
      i++;
      push(t, c, start, i);
      continue;
    }

    throw new LexError(`Ky tu la "${c}"`, line, col(i), i);
  }

  push(Tok.Eof, '', i, i);
  return tokens;
}
