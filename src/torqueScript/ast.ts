export interface BaseNode {
  type: string;
}

export interface Program extends BaseNode {
  type: "Program";
  body: Statement[];
  comments?: Comment[];
  execScriptPaths: string[];
  hasDynamicExec: boolean;
}

export type Statement =
  | ExpressionStatement
  | FunctionDeclaration
  | PackageDeclaration
  | DatablockDeclaration
  | ObjectDeclaration
  | IfStatement
  | ForStatement
  | WhileStatement
  | DoWhileStatement
  | SwitchStatement
  | ReturnStatement
  | BreakStatement
  | ContinueStatement
  | BlockStatement;

export interface ExpressionStatement extends BaseNode {
  type: "ExpressionStatement";
  expression: Expression;
}

export interface FunctionDeclaration extends BaseNode {
  type: "FunctionDeclaration";
  name: Identifier;
  params: Variable[];
  body: BlockStatement;
}

export interface PackageDeclaration extends BaseNode {
  type: "PackageDeclaration";
  name: Identifier;
  body: Statement[];
  comments?: Comment[];
}

export interface DatablockDeclaration extends BaseNode {
  type: "DatablockDeclaration";
  className: Identifier;
  instanceName: Identifier | null;
  parent: Identifier | null;
  body: ObjectBodyItem[];
}

export interface ObjectDeclaration extends BaseNode {
  type: "ObjectDeclaration";
  className: Identifier | Expression;
  instanceName: Identifier | Expression | null;
  body: ObjectBodyItem[];
}

export type ObjectBodyItem = Assignment | ObjectDeclaration;

export interface Assignment extends BaseNode {
  type: "Assignment";
  target: Identifier | IndexExpression;
  value: Expression;
}

export interface IfStatement extends BaseNode {
  type: "IfStatement";
  test: Expression;
  consequent: Statement;
  alternate: Statement | null;
}

export interface ForStatement extends BaseNode {
  type: "ForStatement";
  init: Expression | null;
  test: Expression | null;
  update: Expression | null;
  body: Statement;
}

export interface WhileStatement extends BaseNode {
  type: "WhileStatement";
  test: Expression;
  body: Statement;
}

export interface DoWhileStatement extends BaseNode {
  type: "DoWhileStatement";
  test: Expression;
  body: Statement;
}

export interface SwitchStatement extends BaseNode {
  type: "SwitchStatement";
  stringMode: boolean;
  discriminant: Expression;
  cases: SwitchCase[];
}

export interface SwitchCase extends BaseNode {
  type: "SwitchCase";
  test: Expression | Expression[] | null; // null = default, array = "or" syntax
  consequent: Statement[];
}

export interface ReturnStatement extends BaseNode {
  type: "ReturnStatement";
  value: Expression | null;
}

export interface BreakStatement extends BaseNode {
  type: "BreakStatement";
}

export interface ContinueStatement extends BaseNode {
  type: "ContinueStatement";
}

export interface BlockStatement extends BaseNode {
  type: "BlockStatement";
  body: Statement[];
  comments?: Comment[];
}

export type Expression =
  | Identifier
  | Variable
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | BinaryExpression
  | UnaryExpression
  | PostfixExpression
  | AssignmentExpression
  | ConditionalExpression
  | CallExpression
  | MemberExpression
  | IndexExpression
  | TagDereferenceExpression
  | ObjectDeclaration
  | DatablockDeclaration;

export interface Identifier extends BaseNode {
  type: "Identifier";
  name: string;
}

export interface Variable extends BaseNode {
  type: "Variable";
  scope: "local" | "global";
  name: string;
}

export interface NumberLiteral extends BaseNode {
  type: "NumberLiteral";
  value: number;
}

export interface StringLiteral extends BaseNode {
  type: "StringLiteral";
  value: string;
  tagged?: boolean;
}

export interface BooleanLiteral extends BaseNode {
  type: "BooleanLiteral";
  value: boolean;
}

export interface BinaryExpression extends BaseNode {
  type: "BinaryExpression";
  operator: string;
  left: Expression;
  right: Expression;
}

export interface UnaryExpression extends BaseNode {
  type: "UnaryExpression";
  operator: string;
  argument: Expression;
}

export interface PostfixExpression extends BaseNode {
  type: "PostfixExpression";
  operator: string;
  argument: Expression;
}

export interface AssignmentExpression extends BaseNode {
  type: "AssignmentExpression";
  operator: string;
  target: Expression;
  value: Expression;
}

export interface ConditionalExpression extends BaseNode {
  type: "ConditionalExpression";
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}

export interface CallExpression extends BaseNode {
  type: "CallExpression";
  callee: Expression;
  arguments: Expression[];
}

export interface MemberExpression extends BaseNode {
  type: "MemberExpression";
  object: Expression;
  property: Identifier | Expression;
  computed?: boolean;
}

export interface IndexExpression extends BaseNode {
  type: "IndexExpression";
  object: Expression;
  index: Expression | Expression[]; // Single or multi-index access: $arr[i] or $arr[i, j]
}

export interface TagDereferenceExpression extends BaseNode {
  type: "TagDereferenceExpression";
  argument: Expression;
}

export interface Comment extends BaseNode {
  type: "Comment";
  value: string;
}

export function isMethodName(name: Identifier): boolean {
  return name.name.includes("::");
}

export function parseMethodName(
  name: string,
): { namespace: string; method: string } | null {
  const idx = name.indexOf("::");
  if (idx === -1) return null;
  return {
    namespace: name.slice(0, idx),
    method: name.slice(idx + 2),
  };
}
