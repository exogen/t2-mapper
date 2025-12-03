import type * as AST from "./ast";
import { parseMethodName } from "./ast";

/** Operators that require runtime helpers for proper TorqueScript coercion semantics */
const OPERATOR_HELPERS: Record<string, string> = {
  // Arithmetic
  "+": "$.add",
  "-": "$.sub",
  "*": "$.mul",
  "/": "$.div",
  // Comparison
  "<": "$.lt",
  "<=": "$.le",
  ">": "$.gt",
  ">=": "$.ge",
  "==": "$.eq",
  "!=": "$.ne",
  // Integer
  "%": "$.mod",
  "&": "$.bitand",
  "|": "$.bitor",
  "^": "$.bitxor",
  "<<": "$.shl",
  ">>": "$.shr",
};

export interface GeneratorOptions {
  indent?: string;
  runtime?: string;
  functions?: string;
  globals?: string;
  locals?: string;
}

export class CodeGenerator {
  private indent: string;
  private runtime: string;
  private functions: string;
  private globals: string;
  private locals: string;
  private indentLevel = 0;
  private currentClass: string | null = null;
  private currentFunction: string | null = null;

  constructor(options: GeneratorOptions = {}) {
    this.indent = options.indent ?? "  ";
    this.runtime = options.runtime ?? "$";
    this.functions = options.functions ?? "$f";
    this.globals = options.globals ?? "$g";
    this.locals = options.locals ?? "$l";
  }

  private getAccessInfo(target: AST.Expression): {
    getter: string;
    setter: (value: string) => string;
    postIncHelper?: string;
    postDecHelper?: string;
  } | null {
    // Variable: $x or %x
    if (target.type === "Variable") {
      const name = JSON.stringify(target.name);
      const store = target.scope === "global" ? this.globals : this.locals;
      return {
        getter: `${store}.get(${name})`,
        setter: (value) => `${store}.set(${name}, ${value})`,
        postIncHelper: `${store}.postInc(${name})`,
        postDecHelper: `${store}.postDec(${name})`,
      };
    }

    // MemberExpression: obj.prop
    if (target.type === "MemberExpression") {
      const obj = this.expression(target.object);
      const prop =
        target.property.type === "Identifier"
          ? JSON.stringify(target.property.name)
          : this.expression(target.property);
      return {
        getter: `${this.runtime}.prop(${obj}, ${prop})`,
        setter: (value) => `${this.runtime}.setProp(${obj}, ${prop}, ${value})`,
        postIncHelper: `${this.runtime}.propPostInc(${obj}, ${prop})`,
        postDecHelper: `${this.runtime}.propPostDec(${obj}, ${prop})`,
      };
    }

    // IndexExpression: $arr[0] or obj[key]
    if (target.type === "IndexExpression") {
      const indices = Array.isArray(target.index)
        ? target.index.map((i) => this.expression(i))
        : [this.expression(target.index)];

      // Variable with index: $foo[0] becomes $foo0
      if (target.object.type === "Variable") {
        const baseName = JSON.stringify(target.object.name);
        const store =
          target.object.scope === "global" ? this.globals : this.locals;
        const indicesStr = indices.join(", ");
        return {
          getter: `${store}.get(${baseName}, ${indicesStr})`,
          setter: (value) =>
            `${store}.set(${baseName}, ${indicesStr}, ${value})`,
          postIncHelper: `${store}.postInc(${baseName}, ${indicesStr})`,
          postDecHelper: `${store}.postDec(${baseName}, ${indicesStr})`,
        };
      }

      // MemberExpression with index: obj.prop[0] becomes obj with field "prop0"
      // In TorqueScript, obj.field[idx] constructs field name: field + idx
      if (target.object.type === "MemberExpression") {
        const member = target.object;
        const obj = this.expression(member.object);
        const baseProp =
          member.property.type === "Identifier"
            ? JSON.stringify(member.property.name)
            : this.expression(member.property);
        const prop = `${this.runtime}.key(${baseProp}, ${indices.join(", ")})`;
        return {
          getter: `${this.runtime}.prop(${obj}, ${prop})`,
          setter: (value) =>
            `${this.runtime}.setProp(${obj}, ${prop}, ${value})`,
          postIncHelper: `${this.runtime}.propPostInc(${obj}, ${prop})`,
          postDecHelper: `${this.runtime}.propPostDec(${obj}, ${prop})`,
        };
      }

      // Object index access: obj[key]
      const obj = this.expression(target.object);
      const index =
        indices.length === 1
          ? indices[0]
          : `${this.runtime}.key(${indices.join(", ")})`;
      return {
        getter: `${this.runtime}.getIndex(${obj}, ${index})`,
        setter: (value) =>
          `${this.runtime}.setIndex(${obj}, ${index}, ${value})`,
        postIncHelper: `${this.runtime}.indexPostInc(${obj}, ${index})`,
        postDecHelper: `${this.runtime}.indexPostDec(${obj}, ${index})`,
      };
    }

    return null;
  }

