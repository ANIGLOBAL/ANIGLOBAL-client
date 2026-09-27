/**
 * Parser AGQL.
 *
 *   AGQL { ... }
 *   AGQL -> AV { ... }
 *   AGQL -> AV @locale("vi-VN") { ... }
 */

import { tokenize, Tok, type Token, LexError } from '../lexer/tokenizer.ts';
import { isPlatformId, type PlatformId } from '../../core/models/platform.ts';
import type {
  ArgumentNode,
  ArgumentValue,
  DirectiveNode,
  DocumentNode,
  SelectionNode,
  SelectionSetNode,
} from '../ast/nodes.ts';

export class ParseError extends Error {
  readonly line: number;
  readonly column: number;
  readonly position: number;

  constructor(message: string, line: number, column: number, position: number) {
    super(`${message} (dong ${line}, cot ${column})`);
    this.name = 'ParseError';
    this.line = line;
    this.column = column;
    this.position = position;
  }
}

class Parser {
  private pos = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const t = this.peek();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  private at(type: Tok): boolean {
    return this.peek().type === type;
  }

  private expect(type: Tok, what: string): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new ParseError(
        `Can ${what}, thay bang "${t.value || t.type}"`,
        t.line,
        t.column,
        t.start
      );
    }
    return this.next();
  }

  parseDocument(): DocumentNode {
    // AGQL
    const head = this.peek();
    if (head.type !== Tok.Agql) {
      throw new ParseError(
        'Query phai bat dau bang "AGQL"',
        head.line,
        head.column,
        head.start
      );
    }
    this.next();

    // -> <PLATFORM>   (tuy chon, mac dinh AV)
    let platform: PlatformId | null = null;
    if (this.at(Tok.Arrow)) {
      this.next();
      const p = this.expect(Tok.Ident, 'ten nen tang sau "->"');
      const upper = p.value.toUpperCase();
      if (!isPlatformId(upper)) {
        throw new ParseError(
          `Nen tang "${p.value}" khong hop le. Hop le: AV, AE, AC`,
          p.line,
          p.column,
          p.start
        );
      }
      platform = upper;
    }

    // directive cap doc   @locale("vi-VN")
    const directives = this.parseDirectives();

    const selection = this.parseSelectionSet();

    const t = this.peek();
    if (t.type !== Tok.Eof) {
      throw new ParseError(
        `Thua "${t.value || t.type}" sau khi ket thuc query`,
        t.line,
        t.column,
        t.start
      );
    }

    return { platform, directives, selection };
  }

  private parseDirectives(): DirectiveNode[] {
    const out: DirectiveNode[] = [];
    while (this.at(Tok.At)) {
      const at = this.next();
      const nameTok = this.expect(Tok.Ident, 'ten directive sau "@"');
      out.push({
        name: nameTok.value,
        args: this.parseArguments(true),
        line: at.line,
        column: at.column,
      });
    }
    return out;
  }

  /**
   * `allowPositional` chi dung cho directive: `@locale("vi-VN")`.
   * Argument cua field luon phai co ten: `anime(id: "1")`.
   */
  private parseArguments(allowPositional = false): ArgumentNode[] {
    if (!this.at(Tok.LParen)) return [];
    this.next(); // (
    const args: ArgumentNode[] = [];
    if (this.at(Tok.RParen)) {
      this.next();
      return args;
    }
    for (;;) {
      if (allowPositional && !this.at(Tok.Ident)) {
        // Tham so theo vi tri — lay tok hien tai lam moc vi tri bao loi.
        const mark = this.peek();
        args.push({
          name: null,
          value: this.parseValue(),
          line: mark.line,
          column: mark.column,
        });
      } else {
        const nameTok = this.expect(Tok.Ident, 'ten tham so');
        this.expect(Tok.Colon, '":" sau ten tham so');
        args.push({
          name: nameTok.value,
          value: this.parseValue(),
          line: nameTok.line,
          column: nameTok.column,
        });
      }
      if (this.at(Tok.Comma)) {
        this.next();
        continue;
      }
      break;
    }
    this.expect(Tok.RParen, '")"');
    return args;
  }

  private parseValue(): ArgumentValue {
    const t = this.peek();

    switch (t.type) {
      case Tok.String:
        this.next();
        return { kind: 'string', value: t.value };
      case Tok.Number: {
        this.next();
        const num = Number(t.value);
        if (Number.isNaN(num)) {
          throw new ParseError(`So khong hop le "${t.value}"`, t.line, t.column, t.start);
        }
        return { kind: 'number', value: num };
      }
      case Tok.LBrace: {
        this.next();
        const value: Record<string, ArgumentValue> = {};
        while (!this.at(Tok.RBrace)) {
          const k = this.expect(Tok.Ident, 'ten truong');
          this.expect(Tok.Colon, '":" sau ten truong');
          value[k.value] = this.parseValue();
          if (this.at(Tok.Comma)) this.next();
        }
        this.next(); // }
        return { kind: 'object', value };
      }
      case Tok.LParen: {
        this.next();
        const list: ArgumentValue[] = [];
        while (!this.at(Tok.RParen)) {
          list.push(this.parseValue());
          if (this.at(Tok.Comma)) this.next();
        }
        this.next(); // )
        return { kind: 'list', value: list };
      }
      case Tok.LBracket: {
        this.next();
        const list: ArgumentValue[] = [];
        while (!this.at(Tok.RBracket)) {
          list.push(this.parseValue());
          if (this.at(Tok.Comma)) this.next();
        }
        this.next(); // ]
        return { kind: 'list', value: list };
      }
      case Tok.Ident: {
        this.next();
        if (t.value === 'true') return { kind: 'boolean', value: true };
        if (t.value === 'false') return { kind: 'boolean', value: false };
        if (t.value === 'null') return { kind: 'null' };
        return { kind: 'enum', value: t.value };
      }
      default:
        throw new ParseError(
          `Gia tri khong hop le "${t.value || t.type}"`,
          t.line,
          t.column,
          t.start
        );
    }
  }

  private parseSelectionSet(): SelectionSetNode {
    const open = this.expect(Tok.LBrace, '"{"');
    const selections: SelectionNode[] = [];

    while (!this.at(Tok.RBrace)) {
      selections.push(this.parseSelection());
      if (this.at(Tok.Comma)) this.next();
    }
    this.expect(Tok.RBrace, '"}"');

    return { selections, line: open.line, column: open.column };
  }

  private parseSelection(): SelectionNode {
    // -> <quan he>
    if (this.at(Tok.Arrow)) {
      const arrow = this.next();
      const nameTok = this.expect(Tok.Ident, 'ten quan he sau "->"');
      const args = this.parseArguments();
      const directives = this.parseDirectives();
      const selection = this.at(Tok.LBrace) ? this.parseSelectionSet() : null;
      return {
        kind: 'relation',
        name: nameTok.value,
        args,
        directives,
        selection,
        line: arrow.line,
        column: arrow.column,
      };
    }

    // <ten> | <alias>: <ten>
    const first = this.expect(Tok.Ident, 'ten truong');
    let alias: string | null = null;
    let name = first.value;

    if (this.at(Tok.Colon)) {
      this.next();
      alias = first.value;
      const real = this.expect(Tok.Ident, 'ten truong sau alias');
      name = real.value;
    }

    const args = this.parseArguments();
    const directives = this.parseDirectives();
    const selection = this.at(Tok.LBrace) ? this.parseSelectionSet() : null;

    return {
      kind: 'field',
      alias,
      name,
      args,
      directives,
      selection,
      line: first.line,
      column: first.column,
    };
  }
}

export function parse(source: string): DocumentNode {
  const tokens = tokenize(source);
  return new Parser(tokens).parseDocument();
}

export { LexError };
