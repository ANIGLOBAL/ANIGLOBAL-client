/**
 * AGQL Abstract Syntax Tree.
 *
 * Cau truc query:
 *
 *   Document
 *     platform?          AV | AE | AC
 *     directives[]       @locale("vi-VN") @smart ...
 *     selection          SelectionSet
 *
 *   SelectionSet
 *     fields[]           Field | Relation
 *
 *   Field
 *     alias?             "ten moi": field
 *     name               anime
 *     args?              (id: "x", limit: 10)
 *     directives[]       @smart
 *     selection?         SelectionSet      (chon con)
 *
 *   Relation            -> characters @merge { ... }
 *     name
 *     args?
 *     directives[]
 *     selection?
 */

import type { PlatformId } from '../../core/models/platform.ts';

export type ArgumentValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'enum'; value: string }
  | { kind: 'list'; value: ArgumentValue[] }
  | { kind: 'object'; value: Record<string, ArgumentValue> };

export interface ArgumentNode {
  /** `null` khi là tham số theo vị trí, ví dụ `@locale("vi-VN")`. */
  name: string | null;
  value: ArgumentValue;
  line: number;
  column: number;
}

export interface DirectiveNode {
  name: string;
  args: ArgumentNode[];
  line: number;
  column: number;
}

export interface FieldNode {
  kind: 'field';
  alias: string | null;
  name: string;
  args: ArgumentNode[];
  directives: DirectiveNode[];
  selection: SelectionSetNode | null;
  line: number;
  column: number;
}

export interface RelationNode {
  kind: 'relation';
  name: string;
  args: ArgumentNode[];
  directives: DirectiveNode[];
  selection: SelectionSetNode | null;
  line: number;
  column: number;
}

export type SelectionNode = FieldNode | RelationNode;

export interface SelectionSetNode {
  selections: SelectionNode[];
  line: number;
  column: number;
}

export interface DocumentNode {
  platform: PlatformId | null;
  directives: DirectiveNode[];
  selection: SelectionSetNode;
}