  generate(ast: AST.Program): string {
    const lines: string[] = [];
    for (const stmt of ast.body) {
      const code = this.statement(stmt);
      if (code) lines.push(code);
    }
    return lines.join("\n\n");
  }

  private statement(node: AST.Statement | AST.Comment): string {
    switch (node.type) {
      case "Comment":
        // Skip comments in generated output (or could emit as JS comments)
        return "";
      case "ExpressionStatement":
        return this.line(`${this.expression(node.expression)};`);
      case "FunctionDeclaration":
        return this.functionDeclaration(node);
      case "PackageDeclaration":
        return this.packageDeclaration(node);
      case "DatablockDeclaration":
        return this.datablockDeclaration(node);
      case "ObjectDeclaration":
        return this.line(`${this.objectDeclaration(node)};`);
      case "IfStatement":
        return this.ifStatement(node);
      case "ForStatement":
        return this.forStatement(node);
      case "WhileStatement":
        return this.whileStatement(node);
      case "DoWhileStatement":
        return this.doWhileStatement(node);
      case "SwitchStatement":
        return this.switchStatement(node);
      case "ReturnStatement":
        return this.returnStatement(node);
      case "BreakStatement":
        return this.line("break;");
      case "ContinueStatement":
        return this.line("continue;");
      case "BlockStatement":
        return this.blockStatement(node);
      default:
        throw new Error(`Unknown statement type: ${(node as any).type}`);
    }
  }

  private functionDeclaration(node: AST.FunctionDeclaration): string {
    const nameInfo = parseMethodName(node.name.name);

    if (nameInfo) {
      // Method: Class::method - runtime handles case normalization
      const className = nameInfo.namespace;
      const methodName = nameInfo.method;

      this.currentClass = className.toLowerCase();
      this.currentFunction = methodName.toLowerCase();
      const body = this.functionBody(node.body, node.params);
      this.currentClass = null;
      this.currentFunction = null;

      return `${this.line(`${this.runtime}.registerMethod(${JSON.stringify(className)}, ${JSON.stringify(methodName)}, function() {`)}\n${body}\n${this.line(`});`)}`;
    } else {
      // Standalone function - runtime handles case normalization
      const funcName = node.name.name;

      this.currentFunction = funcName.toLowerCase();
      const body = this.functionBody(node.body, node.params);
      this.currentFunction = null;

      return `${this.line(`${this.runtime}.registerFunction(${JSON.stringify(funcName)}, function() {`)}\n${body}\n${this.line(`});`)}`;
    }
  }

  private functionBody(
    node: AST.BlockStatement,
    params: AST.Variable[],
  ): string {
    this.indentLevel++;
    const lines: string[] = [];

    lines.push(this.line(`const ${this.locals} = ${this.runtime}.locals();`));

    for (let i = 0; i < params.length; i++) {
      lines.push(
        this.line(
          `${this.locals}.set(${JSON.stringify(params[i].name)}, arguments[${i}]);`,
        ),
      );
    }

    for (const stmt of node.body) {
      lines.push(this.statement(stmt));
    }

    this.indentLevel--;
    return lines.join("\n");
  }

  private packageDeclaration(node: AST.PackageDeclaration): string {
    // Runtime handles case normalization
    const pkgName = JSON.stringify(node.name.name);
    this.indentLevel++;
    const body = node.body.map((s) => this.statement(s)).join("\n\n");
    this.indentLevel--;
    return `${this.line(`${this.runtime}.package(${pkgName}, function() {`)}\n${body}\n${this.line(`});`)}`;
  }

