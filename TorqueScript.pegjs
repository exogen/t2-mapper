{{
  // Collect exec() script paths during parsing (deduplicated)
  // These are reset in the per-parse initializer below
  let execScriptPathsSet;
  let hasDynamicExec;

  function buildBinaryExpression(head, tail) {
    return tail.reduce((left, [op, right]) => ({
      type: 'BinaryExpression',
      operator: op,
      left,
      right
    }), head);
  }

  function buildUnaryExpression(operator, argument) {
    return {
      type: 'UnaryExpression',
      operator,
      argument
    };
  }

  function buildCallExpression(callee, args) {
    // Check if this is an exec() call
    if (callee.type === 'Identifier' && callee.name.toLowerCase() === 'exec') {
      if (args.length > 0 && args[0].type === 'StringLiteral') {
        execScriptPathsSet.add(args[0].value);
      } else {
        hasDynamicExec = true;
      }
    }
    return {
      type: 'CallExpression',
      callee,
      arguments: args
    };
  }

  function getExecScriptPaths() {
    return Array.from(execScriptPathsSet);
  }
}}

// Per-parse initializer - reset state for each parse call
{
  execScriptPathsSet = new Set();
  hasDynamicExec = false;
}

// Main entry point
Program
  = ws items:((Comment / Statement) ws)* {
      return {
        type: 'Program',
        body: items.map(([item]) => item).filter(Boolean),
        execScriptPaths: getExecScriptPaths(),
        hasDynamicExec
      };
    }

// Statements
Statement
  = PackageDeclaration
  / FunctionDeclaration
  / DatablockStatement
  / ObjectStatement
  / IfStatement
  / ForStatement
  / DoWhileStatement
  / WhileStatement
  / SwitchStatement
  / ReturnStatement
  / BreakStatement
  / ContinueStatement
  / ExpressionStatement
  / BlockStatement
  / Comment
  / _ ";" _ { return null; }

DatablockStatement
  = decl:DatablockDeclaration _ ";"? _ { return decl; }

ObjectStatement
  = decl:ObjectDeclaration _ ";"? _ { return decl; }

PackageDeclaration
  = "package" __ name:Identifier _ "{" ws items:((Comment / Statement) ws)* "}" _ ";"? {
      return {
        type: 'PackageDeclaration',
        name,
        body: items.map(([item]) => item).filter(Boolean)
      };
    }

FunctionDeclaration
  = "function" __ name:FunctionName _ "(" _ params:ParameterList? _ ")" _ body:BlockStatement {
      return {
        type: 'FunctionDeclaration',
        name,
        params: params || [],
        body
      };
    }

FunctionName
  = namespace:Identifier "::" method:Identifier {
      return { type: 'MethodName', namespace, method };
    }
  / Identifier

ParameterList
  = head:Identifier tail:(_ "," _ Identifier)* {
      return [head, ...tail.map(([,,,id]) => id)];
    }

DatablockDeclaration
  = "datablock" __ className:Identifier _ "(" _ instanceName:ObjectName? _ ")" _ parent:(":" _ Identifier)? _ body:("{" _ ObjectBody* _ "}" _)? {
      return {
        type: 'DatablockDeclaration',
        className,
        instanceName,
        parent: parent ? parent[2] : null,
        body: body ? body[2].filter(Boolean) : []
      };
    }

ObjectDeclaration
  = "new" __ className:ClassNameExpression _ "(" _ instanceName:ObjectName? _ ")" _ body:("{" _ ObjectBody* _ "}" _)? {
      return {
        type: 'ObjectDeclaration',
        className,
        instanceName,
        body: body ? body[2].filter(Boolean) : []
      };
    }

ClassNameExpression
  = "(" _ expr:Expression _ ")" { return expr; }
  / base:Identifier accessors:(_ "[" _ IndexList _ "]")* {
      return accessors.reduce((obj, [,,,indices]) => ({
        type: 'IndexExpression',
        object: obj,
        index: indices
      }), base);
    }

ObjectBody
  = obj:ObjectDeclaration _ ";"? _ { return obj; }
  / db:DatablockDeclaration _ ";"? _ { return db; }
  / Assignment
  / Comment
  / Whitespace

ObjectName
  = StringConcatExpression
  / Identifier
  / NumberLiteral

Assignment
  = _ target:LeftHandSide _ "=" _ value:Expression _ ";"? _ {
      return {
        type: 'Assignment',
        target,
        value
      };
    }

LeftHandSide
  = base:CallExpression accessors:Accessor* {
      return accessors.reduce((obj, accessor) => {
        if (accessor.type === 'property') {
          return {
            type: 'MemberExpression',
            object: obj,
            property: accessor.value
          };
        } else {
          return {
            type: 'IndexExpression',
            object: obj,
            index: accessor.value
          };
        }
      }, base);
    }

