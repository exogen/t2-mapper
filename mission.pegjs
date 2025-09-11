start
  = document

document
  = body:statement* !. { return body.filter(Boolean); }

statement
  = comment
  / instance
  / definition
  / datablock
  / space+ { return null; }

comment
  = "//" text:$[^\n\r]* { return { type: 'comment', text }; }

datablock
  = "datablock " space* className:identifier space*
    "(" space* instanceName:objectName? space* ")" space*
    (":" space* baseName:objectName)? space*
    "{" body:body* "}" sep*
    {
      return {
        type: 'datablock',
        className,
        instanceName,
        body: body.filter(Boolean)
      }
    }

instance
  = "new " space* className:identifier space*
    "(" space* instanceName:objectName? space* ")" space*
    "{" body:body* "}" sep*
    {
      return {
        type: 'instance',
        className,
        instanceName,
        body: body.filter(Boolean)
      }
    }

body
  = space+ { return null; }
  / definition
  / instance
  / comment

definition
  = target:lhs space* "=" space* value:rhs ";"?
    { return { type: 'definition', target, value }; }

string
  = "\"" values:(escape / notDoubleQuote)* "\"" { return { type: 'string', value: values.join('') }; }
  / "'" values:(escape / notSingleQuote)* "'" { return { type: 'string', value: values.join('') }; }

escape = "\\" char:. { return char}
notDoubleQuote = $[^\\"]+
notSingleQuote = $[^\\']+

space = [ \t\n\r] { return null; }

sep = ";"

identifier = $([$%]?[a-zA-Z][a-zA-Z0-9_]*)

objectName
  = identifier
  / number

lhs = name:identifier index:index* { return { name, index }; }

rhs
  = string
  / number
  / instance
  / boolean
  / ref:identifier { return { type: 'reference', value: ref }; }

index = arrayIndex / propertyIndex

arrayIndex = "[" space* index:accessor space* "]" { return index; }

propertyIndex = "." index:identifier { return index; }

accessor
  = number
  / identifier

number = digits:$[0-9.]+ { return { type: 'number', value: parseFloat(digits) }; }

boolean = literal:("true" / "false") { return { type: 'boolean', value: literal === "true" }; }

eol = "\n" / "\r\n" / "\r"