  private datablockDeclaration(node: AST.DatablockDeclaration): string {
    // Runtime handles case normalization
    const className = JSON.stringify(node.className.name);
    const instanceName = node.instanceName
      ? JSON.stringify(node.instanceName.name)
      : "null";
    const parentName = node.parent ? JSON.stringify(node.parent.name) : "null";
    const props = this.objectBody(node.body);
    return this.line(
      `${this.runtime}.datablock(${className}, ${instanceName}, ${parentName}, ${props});`,
    );
  }

  private objectDeclaration(node: AST.ObjectDeclaration): string {
    // Runtime handles case normalization
    const className =
      node.className.type === "Identifier"
        ? JSON.stringify(node.className.name)
        : this.expression(node.className);

    const instanceName =
      node.instanceName === null
        ? "null"
        : node.instanceName.type === "Identifier"
          ? JSON.stringify(node.instanceName.name)
          : this.expression(node.instanceName);

    // Separate properties and child objects
    const props: AST.Assignment[] = [];
    const children: AST.ObjectDeclaration[] = [];

    for (const item of node.body) {
      if (item.type === "Assignment") {
        props.push(item);
      } else {
        children.push(item);
      }
    }

    const propsStr = this.objectBody(props);

    if (children.length > 0) {
      const childrenStr = children
        .map((c) => this.objectDeclaration(c))
        .join(",\n");
      return `${this.runtime}.create(${className}, ${instanceName}, ${propsStr}, [\n${childrenStr}\n])`;
    }
    return `${this.runtime}.create(${className}, ${instanceName}, ${propsStr})`;
  }

  private objectBody(items: AST.ObjectBodyItem[]): string {
    if (items.length === 0) return "{}";

    const props: string[] = [];
    for (const item of items) {
      if (item.type === "Assignment") {
        const value = this.expression(item.value);

        if (item.target.type === "Identifier") {
          // Simple property: fieldName = value
          const key = item.target.name;
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
            props.push(`${key}: ${value}`);
          } else {
            props.push(`[${JSON.stringify(key)}]: ${value}`);
          }
        } else if (item.target.type === "IndexExpression") {
          // Indexed property: stateName[0] = value
          // This sets a property on the object being defined, not an external variable
          const propKey = this.objectPropertyKey(item.target);
          props.push(`[${propKey}]: ${value}`);
        } else {
          // Other computed property key
          const computedKey = this.expression(item.target);
          props.push(`[${computedKey}]: ${value}`);
        }
      }
    }