Accessor
  = "." _ property:Identifier { return { type: 'property', value: property }; }
  / "[" _ indices:IndexList _ "]" { return { type: 'index', value: indices }; }

IndexList
  = head:Expression tail:(_ "," _ Expression)* {
      return tail.length > 0 ? [head, ...tail.map(([,,,expr]) => expr)] : head;
    }

IfStatement
  = "if" _ "(" _ test:Expression _ ")" _ consequent:Statement alternate:(_ "else" _ Statement)? {
      return {
        type: 'IfStatement',
        test,
        consequent,
        alternate: alternate ? alternate[3] : null
      };
    }

ForStatement
  = "for" _ "(" _ init:Expression? _ ";" _ test:Expression? _ ";" _ update:Expression? _ ")" _ body:Statement {
      return {
        type: 'ForStatement',
        init,
        test,
        update,
        body
      };
    }

WhileStatement
  = "while" _ "(" _ test:Expression _ ")" _ body:Statement {
      return {
        type: 'WhileStatement',
        test,
        body
      };
    }

DoWhileStatement
  = "do" _ body:Statement _ "while" _ "(" _ test:Expression _ ")" _ ";"? {
      return {
        type: 'DoWhileStatement',
        test,
        body
      };
    }

SwitchStatement
  = "switch$" _ "(" _ discriminant:Expression _ ")" _ "{" ws items:((Comment / SwitchCase) ws)* "}" {
      return {
        type: 'SwitchStatement',
        stringMode: true,
        discriminant,
        cases: items.map(([item]) => item).filter(i => i && i.type === 'SwitchCase')
      };
    }
  / "switch" _ "(" _ discriminant:Expression _ ")" _ "{" ws items:((Comment / SwitchCase) ws)* "}" {
      return {
        type: 'SwitchStatement',
        stringMode: false,
        discriminant,
        cases: items.map(([item]) => item).filter(i => i && i.type === 'SwitchCase')
      };
    }

SwitchCase
  = "case" __ tests:CaseTestList _ ":" ws items:((Comment / Statement) ws)* {
      return {
        type: 'SwitchCase',
        test: tests,
        consequent: items.map(([item]) => item).filter(Boolean)
      };
    }
  / "default" _ ":" ws items:((Comment / Statement) ws)* {
      return {
        type: 'SwitchCase',
        test: null,
        consequent: items.map(([item]) => item).filter(Boolean)
      };
    }

CaseTestList
  = head:CaseTestExpression tail:(_ "or" __ CaseTestExpression)* {
      return tail.length > 0 ? [head, ...tail.map(([,,,expr]) => expr)] : head;
    }

CaseTestExpression
  = AdditiveExpression

ReturnStatement
  = "return" !IdentifierChar value:(_ Expression)? _ ";" {
      return {
        type: 'ReturnStatement',
        value: value ? value[1] : null
      };
    }

BreakStatement
  = "break" _ ";" {
      return { type: 'BreakStatement' };
    }

ContinueStatement
  = "continue" _ ";" {
      return { type: 'ContinueStatement' };
    }

ExpressionStatement
  = expr:Expression _ ";" {
      return {
        type: 'ExpressionStatement',
        expression: expr
      };
    }

BlockStatement
  = "{" ws items:((Comment / Statement) ws)* "}" {
      return {
        type: 'BlockStatement',
        body: items.map(([item]) => item).filter(Boolean)
      };
    }

// Expressions (in order of precedence)
Expression
  = AssignmentExpression

AssignmentExpression
  = target:LeftHandSide _ operator:AssignmentOperator _ value:AssignmentExpression {
      return {
        type: 'AssignmentExpression',
        operator,
        target,
        value
      };
    }
  / ConditionalExpression

AssignmentOperator
  = "=" / "+=" / "-=" / "*=" / "/=" / "%=" / "<<=" / ">>=" / "&=" / "|=" / "^="

ConditionalExpression
  = test:LogicalOrExpression _ "?" _ consequent:Expression _ ":" _ alternate:Expression {
      return {
        type: 'ConditionalExpression',
        test,
        consequent,
        alternate
      };
    }
  / LogicalOrExpression

LogicalOrExpression
  = head:LogicalAndExpression tail:(_ "||" _ LogicalAndExpression)* {
      return buildBinaryExpression(head, tail.map(([,op,,right]) => [op, right]));
    }

LogicalAndExpression
  = head:BitwiseOrExpression tail:(_ "&&" _ BitwiseOrExpression)* {
      return buildBinaryExpression(head, tail.map(([,op,,right]) => [op, right]));
    }

BitwiseOrExpression
  = head:BitwiseXorExpression tail:(_ "|" !"|" _ BitwiseXorExpression)* {
      return buildBinaryExpression(head, tail.map(([,op,,,right]) => [op, right]));
    }

