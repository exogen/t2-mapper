# TorqueScript Transpiler

Transpiles TorqueScript (`.cs`/`.mis` files) to JavaScript. Includes a runtime
that implements TorqueScript semantics and built-ins.

## Usage

```typescript
import { parse, transpile } from "./index";
import { createRuntime } from "./runtime";

// Parse and transpile
const { code, ast } = transpile(source);

// Create runtime and execute
const runtime = createRuntime();
const script = await runtime.loadFromSource(source);
script.execute();

// Access results
runtime.$g.get("myGlobal"); // Get global variable
runtime.$.call(obj, "method"); // Call method on object
```

## Why Transpile to JavaScript?

- No TypeScript compiler needed at runtime
- Can dynamically transpile and execute in the browser
- The transpiler and runtime are written in TypeScript, but output is plain JS

## Key Differences from JavaScript

TorqueScript has semantics that don't map cleanly to JavaScript. The transpiler
and runtime handle these differences.

### Case Insensitivity

All identifiers are case-insensitive: functions, methods, variables, object
names, and properties. The runtime uses `CaseInsensitiveMap` for lookups.

### Namespaces, Not Classes

TorqueScript has no `class` keyword. The `::` in `function Player::onKill` is
a naming convention that registers a function in a **namespace**—it doesn't
define or reference a class.

```torquescript
function Item::onPickup(%this) {
  echo("Picked up: " @ %this.getName());
}
```

This registers a function named `onPickup` in the `Item` namespace. You can
define functions in any namespace—`Item`, `MyGame`, `Util`—whether or not
objects of that "type" exist.

When you call a method on an object (`%obj.onPickup()`), the engine searches
for a matching function through a **namespace chain**. Every object has an
associated namespace (typically its C++ class name like `Item` or `Player`),
and namespaces are chained to parent namespaces. The engine walks up this
chain until it finds a function or fails.

```torquescript
new Item(HealthPack) { };
HealthPack.onPickup();  // Searches: Item -> SimObject -> ...
```

The `%this` parameter receives the object handle automatically—it's not magic
OOP binding, just a calling convention.

### `Parent::` is Package-Based

`Parent::method()` does NOT call a superclass. It calls the previous definition
of the same function before the current package was activated. Packages are
layers that override functions:

```torquescript
function DefaultGame::onKill(%game, %client) {
  // base behavior
}

package CTFGame {
  function DefaultGame::onKill(%game, %client) {
    Parent::onKill(%game, %client);  // calls the base version
    // CTF-specific behavior
  }
};
```

The runtime maintains a stack of function definitions per name. `Parent::` calls
the previous entry in that stack.

### Numeric Coercion

All arithmetic and comparison operators coerce operands to numbers. Empty
strings and undefined variables become `0`. This differs from JavaScript's
behavior:

```torquescript
$x = "5" + "3";  // 8, not "53"
$y = $undefined + 1;  // 1, not NaN
```

### Integer vs Float Operations

TorqueScript uses different numeric types internally:

| Operator               | Type            | JavaScript Equivalent  |
| ---------------------- | --------------- | ---------------------- |
| `+` `-` `*` `/`        | 64-bit float    | Direct (with coercion) |
| `%`                    | 32-bit signed   | `$.mod(a, b)`          |
| `&` `\|` `^` `<<` `>>` | 32-bit unsigned | `$.bitand()` etc.      |

Division by zero returns `0` (not `Infinity`).

### String Operators

| TorqueScript | JavaScript                         |
| ------------ | ---------------------------------- |
| `%a @ %b`    | `$.concat(a, b)`                   |
| `%a SPC %b`  | `$.concat(a, " ", b)`              |
| `%a TAB %b`  | `$.concat(a, "\t", b)`             |
| `%a $= %b`   | `$.streq(a, b)` (case-insensitive) |

### Array Variables

TorqueScript "arrays" are string-keyed, implemented via variable name
concatenation:

```torquescript
$items[0] = "first";     // Sets $items0
$items["key"] = "named"; // Sets $itemskey
$arr[%i, %j] = %val;     // Sets $arr{i}_{j}
```

### Switch Statements

TorqueScript `switch` has implicit break (no fallthrough). `switch$` does
case-insensitive string matching. The `or` keyword combines cases:

```torquescript
switch (%x) {
  case 1 or 2 or 3:
    doSomething();  // No break needed
  default:
    doOther();
}
```

## Generated Code Structure

The transpiler emits JavaScript that calls into a runtime API:

```javascript
// Function registration
$.registerFunction("myFunc", function() { ... });
$.registerMethod("Player", "onKill", function() { ... });

// Variable access via stores
const $l = $.locals();        // Per-function local store
$l.set("x", value);           // Set local
$l.get("x");                  // Get local
$g.set("GlobalVar", value);   // Set global
$g.get("GlobalVar");          // Get global

// Object/method operations
$.create("SimGroup", "MissionGroup", { ... });
$.call(obj, "method", arg1, arg2);
$.parent("CurrentClass", "method", thisObj, ...args);

// Operators with proper coercion
$.add(a, b);  $.sub(a, b);  $.mul(a, b);  $.div(a, b);
$.mod(a, b);  $.bitand(a, b);  $.shl(a, b);  // etc.
```

## Runtime API

The runtime exposes three main objects:

- **`$`** (`RuntimeAPI`): Object/method system, operators, property access
- **`$f`** (`FunctionsAPI`): Call standalone functions by name
- **`$g`** (`GlobalsAPI`): Global variable storage

Key methods on `$`:

```typescript
// Registration
registerMethod(className, methodName, fn)
registerFunction(name, fn)
package(name, bodyFn)

// Object creation
create(className, instanceName, props, children?)
datablock(className, instanceName, parentName, props)
deleteObject(obj)

// Property access (case-insensitive)
prop(obj, name)
setProp(obj, name, value)

// Method dispatch
call(obj, methodName, ...args)
nsCall(namespace, method, ...args)
parent(currentClass, methodName, thisObj, ...args)
```

## Script Loading

The runtime supports `exec()` for loading dependent scripts:

```typescript
const runtime = createRuntime({
  loadScript: async (path) => {
    // Return script source or null if not found
    return await fetch(path).then((r) => r.text());
  },
});

// Dependencies are resolved before execution
const script = await runtime.loadFromPath("scripts/main.cs");
script.execute();
```

- Scripts are executed once; subsequent `exec()` calls are no-ops
- Circular dependencies are handled (each script runs once)
- Paths are normalized (backslashes → forward slashes, lowercased)

## Built-in Functions

The runtime implements common TorqueScript built-ins like `echo`, `exec`,
`schedule`, `activatePackage`, string functions (`getWord`, `strLen`, etc.),
math functions (`mFloor`, `mSin`, etc.), and vector math (`vectorAdd`,
`vectorDist`, etc.). See `createBuiltins()` in `runtime.ts` for the full list.