    // Format: single line for 1 prop, multiline for 2+
    if (props.length <= 1) {
      return `{ ${props.join(", ")} }`;
    }
    const innerIndent = this.indent.repeat(this.indentLevel + 1);
    const outerIndent = this.indent.repeat(this.indentLevel);
    return `{\n${innerIndent}${props.join(",\n" + innerIndent)}\n${outerIndent}}`;
  }

  /**
   * Generate a property key for an indexed expression inside an object/datablock body.
   * stateName[0] -> $.key("stateName", 0)
   * arr[i, j] -> $.key("arr", i, j)
   */
  private objectPropertyKey(node: AST.IndexExpression): string {
    // Get the base name - should be an identifier for datablock properties
    const baseName =
      node.object.type === "Identifier"
        ? JSON.stringify(node.object.name)
        : this.expression(node.object);

    // Get the indices
    const indices = Array.isArray(node.index)
      ? node.index.map((i) => this.expression(i)).join(", ")
      : this.expression(node.index);

    return `${this.runtime}.key(${baseName}, ${indices})`;
  }

  private ifStatement(node: AST.IfStatement): string {
    const test = this.expression(node.test);
    const consequent = this.statementAsBlock(node.consequent);

    if (node.alternate) {
      if (node.alternate.type === "IfStatement") {
        // else if
        const alternate = this.ifStatement(node.alternate).replace(/^\s*/, "");
        return this.line(`if (${test}) ${consequent} else ${alternate}`);
      } else {
        const alternate = this.statementAsBlock(node.alternate);
        return this.line(`if (${test}) ${consequent} else ${alternate}`);
      }
    }
    return this.line(`if (${test}) ${consequent}`);
  }

  private forStatement(node: AST.ForStatement): string {
    const init = node.init ? this.expression(node.init) : "";
    const test = node.test ? this.expression(node.test) : "";
    const update = node.update ? this.expression(node.update) : "";
    const body = this.statementAsBlock(node.body);
    return this.line(`for (${init}; ${test}; ${update}) ${body}`);
  }

  private whileStatement(node: AST.WhileStatement): string {
    const test = this.expression(node.test);
    const body = this.statementAsBlock(node.body);
    return this.line(`while (${test}) ${body}`);
  }

  private doWhileStatement(node: AST.DoWhileStatement): string {
    const body = this.statementAsBlock(node.body);
    const test = this.expression(node.test);
    return this.line(`do ${body} while (${test});`);
  }

  private switchStatement(node: AST.SwitchStatement): string {
    if (node.stringMode) {
      // switch$ requires runtime helper for case-insensitive matching
      return this.switchStringStatement(node);
    }

    const discriminant = this.expression(node.discriminant);
    this.indentLevel++;

    const cases: string[] = [];
    for (const c of node.cases) {
      cases.push(this.switchCase(c));
    }

    this.indentLevel--;
    return `${this.line(`switch (${discriminant}) {`)}\n${cases.join("\n")}\n${this.line("}")}`;
  }

  private switchCase(node: AST.SwitchCase): string {
    const lines: string[] = [];

    // Handle "or" syntax: case 1 or 2 or 3:
    if (node.test === null) {
      lines.push(this.line("default:"));
    } else if (Array.isArray(node.test)) {
      for (const t of node.test) {
        lines.push(this.line(`case ${this.expression(t)}:`));
      }
    } else {
      lines.push(this.line(`case ${this.expression(node.test)}:`));
    }

    this.indentLevel++;
    for (const stmt of node.consequent) {
      lines.push(this.statement(stmt));
    }
    lines.push(this.line("break;"));
    this.indentLevel--;

    return lines.join("\n");
  }

  private switchStringStatement(node: AST.SwitchStatement): string {
    // switch$ uses case-insensitive string matching - emit runtime call
    const discriminant = this.expression(node.discriminant);
    const cases: string[] = [];

    for (const c of node.cases) {
      if (c.test === null) {
        cases.push(`default: () => { ${this.blockContent(c.consequent)} }`);
      } else if (Array.isArray(c.test)) {
        for (const t of c.test) {
          cases.push(
            `${this.expression(t)}: () => { ${this.blockContent(c.consequent)} }`,
          );
        }
      } else {
        cases.push(
          `${this.expression(c.test)}: () => { ${this.blockContent(c.consequent)} }`,
        );
      }
    }

    return this.line(
      `${this.runtime}.switchStr(${discriminant}, { ${cases.join(", ")} });`,
    );
  }

  private returnStatement(node: AST.ReturnStatement): string {
    if (node.value) {
      return this.line(`return ${this.expression(node.value)};`);
    }
    return this.line("return;");
  }

  private blockStatement(node: AST.BlockStatement): string {
    this.indentLevel++;
    const content = node.body.map((s) => this.statement(s)).join("\n");
    this.indentLevel--;
    return `{\n${content}\n${this.line("}")}`;
  }

  private statementAsBlock(node: AST.Statement): string {
    if (node.type === "BlockStatement") {
      return this.blockStatement(node);
    }
    // Wrap single statement in block
    this.indentLevel++;
    const content = this.statement(node);
    this.indentLevel--;
    return `{\n${content}\n${this.line("}")}`;
  }

  private blockContent(stmts: AST.Statement[]): string {
    return stmts.map((s) => this.statement(s).trim()).join(" ");
  }

  // ===========================================================================
  // Expressions
  // ===========================================================================

  private expression(node: AST.Expression): string {
    switch (node.type) {
      case "Identifier":
        return this.identifier(node);
      case "Variable":
        return this.variable(node);
      case "NumberLiteral":
        return String(node.value);
      case "StringLiteral":
        return JSON.stringify(node.value);
      case "BooleanLiteral":
        return String(node.value);
      case "BinaryExpression":
        return this.binaryExpression(node);
      case "UnaryExpression":
        return this.unaryExpression(node);
      case "PostfixExpression":
        return this.postfixExpression(node);
      case "AssignmentExpression":
        return this.assignmentExpression(node);
      case "ConditionalExpression":
        return `(${this.expression(node.test)} ? ${this.expression(node.consequent)} : ${this.expression(node.alternate)})`;
      case "CallExpression":
        return this.callExpression(node);
      case "MemberExpression":
        return this.memberExpression(node);
      case "IndexExpression":
        return this.indexExpression(node);
      case "TagDereferenceExpression":
        return `${this.runtime}.deref(${this.expression(node.argument)})`;
      case "ObjectDeclaration":
        return this.objectDeclaration(node);
      case "DatablockDeclaration":
        // Datablocks as expressions are rare but possible - runtime handles case normalization
        return `${this.runtime}.datablock(${JSON.stringify(node.className.name)}, ${node.instanceName ? JSON.stringify(node.instanceName.name) : "null"}, ${node.parent ? JSON.stringify(node.parent.name) : "null"}, ${this.objectBody(node.body)})`;
      default:
        throw new Error(`Unknown expression type: ${(node as any).type}`);
    }
  }

  private identifier(node: AST.Identifier): string {
    const info = parseMethodName(node.name);
    if (info && info.namespace.toLowerCase() === "parent") {
      return node.name;
    }
    if (info) {
      return `${this.runtime}.nsRef(${JSON.stringify(info.namespace)}, ${JSON.stringify(info.method)})`;
    }
    return JSON.stringify(node.name);
  }

  private variable(node: AST.Variable): string {
    if (node.scope === "global") {
      return `${this.globals}.get(${JSON.stringify(node.name)})`;
    }
    return `${this.locals}.get(${JSON.stringify(node.name)})`;
  }

  private binaryExpression(node: AST.BinaryExpression): string {
    const left = this.expression(node.left);
    const right = this.expression(node.right);
    const op = node.operator;

    // String concat operators
    const concat = this.concatExpression(left, op, right);
    if (concat) return concat;

    // String comparison operators
    if (op === "$=") {
      return `${this.runtime}.streq(${left}, ${right})`;
    }
    if (op === "!$=") {
      return `!${this.runtime}.streq(${left}, ${right})`;
    }

    // Logical operators (short-circuit, pass through to JS)
    if (op === "&&" || op === "||") {
      return `(${left} ${op} ${right})`;
    }

    // Arithmetic, comparison, and bitwise operators use runtime helpers
    // for proper TorqueScript numeric coercion
    const helper = OPERATOR_HELPERS[op];
    if (helper) {
      return `${helper}(${left}, ${right})`;
    }

    // Fallback (shouldn't reach here with valid TorqueScript)
    return `(${left} ${op} ${right})`;
  }

  private unaryExpression(node: AST.UnaryExpression): string {
    if (node.operator === "++" || node.operator === "--") {
      const access = this.getAccessInfo(node.argument);
      if (access) {
        const delta = node.operator === "++" ? 1 : -1;
        // Prefix: set and return the new value
        return access.setter(`${this.runtime}.add(${access.getter}, ${delta})`);
      }
    }

    const arg = this.expression(node.argument);
    if (node.operator === "~") {
      return `${this.runtime}.bitnot(${arg})`;
    }
    if (node.operator === "-") {
      return `${this.runtime}.neg(${arg})`;
    }
    // ! passes through (JS boolean coercion works correctly)
    return `${node.operator}${arg}`;
  }

  private postfixExpression(node: AST.PostfixExpression): string {
    const access = this.getAccessInfo(node.argument);
    if (access) {
      const helper =
        node.operator === "++" ? access.postIncHelper : access.postDecHelper;
      if (helper) {
        return helper;
      }
    }
    return `${this.expression(node.argument)}${node.operator}`;
  }

  private assignmentExpression(node: AST.AssignmentExpression): string {
    const value = this.expression(node.value);
    const op = node.operator;
    const access = this.getAccessInfo(node.target);

    if (!access) {
      throw new Error(`Unhandled assignment target type: ${node.target.type}`);
    }

    if (op === "=") {
      // Simple assignment
      return access.setter(value);
    } else {
      // Compound assignment: +=, -=, etc.
      const baseOp = op.slice(0, -1);
      const newValue = this.compoundAssignmentValue(
        access.getter,
        baseOp,
        value,
      );
      return access.setter(newValue);
    }
  }

  private callExpression(node: AST.CallExpression): string {
    const args = node.arguments.map((a) => this.expression(a)).join(", ");

    if (node.callee.type === "Identifier") {
      const name = node.callee.name;
      const info = parseMethodName(name);

      if (info && info.namespace.toLowerCase() === "parent") {
        if (this.currentClass) {
          return `${this.runtime}.parent(${JSON.stringify(this.currentClass)}, ${JSON.stringify(info.method)}, arguments[0]${args ? ", " + args : ""})`;
        } else if (this.currentFunction) {
          return `${this.runtime}.parentFunc(${JSON.stringify(this.currentFunction)}${args ? ", " + args : ""})`;
        } else {
          throw new Error("Parent:: call outside of function context");
        }
      }

      if (info) {
        return `${this.runtime}.nsCall(${JSON.stringify(info.namespace)}, ${JSON.stringify(info.method)}${args ? ", " + args : ""})`;
      }

      return `${this.functions}.call(${JSON.stringify(name)}${args ? ", " + args : ""})`;
    }

    if (node.callee.type === "MemberExpression") {
      const obj = this.expression(node.callee.object);
      const method =
        node.callee.property.type === "Identifier"
          ? JSON.stringify(node.callee.property.name)
          : this.expression(node.callee.property);
      return `${this.runtime}.call(${obj}, ${method}${args ? ", " + args : ""})`;
    }

    const callee = this.expression(node.callee);
    return `${callee}(${args})`;
  }

  private memberExpression(node: AST.MemberExpression): string {
    const obj = this.expression(node.object);
    if (node.computed || node.property.type !== "Identifier") {
      return `${this.runtime}.prop(${obj}, ${this.expression(node.property)})`;
    }
    return `${this.runtime}.prop(${obj}, ${JSON.stringify(node.property.name)})`;
  }

  private indexExpression(node: AST.IndexExpression): string {
    const indices = Array.isArray(node.index)
      ? node.index.map((i) => this.expression(i))
      : [this.expression(node.index)];

    if (node.object.type === "Variable") {
      const baseName = JSON.stringify(node.object.name);
      const store = node.object.scope === "global" ? this.globals : this.locals;
      return `${store}.get(${baseName}, ${indices.join(", ")})`;
    }

    // MemberExpression with index: obj.prop[0] becomes obj with field "prop0"
    // In TorqueScript, obj.field[idx] constructs field name: field + idx
    if (node.object.type === "MemberExpression") {
      const member = node.object;
      const obj = this.expression(member.object);
      const baseProp =
        member.property.type === "Identifier"
          ? JSON.stringify(member.property.name)
          : this.expression(member.property);
      const prop = `${this.runtime}.key(${baseProp}, ${indices.join(", ")})`;
      return `${this.runtime}.prop(${obj}, ${prop})`;
    }

    const obj = this.expression(node.object);
    if (indices.length === 1) {
      return `${this.runtime}.getIndex(${obj}, ${indices[0]})`;
    }
    return `${this.runtime}.getIndex(${obj}, ${this.runtime}.key(${indices.join(", ")}))`;
  }

  private line(code: string): string {
    return this.indent.repeat(this.indentLevel) + code;
  }

  private concatExpression(
    left: string,
    op: string,
    right: string,
  ): string | null {
    switch (op) {
      case "@":
        return `${this.runtime}.concat(${left}, ${right})`;
      case "SPC":
        return `${this.runtime}.concat(${left}, " ", ${right})`;
      case "TAB":
        return `${this.runtime}.concat(${left}, "\\t", ${right})`;
      case "NL":
        return `${this.runtime}.concat(${left}, "\\n", ${right})`;
      default:
        return null;
    }
  }

  private compoundAssignmentValue(
    getter: string,
    op: string,
    value: string,
  ): string {
    // String concat operators
    const concat = this.concatExpression(getter, op, value);
    if (concat) return concat;

    // Arithmetic and bitwise operators use runtime helpers
    const helper = OPERATOR_HELPERS[op];
    if (helper) {
      return `${helper}(${getter}, ${value})`;
    }

    // Fallback (shouldn't reach here with valid TorqueScript)
    return `(${getter} ${op} ${value})`;
  }
}

export function generate(ast: AST.Program, options?: GeneratorOptions): string {
  const generator = new CodeGenerator(options);
  return generator.generate(ast);
}