BitwiseXorExpression
  = head:BitwiseAndExpression tail:(_ "^" _ BitwiseAndExpression)* {
      return buildBinaryExpression(head, tail.map(([,op,,right]) => [op, right]));
    }

BitwiseAndExpression
  = head:EqualityExpression tail:(_ "&" !"&" _ EqualityExpression)* {
      return buildBinaryExpression(head, tail.map(([,op,,,right]) => [op, right]));
    }

EqualityExpression
  = head:RelationalExpression tail:(_ EqualityOperator _ RelationalExpression)* {
      return buildBinaryExpression(head, tail.map(([,op,,right]) => [op, right]));
    }

EqualityOperator
  = "==" / "!="

RelationalExpression
  = head:StringConcatExpression tail:(_ RelationalOperator _ StringConcatExpression)* {
      return buildBinaryExpression(head, tail.map(([,op,,right]) => [op, right]));
    }

RelationalOperator
  = "<=" / ">=" / "<" / ">"

StringConcatExpression
  = head:ShiftExpression tail:(_ StringConcatOperator _ StringConcatRightSide)* {
      return buildBinaryExpression(head, tail.map(([,op,,right]) => [op, right]));
    }

// Right side of string concat: allow assignments or normal expressions, but minimize backtracking
StringConcatRightSide
  = target:LeftHandSide _ assignOp:AssignmentOperator _ value:AssignmentExpression {
      return {
        type: 'AssignmentExpression',
        operator: assignOp,
        target,
        value
      };
    }
  / ShiftExpression

StringConcatOperator
  = "$=" / "!$=" / "@" / "NL" / "TAB" / "SPC"

ShiftExpression
  = head:AdditiveExpression tail:(_ ShiftOperator _ AdditiveExpression)* {
      return buildBinaryExpression(head, tail.map(([,op,,right]) => [op, right]));
    }

ShiftOperator
  = "<<" / ">>"

AdditiveExpression
  = head:MultiplicativeExpression tail:(_ ("+" / "-") _ MultiplicativeExpression)* {
      return buildBinaryExpression(head, tail.map(([,op,,right]) => [op, right]));
    }

MultiplicativeExpression
  = head:UnaryExpression tail:(_ ("*" / "/" / "%") _ UnaryExpression)* {
      return buildBinaryExpression(head, tail.map(([,op,,right]) => [op, right]));
    }

UnaryExpression
  = operator:("-" / "!" / "~") _ argument:UnaryOperand {
      return buildUnaryExpression(operator, argument);
    }
  / operator:("++" / "--") _ argument:UnaryOperand {
      return buildUnaryExpression(operator, argument);
    }
  / "*" _ argument:UnaryOperand {
      return {
        type: 'TagDereferenceExpression',
        argument
      };
    }
  / PostfixExpression

// Allow assignment expressions as unary operands without parentheses.
// This matches official TorqueScript behavior where `!%x = foo()` parses as `!(%x = foo())`.
// We can't use full Expression here or it would break precedence (e.g., `!a + b` would
// incorrectly parse as `!(a + b)` instead of `(!a) + b`).
UnaryOperand
  = target:LeftHandSide _ operator:AssignmentOperator _ value:AssignmentExpression {
      return {
        type: 'AssignmentExpression',
        operator,
        target,
        value
      };
    }
  / UnaryExpression

PostfixExpression
  = argument:CallExpression _ operator:("++" / "--") {
      return {
        type: 'PostfixExpression',
        operator,
        argument
      };
    }
  / CallExpression

CallExpression
  = base:MemberExpression tail:((_ "(" _ ArgumentList? _ ")") / (_ Accessor))* {
      return tail.reduce((obj, item) => {
        // Check if it's a function call
        if (item[1] === '(') {
          const [,,,argList] = item;
          return buildCallExpression(obj, argList || []);
        }
        // Otherwise it's an accessor
        const accessor = item[1];
        if (accessor.type === 'property') {
          return {
            type: 'MemberExpression',
            object: obj,
            property: accessor.value
          };
        } else {
          return {
            type: 'IndexExpression',
            object: obj,
            index: accessor.value
          };
        }
      }, base);
    }

MemberExpression
  = base:PrimaryExpression accessors:(_ Accessor)* {
      return accessors.reduce((obj, [, accessor]) => {
        if (accessor.type === 'property') {
          return {
            type: 'MemberExpression',
            object: obj,
            property: accessor.value
          };
        } else {
          return {
            type: 'IndexExpression',
            object: obj,
            index: accessor.value
          };
        }
      }, base);
    }

ArgumentList
  = head:Expression tail:(_ "," _ Expression)* {
      return [head, ...tail.map(([,,,expr]) => expr)];
    }

PrimaryExpression
  = ObjectDeclaration
  / DatablockDeclaration
  / StringLiteral
  / NumberLiteral
  / BooleanLiteral
  / Variable
  / ParenthesizedExpression

ParenthesizedExpression
  = "(" _ expr:Expression _ ")" { return expr; }

// Variables
Variable
  = LocalVariable
  / GlobalVariable
  / PlainIdentifier

LocalVariable
  = "%" name:$([a-zA-Z_][a-zA-Z0-9_]*) {
      return {
        type: 'Variable',
        scope: 'local',
        name
      };
    }

GlobalVariable
  = "$" name:$("::"? [a-zA-Z_][a-zA-Z0-9_]* ("::" [a-zA-Z_][a-zA-Z0-9_]*)*) {
      return {
        type: 'Variable',
        scope: 'global',
        name
      };
    }

PlainIdentifier
  = name:$("parent" [ \t]* "::" [ \t]* [a-zA-Z_][a-zA-Z0-9_]*) {
      return {
        type: 'Identifier',
        name: name.replace(/\s+/g, '')
      };
    }
  / name:$("parent" ("::" [a-zA-Z_][a-zA-Z0-9_]*)+) {
      return {
        type: 'Identifier',
        name
      };
    }
  / name:$([a-zA-Z_][a-zA-Z0-9_]* ("::" [a-zA-Z_][a-zA-Z0-9_]*)*) {
      return {
        type: 'Identifier',
        name
      };
    }

Identifier
  = LocalVariable
  / GlobalVariable
  / PlainIdentifier

// Literals
StringLiteral
  = '"' chars:DoubleQuotedChar* '"' {
      return {
        type: 'StringLiteral',
        value: chars.join('')
      };
    }
  / "'" chars:SingleQuotedChar* "'" {
      // Single-quoted strings are "tagged" strings in TorqueScript,
      // used for network optimization (string sent once, then only tag ID)
      return {
        type: 'StringLiteral',
        value: chars.join(''),
        tagged: true
      };
    }

DoubleQuotedChar
  = "\\" char:EscapeSequence { return char; }
  / [^"\\\n\r]

SingleQuotedChar
  = "\\" char:EscapeSequence { return char; }
  / [^'\\\n\r]

EscapeSequence
  = "n" { return "\n"; }
  / "r" { return "\r"; }
  / "t" { return "\t"; }
  / "x" hex:$([0-9a-fA-F][0-9a-fA-F]) { return String.fromCharCode(parseInt(hex, 16)); }
  // TorqueScript color codes - mapped to byte values that skip \t (9), \n (10), \r (13)
  // These are processed by the game's text rendering system
  / "cr" { return String.fromCharCode(0x0F); }  // reset color
  / "cp" { return String.fromCharCode(0x10); }  // push color
  / "co" { return String.fromCharCode(0x11); }  // pop color
  / "c" code:$([0-9]) {
      // collapseRemap: \c0-\c9 map to bytes that avoid \t, \n, \r
      const collapseRemap = [0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0B, 0x0C, 0x0E];
      return String.fromCharCode(collapseRemap[parseInt(code, 10)]);
    }
  / char:. { return char; }

NumberLiteral
  = hex:$("0" [xX] [0-9a-fA-F]+) !IdentifierChar {
      return {
        type: 'NumberLiteral',
        value: parseInt(hex, 16)
      };
    }
  / number:$(("-"? [0-9]+ ("." [0-9]+)?) / ("-"? "." [0-9]+)) !IdentifierChar {
      return {
        type: 'NumberLiteral',
        value: parseFloat(number)
      };
    }

BooleanLiteral
  = value:("true" / "false") !IdentifierChar {
      return {
        type: 'BooleanLiteral',
        value: value === "true"
      };
    }

// Comments
Comment
  = SingleLineComment
  / MultiLineComment

SingleLineComment
  = "//" text:$[^\n\r]* [\n\r]? {
      return {
        type: 'Comment',
        value: text
      };
    }

MultiLineComment
  = "/*" text:$(!"*/" .)* "*/" {
      return {
        type: 'Comment',
        value: text
      };
    }

// Whitespace
Whitespace
  = [ \t\n\r]+ { return null; }

// Optional whitespace and comments (comments are consumed but not captured)
// Use this between tokens and in expressions
_
  = ([ \t\n\r] / SkipComment)*

// Required whitespace (at least one whitespace char, may include comments)
// Use this between keywords that must be separated
__
  = [ \t\n\r]+ ([ \t\n\r] / SkipComment)*

// Pure whitespace only (no comments) - used in statement lists where comments are captured separately
ws
  = [ \t\n\r]*

// Comments consumed silently (no return value) - used in whitespace rules
SkipComment
  = "//" [^\n\r]* [\n\r]?
  / "/*" (!"*/" .)* "*/"

IdentifierChar
  = [a-zA-Z0-9_]
