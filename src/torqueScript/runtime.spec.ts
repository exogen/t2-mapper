import { describe, it, expect, vi } from "vitest";
import { createRuntime } from "./runtime";
import type { TorqueRuntimeOptions } from "./types";
import { parse, transpile } from "./index";

function run(script: string, options?: TorqueRuntimeOptions) {
  const { $, $f, $g, state } = createRuntime(options);
  const { code } = transpile(script);
  // Provide $l (locals) at module scope for top-level local variable access
  const $l = $.locals();
  const fn = new Function("$", "$f", "$g", "$l", code);
  fn($, $f, $g, $l);
  return { $, $f, $g, $l, state };
}

describe("TorqueScript Runtime", () => {
  describe("global variables", () => {
    it("sets and retrieves global variables", () => {
      const { $g } = run(`
        $myVar = 42;
        $anotherVar = "hello";
      `);
      expect($g.get("myVar")).toBe(42);
      expect($g.get("anotherVar")).toBe("hello");
    });

    it("handles array-style global variables", () => {
      const { $g } = run(`
        $items[0] = "first";
        $items[1] = "second";
        $items["key"] = "named";
      `);
      expect($g.get("items0")).toBe("first");
      expect($g.get("items1")).toBe("second");
      expect($g.get("itemskey")).toBe("named");
    });

    it("is case-insensitive", () => {
      const { $g } = run(`
        $MyVariable = 100;
      `);
      expect($g.get("myvariable")).toBe(100);
      expect($g.get("MYVARIABLE")).toBe(100);
      expect($g.get("MyVariable")).toBe(100);
    });
  });

  describe("functions", () => {
    it("defines and calls functions", () => {
      const { $g } = run(`
        function add(%a, %b) {
          return %a + %b;
        }
        $result = add(10, 20);
      `);
      expect($g.get("result")).toBe(30);
    });

    it("handles local variables", () => {
      const { $g } = run(`
        function test() {
          %x = 5;
          %y = 10;
          return %x * %y;
        }
        $result = test();
      `);
      expect($g.get("result")).toBe(50);
    });

    it("handles recursive functions", () => {
      const { $g } = run(`
        function factorial(%n) {
          if (%n <= 1)
            return 1;
          return %n * factorial(%n - 1);
        }
        $result = factorial(5);
      `);
      expect($g.get("result")).toBe(120);
    });

    it("handles top-level local variables", () => {
      const { $g, $l } = run(`
        %x = 5;
        %y = 10;
        $result = %x * %y;
        %name = "test";
      `);
      expect($g.get("result")).toBe(50);
      expect($l.get("x")).toBe(5);
      expect($l.get("y")).toBe(10);
      expect($l.get("name")).toBe("test");
    });

    it("top-level locals are separate from function locals", () => {
      const { $g } = run(`
        %x = 100;
        function getX() {
          %x = 42;
          return %x;
        }
        $funcResult = getX();
        $topResult = %x;
      `);
      expect($g.get("funcResult")).toBe(42);
      expect($g.get("topResult")).toBe(100);
    });
  });

  describe("string operations", () => {
    it("concatenates with @", () => {
      const { $g } = run(`
        $result = "Hello" @ "World";
      `);
      expect($g.get("result")).toBe("HelloWorld");
    });

    it("concatenates with SPC", () => {
      const { $g } = run(`
        $result = "Hello" SPC "World";
      `);
      expect($g.get("result")).toBe("Hello World");
    });

    it("concatenates with TAB", () => {
      const { $g } = run(`
        $result = "Hello" TAB "World";
      `);
      expect($g.get("result")).toBe("Hello\tWorld");
    });

    it("concatenates with NL", () => {
      const { $g } = run(`
        $result = "Hello" NL "World";
      `);
      expect($g.get("result")).toBe("Hello\nWorld");
    });

    it("handles string re-assignment with concatenation", () => {
      const { $g } = run(`
        $str = "Hello";
        $str = $str @ "World";
      `);
      expect($g.get("str")).toBe("HelloWorld");
    });

    it("compares strings case-insensitively with $=", () => {
      const { $g } = run(`
        $same = "Hello" $= "hello";
        $diff = "Hello" $= "World";
      `);
      expect($g.get("same")).toBe(true);
      expect($g.get("diff")).toBe(false);
    });

    it("allows assignment on the right side of concat (SPC)", () => {
      // Pattern from Training5.mis:
      // echo("InitialBarrel =" SPC %initialBarrel = (%skill < 3 ? "Missile" : "Plasma"));
      const { $g, $l } = run(`
        $skill = 2;
        $result = "Barrel:" SPC %barrel = ($skill < 3 ? "Missile" : "Plasma");
      `);
      // The assignment should happen AND the result should include the assigned value
      expect($l.get("barrel")).toBe("Missile");
      expect($g.get("result")).toBe("Barrel: Missile");
    });

    it("allows assignment on the right side of concat (@)", () => {
      const { $g, $l } = run(`
        $result = "value=" @ %x = 42;
      `);
      expect($l.get("x")).toBe(42);
      expect($g.get("result")).toBe("value=42");
    });

    it("allows multiple concat with assignment at end", () => {
      // Assignment is right-associative and consumes everything to its right
      // So "a" SPC "b" SPC %x = "c" parses as "a" SPC "b" SPC (%x = "c")
      const { $g, $l } = run(`
        $result = "a" SPC "b" SPC %x = "c";
      `);
      expect($l.get("x")).toBe("c");
      expect($g.get("result")).toBe("a b c");
    });
  });

  describe("operator precedence", () => {
    it("parses unary minus with correct precedence", () => {
      // -1 + 2 should be (-1) + 2 = 1, NOT -(1 + 2) = -3
      const { $g } = run(`
        $result = -1 + 2;
      `);
      expect($g.get("result")).toBe(1);
    });

    it("parses unary minus in complex expressions", () => {
      const { $g } = run(`
        $a = -5 * 2;        // (-5) * 2 = -10
        $b = 10 + -3;       // 10 + (-3) = 7
        $c = -2 + -3;       // (-2) + (-3) = -5
        $d = -10 / 2 + 1;   // ((-10) / 2) + 1 = -4
      `);
      expect($g.get("a")).toBe(-10);
      expect($g.get("b")).toBe(7);
      expect($g.get("c")).toBe(-5);
      expect($g.get("d")).toBe(-4);
    });

    it("parses logical not with correct precedence", () => {
      const { $g } = run(`
        $a = !0 + 1;        // (!0) + 1 = 1 + 1 = 2
        $b = !1 || 1;       // (!1) || 1 = 0 || 1 = 1
      `);
      expect($g.get("a")).toBe(2);
      expect($g.get("b")).toBe(1);
    });

    it("parses bitwise not with correct precedence", () => {
      // The runtime uses unsigned 32-bit for bitwise ops
      // ~1 >>> 0 = 4294967294 (0xFFFFFFFE), then + 3 = 4294967297
      // The key test here is precedence: (~1) + 3, not ~(1 + 3)
      const { $g } = run(`
        $a = ~1 + 3;
      `);
      // ~1 as unsigned 32-bit = 4294967294, plus 3 = 4294967297
      expect($g.get("a")).toBe(4294967297);
    });

    it("handles multiple unary operators", () => {
      const { $g } = run(`
        $a = --5;           // -(-5) = 5
        $b = !!1;           // !(!1) = !(0) = 1 (truthy)
        $c = -(-(-1));      // 1 negated 3 times = -1
      `);
      expect($g.get("a")).toBe(5);
      expect($g.get("b")).toBeTruthy(); // JavaScript returns boolean, TorqueScript treats as truthy
      expect($g.get("c")).toBe(-1);
    });
  });

  describe("control flow", () => {
    it("handles if/else", () => {
      const { $g } = run(`
        function checkValue(%x) {
          if (%x > 10)
            return "big";
          else
            return "small";
        }
        $a = checkValue(15);
        $b = checkValue(5);
      `);
      expect($g.get("a")).toBe("big");
      expect($g.get("b")).toBe("small");
    });

    it("handles for loops", () => {
      const { $g } = run(`
        function sumRange(%n) {
          %sum = 0;
          for (%i = 1; %i <= %n; %i++) {
            %sum += %i;
          }
          return %sum;
        }
        $result = sumRange(5);
      `);
      expect($g.get("result")).toBe(15);
    });

    it("handles while loops", () => {
      const { $g } = run(`
        function countTo(%n) {
          %count = 0;
          %i = 0;
          while (%i < %n) {
            %count++;
            %i++;
          }
          return %count;
        }
        $result = countTo(3);
      `);
      expect($g.get("result")).toBe(3);
    });

    it("handles do-while loops", () => {
      const { $g } = run(`
        function countdown(%n) {
          %result = "";
          do {
            %result = %result @ %n;
            %n--;
          } while (%n > 0);
          return %result;
        }
        $result = countdown(3);
      `);
      expect($g.get("result")).toBe("321");
    });

    it("handles break in loops", () => {
      const { $g } = run(`
        %sum = 0;
        for (%i = 0; %i < 10; %i++) {
          if (%i == 5) break;
          %sum += %i;
        }
        $result = %sum;
      `);
      expect($g.get("result")).toBe(10); // 0+1+2+3+4
    });

    it("handles continue in loops", () => {
      const { $g } = run(`
        %sum = 0;
        for (%i = 0; %i < 5; %i++) {
          if (%i == 2) continue;
          %sum += %i;
        }
        $result = %sum;
      `);
      expect($g.get("result")).toBe(8); // 0+1+3+4
    });

    it("handles switch statements", () => {
      const { $g } = run(`
        function getDay(%n) {
          switch (%n) {
            case 1:
              return "Monday";
            case 2:
              return "Tuesday";
            default:
              return "Unknown";
          }
        }
        $day1 = getDay(1);
        $day2 = getDay(2);
        $dayX = getDay(99);
      `);
      expect($g.get("day1")).toBe("Monday");
      expect($g.get("day2")).toBe("Tuesday");
      expect($g.get("dayX")).toBe("Unknown");
    });

    it("handles switch with 'or' for multiple cases", () => {
      const { $g } = run(`
        function isWeekend(%day) {
          switch (%day) {
            case 6 or 7:
              return true;
            default:
              return false;
          }
        }
        $sat = isWeekend(6);
        $sun = isWeekend(7);
        $mon = isWeekend(1);
      `);
      expect($g.get("sat")).toBe(true);
      expect($g.get("sun")).toBe(true);
      expect($g.get("mon")).toBe(false);
    });

    it("handles switch$ (case-insensitive string switch)", () => {
      // Note: switch$ uses arrow functions internally, so return statements
      // don't work directly. Use variable assignment instead.
      const { $g } = run(`
        function getColor(%name) {
          %result = "";
          switch$ (%name) {
            case "red":
              %result = "#FF0000";
            case "GREEN":
              %result = "#00FF00";
            default:
              %result = "#000000";
          }
          return %result;
        }
        $red = getColor("RED");
        $green = getColor("green");
        $other = getColor("blue");
      `);
      expect($g.get("red")).toBe("#FF0000");
      expect($g.get("green")).toBe("#00FF00");
      expect($g.get("other")).toBe("#000000");
    });

    it("handles ternary operator", () => {
      const { $g } = run(`
        function check(%x) {
          return %x > 5 ? "big" : "small";
        }
        $result = check(10);
      `);
      expect($g.get("result")).toBe("big");
    });
  });

  describe("objects", () => {
    it("creates objects with new", () => {
      const { $ } = run(`
        new ScriptObject(MyObject) {
          value = 42;
          name = "test";
        };
      `);
      const obj = $.deref("MyObject");
      expect(obj).toBeDefined();
      expect($.prop(obj, "value")).toBe(42);
      expect($.prop(obj, "name")).toBe("test");
    });

    it("creates object hierarchies", () => {
      const { $ } = run(`
        new SimGroup(Parent) {
          new ScriptObject(Child1) { id = 1; };
          new ScriptObject(Child2) { id = 2; };
        };
      `);
      const parent = $.deref("Parent");
      const child1 = $.deref("Child1");
      const child2 = $.deref("Child2");
      expect(parent).toBeDefined();
      expect(child1).toBeDefined();
      expect(child2).toBeDefined();
      // Verify children are tracked
      expect(parent._children).toContain(child1);
      expect(parent._children).toContain(child2);
    });

    it("calls methods on objects", () => {
      const { $g } = run(`
        function ScriptObject::getValue(%this) {
          return %this.value;
        }
        new ScriptObject(TestObj) { value = 42; };
        $result = TestObj.getValue();
      `);
      expect($g.get("result")).toBe(42);
    });

    it("sets properties on objects referenced by name (bareword)", () => {
      // This is the pattern used in mission files: Game.cdtrack = 2
      const { $ } = run(`
        new ScriptObject(Game) {
          class = "DefaultGame";
        };
        Game.cdtrack = 2;
        Game.musicTrack = "lush";
      `);
      const game = $.deref("Game");
      expect(game).toBeDefined();
      expect($.prop(game, "cdtrack")).toBe(2);
      expect($.prop(game, "musicTrack")).toBe("lush");
    });

    it("gets properties from objects referenced by name (bareword)", () => {
      const { $g } = run(`
        new ScriptObject(Config) {
          maxPlayers = 32;
          serverName = "Test Server";
        };
        $players = Config.maxPlayers;
        $name = Config.serverName;
      `);
      expect($g.get("players")).toBe(32);
      expect($g.get("name")).toBe("Test Server");
    });

    it("handles property access on non-existent objects gracefully", () => {
      const { $g } = run(`
        $value = NonExistent.property;
        NonExistent.property = 42;
      `);
      // Should return empty string for non-existent object
      expect($g.get("value")).toBe("");
    });

    it("resolves objects by numeric ID", () => {
      const { $ } = run(`
        new ScriptObject(TestObj) {
          value = 100;
        };
      `);
      const obj = $.deref("TestObj");
      const id = obj._id;

      // Access via ID should work the same as by name
      expect($.prop(id, "value")).toBe(100);
      $.setProp(id, "modified", true);
      expect($.prop(obj, "modified")).toBe(true);
    });

    it("handles direct indexed access on bareword objects", () => {
      // In TorqueScript, obj[idx] sets a property directly on the object
      const { $g } = run(`
        new ScriptObject(Data) {};
        Data[0] = "first";
        Data[1] = "second";
        $first = Data[0];
        $second = Data[1];
      `);
      expect($g.get("first")).toBe("first");
      expect($g.get("second")).toBe("second");
    });

    it("handles obj.prop[idx] syntax (combined field name)", () => {
      // In TorqueScript, obj.prop[idx] creates a field named "prop{idx}"
      // e.g., Data.items[0] creates field "items0" on Data
      const { $, $g } = run(`
        new ScriptObject(Data) {};
        Data.items[0] = "first";
        Data.items[1] = "second";
        $first = Data.items[0];
        $second = Data.items[1];
      `);
      const data = $.deref("Data");
      // Verify the fields are named items0, items1 (not nested)
      expect($.prop(data, "items0")).toBe("first");
      expect($.prop(data, "items1")).toBe("second");
      expect($g.get("first")).toBe("first");
      expect($g.get("second")).toBe("second");
    });

    it("handles post-increment on bareword object properties", () => {
      const { $g } = run(`
        new ScriptObject(Counter) {
          value = 10;
        };
        $before = Counter.value++;
        $after = Counter.value;
      `);
      expect($g.get("before")).toBe(10);
      expect($g.get("after")).toBe(11);
    });

    it("handles compound assignment on bareword object properties", () => {
      const { $g } = run(`
        new ScriptObject(Score) {
          points = 100;
        };
        Score.points += 50;
        $result = Score.points;
      `);
      expect($g.get("result")).toBe(150);
    });
  });

  describe("datablocks", () => {
    it("creates datablocks", () => {
      const { $ } = run(`
        datablock ItemData(Weapon) {
          damage = 10;
          range = 50;
        };
      `);
      const db = $.deref("Weapon");
      expect(db).toBeDefined();
      expect($.prop(db, "damage")).toBe(10);
      expect($.prop(db, "range")).toBe(50);
    });

    it("assigns datablock IDs starting at 3", () => {
      const { $ } = run(`
        datablock ItemData(FirstDatablock) {};
        datablock ItemData(SecondDatablock) {};
      `);
      const first = $.deref("FirstDatablock");
      const second = $.deref("SecondDatablock");
      expect(first._id).toBe(3);
      expect(second._id).toBe(4);
    });
  });

  describe("bitwise operations", () => {
    it("handles bitwise AND", () => {
      const { $g } = run(`$result = 0xFF & 0x0F;`);
      expect($g.get("result")).toBe(15);
    });

    it("handles bitwise OR", () => {
      const { $g } = run(`$result = 0xF0 | 0x0F;`);
      expect($g.get("result")).toBe(255);
    });

    it("handles bitwise XOR", () => {
      const { $g } = run(`$result = 0xFF ^ 0x0F;`);
      expect($g.get("result")).toBe(240);
    });

    it("handles left shift", () => {
      const { $g } = run(`$result = 1 << 4;`);
      expect($g.get("result")).toBe(16);
    });

    it("handles right shift", () => {
      const { $g } = run(`$result = 16 >> 2;`);
      expect($g.get("result")).toBe(4);
    });
  });

  describe("numeric coercion", () => {
    it("treats undefined variables as 0 in arithmetic", () => {
      const { $g } = run(`$result = $undefined + 5;`);
      expect($g.get("result")).toBe(5);
    });

    it("increments undefined variable from 0", () => {
      const { $g } = run(`$x++;`);
      expect($g.get("x")).toBe(1);
    });

    it("handles $x = $x + 1 on undefined variable", () => {
      const { $g } = run(`$x = $x + 1;`);
      expect($g.get("x")).toBe(1);
    });

    it("coerces string numbers in arithmetic", () => {
      const { $g } = run(`
        $a = "5";
        $b = "3";
        $result = $a + $b;
      `);
      expect($g.get("result")).toBe(8);
    });

    it("coerces empty string to 0", () => {
      const { $g } = run(`
        $a = "";
        $result = $a + 10;
      `);
      expect($g.get("result")).toBe(10);
    });

    it("handles division by zero (returns Infinity)", () => {
      const { $g } = run(`$result = 10 / 0;`);
      expect($g.get("result")).toBe(Infinity);
    });

    it("handles unary negation on strings", () => {
      const { $g } = run(`
        $a = "5";
        $result = -$a;
      `);
      expect($g.get("result")).toBe(-5);
    });

    it("compares strings numerically with ==", () => {
      const { $g } = run(`
        $a = "10";
        $b = 10;
        $result = $a == $b;
      `);
      expect($g.get("result")).toBe(true);
    });

    it("compares strings numerically with <", () => {
      const { $g } = run(`
        $a = "5";
        $b = "10";
        $result = $a < $b;
      `);
      // Numeric comparison: 5 < 10 = true
      // (String comparison would be false: "5" > "10")
      expect($g.get("result")).toBe(true);
    });

    it("handles compound assignment with coercion", () => {
      const { $g } = run(`
        $x = "5";
        $x += "3";
      `);
      expect($g.get("x")).toBe(8);
    });

    it("treats invalid strings as 0", () => {
      const { $g } = run(`
        $a = "hello";
        $result = $a + 5;
      `);
      // "hello" -> NaN -> 0
      expect($g.get("result")).toBe(5);
    });
  });

  describe("packages", () => {
    it("overrides functions when package is activated", () => {
      const { $g } = run(`
        function getMessage() {
          return "original";
        }
        $before = getMessage();

        package Override {
          function getMessage() {
            return "overridden";
          }
        };

        $stillOriginal = getMessage();
        activatePackage(Override);
        $after = getMessage();
      `);
      expect($g.get("before")).toBe("original");
      expect($g.get("stillOriginal")).toBe("original"); // not yet activated
      expect($g.get("after")).toBe("overridden");
    });

    it("calls parent function with Parent::", () => {
      const { $g } = run(`
        function getValue() {
          return "base";
        }

        package Extended {
          function getValue() {
            return "extended(" @ Parent::getValue() @ ")";
          }
        };

        activatePackage(Extended);
        $result = getValue();
      `);
      expect($g.get("result")).toBe("extended(base)");
    });

    it("handles nested Parent:: calls with multiple packages", () => {
      // This tests that Parent:: correctly calls the parent in the stack,
      // not just stack[length-2] which would cause infinite recursion
      const { $g } = run(`
        function getValue() {
          return "base";
        }

        package Pkg1 {
          function getValue() {
            return "pkg1(" @ Parent::getValue() @ ")";
          }
        };

        package Pkg2 {
          function getValue() {
            return "pkg2(" @ Parent::getValue() @ ")";
          }
        };

        activatePackage(Pkg1);
        activatePackage(Pkg2);
        $result = getValue();
      `);
      expect($g.get("result")).toBe("pkg2(pkg1(base))");
    });

    it("handles nested Parent:: calls with three packages", () => {
      const { $g } = run(`
        function getValue() {
          return "base";
        }

        package Pkg1 {
          function getValue() {
            return "p1(" @ Parent::getValue() @ ")";
          }
        };

        package Pkg2 {
          function getValue() {
            return "p2(" @ Parent::getValue() @ ")";
          }
        };

        package Pkg3 {
          function getValue() {
            return "p3(" @ Parent::getValue() @ ")";
          }
        };

        activatePackage(Pkg1);
        activatePackage(Pkg2);
        activatePackage(Pkg3);
        $result = getValue();
      `);
      expect($g.get("result")).toBe("p3(p2(p1(base)))");
    });

    it("handles nested Parent:: calls for methods", () => {
      const { $g } = run(`
        function TestClass::getValue(%this) {
          return "base";
        }

        package Pkg1 {
          function TestClass::getValue(%this) {
            return "pkg1(" @ Parent::getValue(%this) @ ")";
          }
        };

        package Pkg2 {
          function TestClass::getValue(%this) {
            return "pkg2(" @ Parent::getValue(%this) @ ")";
          }
        };

        activatePackage(Pkg1);
        activatePackage(Pkg2);

        %obj = new ScriptObject(TestObj) { class = "TestClass"; };
        $result = %obj.getValue();
      `);
      expect($g.get("result")).toBe("pkg2(pkg1(base))");
    });

    it("supports deferred activation (activatePackage before package is defined)", () => {
      // This matches Torque engine behavior where activatePackage can be
      // called before the package block is executed (common in mission scripts)
      const { $g } = run(`
        function getMessage() {
          return "original";
        }

        // Activate package BEFORE it's defined
        activatePackage(DeferredPkg);

        // At this point, package doesn't exist yet, but activation is remembered
        $beforeDefine = getMessage();

        // Now define the package - should auto-activate because we called
        // activatePackage earlier
        package DeferredPkg {
          function getMessage() {
            return "deferred override";
          }
        };

        $afterDefine = getMessage();
      `);
      expect($g.get("beforeDefine")).toBe("original");
      expect($g.get("afterDefine")).toBe("deferred override");
    });

    it("deferred activation is case-insensitive", () => {
      const { $g } = run(`
        function test() { return "base"; }

        activatePackage(MYPACKAGE);

        package myPackage {
          function test() { return "override"; }
        };

        $result = test();
      `);
      expect($g.get("result")).toBe("override");
    });
  });

  describe("namespace method calls", () => {
    it("calls methods via namespace syntax", () => {
      const { $g } = run(`
        function TestClass::init(%this, %name) {
          %this.name = %name;
          %this.value = 100;
        }

        function TestClass::getValue(%this) {
          return %this.value;
        }

        function runTest() {
          %obj = new ScriptObject() {};
          TestClass::init(%obj, "test");
          $name = %obj.name;
          $value = TestClass::getValue(%obj);
        }
        runTest();
      `);
      expect($g.get("name")).toBe("test");
      expect($g.get("value")).toBe(100);
    });
  });

  describe("dynamic object IDs", () => {
    it("assigns dynamic object IDs starting at 1027", () => {
      const { $ } = run(`
        new ScriptObject(FirstObject) {};
        new ScriptObject(SecondObject) {};
      `);
      const first = $.deref("FirstObject");
      const second = $.deref("SecondObject");
      expect(first._id).toBe(1027);
      expect(second._id).toBe(1028);
    });

    it("keeps object IDs unique after many datablocks", () => {
      const { $, state } = run(``);

      for (let i = 0; i < 1200; i += 1) {
        $.datablock("ItemData", `Db${i}`, null, {});
      }

      const datablock = state.datablocks.get("Db1199");
      expect(datablock).toBeDefined();

      const object = $.create("ScriptObject", "AfterDatablocks", {});
      expect(state.objectsById.get(datablock!._id)).toBe(datablock);
      expect(state.objectsById.get(object._id)).toBe(object);
      expect(object._id).toBeGreaterThan(datablock!._id);
    });
  });

  describe("object path resolution (nameToID)", () => {
    it("resolves simple object names", () => {
      const { $, $g } = run(`
        new SimGroup(MissionGroup) {};
        $id = nameToID("MissionGroup");
      `);
      const obj = $.deref("MissionGroup");
      expect($g.get("id")).toBe(obj._id);
    });

    it("returns -1 for non-existent objects", () => {
      const { $g } = run(`
        $id = nameToID("NonExistent");
      `);
      expect($g.get("id")).toBe(-1);
    });

    it("resolves path with children using /", () => {
      const { $, $g } = run(`
        new SimGroup(MissionGroup) {
          new SimGroup(Teams) {
            new SimGroup(team0) {};
            new SimGroup(team1) {};
          };
        };
        $team0Id = nameToID("MissionGroup/Teams/team0");
        $team1Id = nameToID("MissionGroup/Teams/team1");
        $teamsId = nameToID("MissionGroup/Teams");
      `);
      const team0 = $.deref("team0");
      const team1 = $.deref("team1");
      const teams = $.deref("Teams");
      expect($g.get("team0Id")).toBe(team0._id);
      expect($g.get("team1Id")).toBe(team1._id);
      expect($g.get("teamsId")).toBe(teams._id);
    });

    it("returns -1 when path segment not found", () => {
      const { $g } = run(`
        new SimGroup(MissionGroup) {
          new SimGroup(Teams) {};
        };
        $id = nameToID("MissionGroup/Teams/team0");
      `);
      expect($g.get("id")).toBe(-1);
    });

    it("resolves paths with leading slash", () => {
      const { $, $g } = run(`
        new SimGroup(MissionGroup) {
          new SimGroup(Teams) {};
        };
        $id = nameToID("/MissionGroup/Teams");
      `);
      const teams = $.deref("Teams");
      expect($g.get("id")).toBe(teams._id);
    });

    it("resolves numeric object IDs", () => {
      const { $ } = run(`
        new SimGroup(MissionGroup) {};
      `);
      const obj = $.deref("MissionGroup");
      // Test path resolution with numeric ID
      const found = $.deref(String(obj._id));
      expect(found).toBe(obj);
    });

    it("is case-insensitive for path segments", () => {
      const { $, $g } = run(`
        new SimGroup(MissionGroup) {
          new SimGroup(Teams) {
            new SimGroup(team0) {};
          };
        };
        $id = nameToID("missiongroup/TEAMS/Team0");
      `);
      const team0 = $.deref("team0");
      expect($g.get("id")).toBe(team0._id);
    });
  });

  describe("built-in functions", () => {
    it("strlen returns string length", () => {
      const { $g } = run(`
        $result = strlen("Hello");
      `);
      expect($g.get("result")).toBe(5);
    });

    it("strLen is case-insensitive", () => {
      const { $g } = run(`
        $result = STRLEN("test");
      `);
      expect($g.get("result")).toBe(4);
    });

    it("getWord extracts words by index", () => {
      const { $g } = run(`
        $first = getWord("one two three", 0);
        $second = getWord("one two three", 1);
        $third = getWord("one two three", 2);
      `);
      expect($g.get("first")).toBe("one");
      expect($g.get("second")).toBe("two");
      expect($g.get("third")).toBe("three");
    });

    it("getWordCount counts words", () => {
      const { $g } = run(`
        $result = getWordCount("one two three four");
      `);
      expect($g.get("result")).toBe(4);
    });

    it("strUpr converts to uppercase", () => {
      const { $g } = run(`
        $result = strUpr("hello");
      `);
      expect($g.get("result")).toBe("HELLO");
    });

    it("strLwr converts to lowercase", () => {
      const { $g } = run(`
        $result = strLwr("HELLO");
      `);
      expect($g.get("result")).toBe("hello");
    });

    it("getSubStr extracts substring", () => {
      const { $g } = run(`
        $result = getSubStr("Hello World", 0, 5);
      `);
      expect($g.get("result")).toBe("Hello");
    });

    it("strStr finds substring position", () => {
      const { $g } = run(`
        $found = strStr("Hello World", "World");
        $notFound = strStr("Hello World", "xyz");
      `);
      expect($g.get("found")).toBe(6);
      expect($g.get("notFound")).toBe(-1);
    });

    it("mFloor floors numbers", () => {
      const { $g } = run(`
        $result = mFloor(3.7);
      `);
      expect($g.get("result")).toBe(3);
    });

    it("mCeil ceils numbers", () => {
      const { $g } = run(`
        $result = mCeil(3.2);
      `);
      expect($g.get("result")).toBe(4);
    });

    it("mAbs returns absolute value", () => {
      const { $g } = run(`
        $pos = mAbs(5);
        $neg = mAbs(-5);
      `);
      expect($g.get("pos")).toBe(5);
      expect($g.get("neg")).toBe(5);
    });

    it("mSqrt returns square root", () => {
      const { $g } = run(`
        $result = mSqrt(16);
      `);
      expect($g.get("result")).toBe(4);
    });

    it("mPow raises to power", () => {
      const { $g } = run(`
        $result = mPow(2, 8);
      `);
      expect($g.get("result")).toBe(256);
    });

    it("getRandom returns number in range", () => {
      const { $g } = run(`
        $result = getRandom(1, 10);
      `);
      const result = $g.get("result");
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(10);
    });

    it("isActivePackage checks if package is active", () => {
      const { $g } = run(`
        $beforeDefine = isActivePackage(TestPkg);

        package TestPkg {
          function dummy() { return 1; }
        };

        $afterDefine = isActivePackage(TestPkg);
        activatePackage(TestPkg);
        $afterActivate = isActivePackage(TestPkg);
      `);
      expect($g.get("beforeDefine")).toBe(false);
      expect($g.get("afterDefine")).toBe(false); // defined but not active
      expect($g.get("afterActivate")).toBe(true);
    });

    it("getPackageList returns active packages", () => {
      const { $g } = run(`
        package Pkg1 { function f1() {} };
        package Pkg2 { function f2() {} };
        $empty = getPackageList();
        activatePackage(Pkg1);
        activatePackage(Pkg2);
        $list = getPackageList();
      `);
      expect($g.get("empty")).toBe("");
      expect($g.get("list")).toBe("Pkg1 Pkg2");
    });
  });

  describe("vector math", () => {
    it("vectorAdd adds vectors", () => {
      const { $g } = run(`
        $result = vectorAdd("1 2 3", "4 5 6");
      `);
      expect($g.get("result")).toBe("5 7 9");
    });

    it("vectorSub subtracts vectors", () => {
      const { $g } = run(`
        $result = vectorSub("5 7 9", "4 5 6");
      `);
      expect($g.get("result")).toBe("1 2 3");
    });

    it("vectorScale scales a vector", () => {
      const { $g } = run(`
        $result = vectorScale("1 2 3", 2);
      `);
      expect($g.get("result")).toBe("2 4 6");
    });

    it("vectorDot computes dot product", () => {
      const { $g } = run(`
        $result = vectorDot("1 2 3", "4 5 6");
      `);
      // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
      expect($g.get("result")).toBe(32);
    });

    it("vectorCross computes cross product", () => {
      const { $g } = run(`
        $result = vectorCross("1 0 0", "0 1 0");
      `);
      expect($g.get("result")).toBe("0 0 1");
    });

    it("vectorLen computes vector length", () => {
      const { $g } = run(`
        $result = vectorLen("3 4 0");
      `);
      expect($g.get("result")).toBe(5);
    });

    it("vectorNormalize normalizes a vector", () => {
      const { $g } = run(`
        $result = vectorNormalize("3 0 0");
      `);
      expect($g.get("result")).toBe("1 0 0");
    });

    it("vectorDist computes distance between points", () => {
      const { $g } = run(`
        $result = vectorDist("0 0 0", "3 4 0");
      `);
      expect($g.get("result")).toBe(5);
    });

    it("getWord extracts vector components", () => {
      const { $g } = run(`
        $x = getWord("10 20 30", 0);
        $y = getWord("10 20 30", 1);
        $z = getWord("10 20 30", 2);
      `);
      expect($g.get("x")).toBe("10");
      expect($g.get("y")).toBe("20");
      expect($g.get("z")).toBe("30");
    });
  });

  describe("runtime API (direct usage)", () => {
    it("registerFunction and call via $f", () => {
      const { $, $f } = createRuntime();
      $.registerFunction("myFunc", (arg: number) => arg * 2);
      expect($f.call("myfunc", 21)).toBe(42);
      expect($f.call("MYFUNC", 10)).toBe(20);
    });

    it("registerMethod and call via $.call", () => {
      const { $ } = createRuntime();
      $.registerMethod("Player", "damage", (this_: any, amount: number) => {
        return $.prop(this_, "health") - amount;
      });
      const player = $.create("Player", "TestPlayer", { health: 100 });
      expect($.call(player, "damage", 25)).toBe(75);
    });

    it("$.concat joins strings", () => {
      const { $ } = createRuntime();
      expect($.concat("Hello", " ", "World")).toBe("Hello World");
      expect($.concat("a", "b", "c")).toBe("abc");
    });

    it("$.streq compares strings case-insensitively", () => {
      const { $ } = createRuntime();
      expect($.streq("Hello", "HELLO")).toBe(true);
      expect($.streq("Hello", "World")).toBe(false);
    });

    it("$.mod performs integer modulo", () => {
      const { $ } = createRuntime();
      expect($.mod(10, 3)).toBe(1);
      expect($.mod(15, 4)).toBe(3);
    });

    it("$.prop and $.setProp handle case-insensitive properties", () => {
      const { $ } = createRuntime();
      const obj = $.create("Item", null, { MaxAmmo: 50 });
      expect($.prop(obj, "maxammo")).toBe(50);
      expect($.prop(obj, "MAXAMMO")).toBe(50);
      $.setProp(obj, "maxammo", 100);
      expect($.prop(obj, "MaxAmmo")).toBe(100);
    });

    it("$.datablock creates datablocks with inheritance", () => {
      const { $ } = createRuntime();
      $.datablock("ItemData", "BaseWeapon", null, { damage: 10, range: 100 });
      $.datablock("ItemData", "Rifle", "BaseWeapon", { damage: 25 });

      const base = $.deref("BaseWeapon");
      const rifle = $.deref("Rifle");

      expect($.prop(base, "damage")).toBe(10);
      expect($.prop(base, "range")).toBe(100);
      expect($.prop(rifle, "damage")).toBe(25);
      expect($.prop(rifle, "range")).toBe(100); // inherited
    });

    it("$.package defines and $.activatePackage activates", () => {
      const { $, $f } = createRuntime();
      $.registerFunction("getMessage", () => "original");
      expect($f.call("getMessage")).toBe("original");

      $.package("TestPackage", () => {
        $.registerFunction("getMessage", () => "overridden");
      });
      expect($f.call("getMessage")).toBe("original"); // not yet activated

      $.activatePackage("TestPackage");
      expect($f.call("getMessage")).toBe("overridden");
    });

    it("state tracks registered items", () => {
      const { $, $g, state } = createRuntime();
      $.registerFunction("func1", () => {});
      $.registerFunction("func2", () => {});
      $g.set("var1", 1);
      $g.set("var2", 2);
      $.create("Item", "item1", {});

      expect(state.functions.size).toBe(2);
      expect(state.globals.size).toBe(2);
      expect(state.objectsByName.size).toBe(1);
    });
  });

  describe("complex scripts", () => {
    it("sets globals and registers methods", () => {
      const { $g, state } = run(`
        $Game::numRoles = 3;
        $Game::role0 = "Goalie";
        $Game::role1 = "Defense";
        $Game::role2 = "Offense";

        function MyGame::onStart(%game) {
          return "started";
        }
      `);

      expect($g.get("Game::numRoles")).toBe(3);
      expect($g.get("Game::role0")).toBe("Goalie");
      expect($g.get("Game::role1")).toBe("Defense");
      expect($g.get("Game::role2")).toBe("Offense");
      expect(state.methods.has("MyGame")).toBe(true);
    });

    it("creates nested object hierarchies like mission files", () => {
      const { $, state } = run(`
        new SimGroup(MissionGroup) {
          new TerrainBlock(Terrain) {
            size = 1024;
          };
          new Sky(Sky) {
            cloudSpeed = 1.5;
          };
          new SimGroup(PlayerDropPoints) {
            new SpawnSphere(Spawn1) { position = "0 0 100"; };
            new SpawnSphere(Spawn2) { position = "100 0 100"; };
          };
        };
      `);

      const missionGroup = $.deref("MissionGroup");
      expect(missionGroup).toBeDefined();
      expect(missionGroup._className).toBe("SimGroup");

      expect($.deref("Terrain")).toBeDefined();
      expect($.deref("Sky")).toBeDefined();
      expect($.deref("Spawn1")).toBeDefined();
      expect($.deref("Spawn2")).toBeDefined();
      expect(state.objectsByName.size).toBe(6);
    });

    it("supports namespace method calls", () => {
      const { $g } = run(`
        function BaseGame::getValue(%game) {
          return 10;
        }

        function BaseGame::getDoubled(%game) {
          return BaseGame::getValue(%game) * 2;
        }

        $base = BaseGame::getValue(0);
        $doubled = BaseGame::getDoubled(0);
      `);

      expect($g.get("base")).toBe(10);
      expect($g.get("doubled")).toBe(20);
    });

    it("generates parent calls in transpiled code", () => {
      const { code } = transpile(`
        function MyGame::onEnd(%game) {
          Parent::onEnd(%game);
        }
      `);
      expect(code).toContain("$.parent(");
    });
  });

  describe("exec() with loadScript", () => {
    function createLoader(
      files: Record<string, string>,
    ): (path: string) => Promise<string | null> {
      // Loader normalizes paths itself (slashes + lowercase)
      return async (path: string) =>
        files[path.replace(/\\/g, "/").toLowerCase()] ?? null;
    }

    it("executes scripts via exec()", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/utils.cs": "$UtilsLoaded = true;",
        }),
      });

      const script = await runtime.loadFromSource('exec("scripts/utils.cs");');
      script.execute();

      expect(runtime.$g.get("UtilsLoaded")).toBe(true);
    });

    it("handles chained exec() calls", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/a.cs": 'exec("scripts/b.cs"); $ALoaded = true;',
          "scripts/b.cs": 'exec("scripts/c.cs"); $BLoaded = true;',
          "scripts/c.cs": "$CLoaded = true;",
        }),
      });

      const script = await runtime.loadFromSource('exec("scripts/a.cs");');
      script.execute();

      expect(runtime.$g.get("ALoaded")).toBe(true);
      expect(runtime.$g.get("BLoaded")).toBe(true);
      expect(runtime.$g.get("CLoaded")).toBe(true);
    });

    it("only executes each script once", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/counter.cs": "$LoadCount = $LoadCount + 1;",
        }),
      });

      const script = await runtime.loadFromSource(`
        exec("scripts/counter.cs");
        exec("scripts/counter.cs");
        exec("scripts/counter.cs");
      `);
      script.execute();

      // Script should only be executed once
      expect(runtime.$g.get("LoadCount")).toBe(1);
    });

    it("normalizes backslashes to forward slashes", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/utils.cs": "$Loaded = true;",
        }),
      });

      const script = await runtime.loadFromSource(
        'exec("scripts\\\\utils.cs");',
      );
      script.execute();

      expect(runtime.$g.get("Loaded")).toBe(true);
    });

    describe("path normalization for state tracking", () => {
      it("treats different cases as the same file for loaded scripts", async () => {
        let loadCount = 0;
        const runtime = createRuntime({
          loadScript: async (path) => {
            loadCount++;
            if (path.toLowerCase() === "scripts/test.cs") {
              return "$LoadCount = $LoadCount + 1;";
            }
            return null;
          },
        });

        // Load with different cases - should only call loader once
        await runtime.loadFromPath("scripts/test.cs");
        await runtime.loadFromPath("Scripts/Test.cs");
        await runtime.loadFromPath("SCRIPTS/TEST.CS");

        expect(loadCount).toBe(1);
      });

      it("treats different slashes as the same file for loaded scripts", async () => {
        let loadCount = 0;
        const runtime = createRuntime({
          loadScript: async (path) => {
            loadCount++;
            if (path.replace(/\\/g, "/").toLowerCase() === "scripts/test.cs") {
              return "$LoadCount = $LoadCount + 1;";
            }
            return null;
          },
        });

        // Load with different slash styles - should only call loader once
        await runtime.loadFromPath("scripts/test.cs");
        await runtime.loadFromPath("scripts\\test.cs");

        expect(loadCount).toBe(1);
      });

      it("treats different cases as the same file for failed scripts", async () => {
        let loadCount = 0;
        const runtime = createRuntime({
          loadScript: async () => {
            loadCount++;
            return null; // Script not found
          },
        });

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Try to load with different cases - should only call loader once
        const script = await runtime.loadFromSource(`
          exec("scripts/missing.cs");
          exec("Scripts/Missing.cs");
          exec("SCRIPTS/MISSING.CS");
        `);
        script.execute();

        warnSpy.mockRestore();

        // Loader should only be called once since subsequent attempts
        // see it's already in failedScripts
        expect(loadCount).toBe(1);
      });

      it("treats different slashes as the same file for failed scripts", async () => {
        let loadCount = 0;
        const runtime = createRuntime({
          loadScript: async () => {
            loadCount++;
            return null; // Script not found
          },
        });

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Try to load with different slash styles
        const script = await runtime.loadFromSource(`
          exec("scripts/missing.cs");
          exec("scripts\\\\missing.cs");
        `);
        script.execute();

        warnSpy.mockRestore();
        expect(loadCount).toBe(1);
      });

      it("treats different cases as the same file for executed scripts", async () => {
        const runtime = createRuntime({
          loadScript: createLoader({
            "scripts/counter.cs": "$Counter = $Counter + 1;",
          }),
        });

        runtime.$g.set("Counter", 0);

        const script = await runtime.loadFromSource(`
          exec("scripts/counter.cs");
          exec("Scripts/Counter.cs");
          exec("SCRIPTS/COUNTER.CS");
        `);
        script.execute();

        // Script should only execute once despite different cases
        expect(runtime.$g.get("Counter")).toBe(1);
      });

      it("treats different slashes as the same file for executed scripts", async () => {
        const runtime = createRuntime({
          loadScript: createLoader({
            "scripts/counter.cs": "$Counter = $Counter + 1;",
          }),
        });

        runtime.$g.set("Counter", 0);

        const script = await runtime.loadFromSource(`
          exec("scripts/counter.cs");
          exec("scripts\\\\counter.cs");
        `);
        script.execute();

        // Script should only execute once despite different slashes
        expect(runtime.$g.get("Counter")).toBe(1);
      });

      it("caches sequential loads with different cases", async () => {
        let loadCount = 0;
        const runtime = createRuntime({
          loadScript: async (path) => {
            loadCount++;
            if (path.toLowerCase() === "scripts/test.cs") {
              return "$Loaded = true;";
            }
            return null;
          },
        });

        // Load same file with different cases sequentially
        await runtime.loadFromPath("scripts/test.cs");
        await runtime.loadFromPath("Scripts/Test.cs");
        await runtime.loadFromPath("SCRIPTS/TEST.CS");

        // Should only load once since cached after first load
        expect(loadCount).toBe(1);
      });

      it("caches sequential loads with different slashes", async () => {
        let loadCount = 0;
        const runtime = createRuntime({
          loadScript: async (path) => {
            loadCount++;
            if (path.replace(/\\/g, "/").toLowerCase() === "scripts/test.cs") {
              return "$Loaded = true;";
            }
            return null;
          },
        });

        // Load same file with different slashes sequentially
        await runtime.loadFromPath("scripts/test.cs");
        await runtime.loadFromPath("scripts\\test.cs");

        // Should only load once since cached after first load
        expect(loadCount).toBe(1);
      });

      it("handles combined case and slash differences", async () => {
        let loadCount = 0;
        const runtime = createRuntime({
          loadScript: async (path) => {
            loadCount++;
            if (path.replace(/\\/g, "/").toLowerCase() === "scripts/test.cs") {
              return "$Counter = $Counter + 1;";
            }
            return null;
          },
        });

        runtime.$g.set("Counter", 0);

        const script = await runtime.loadFromSource(`
          exec("scripts/test.cs");
          exec("Scripts\\\\Test.cs");
          exec("SCRIPTS/TEST.CS");
          exec("scripts\\\\TEST.CS");
        `);
        script.execute();

        // All variations should be treated as the same file
        expect(loadCount).toBe(1);
        expect(runtime.$g.get("Counter")).toBe(1);
      });
    });

    it("returns false when script is not found", async () => {
      const runtime = createRuntime({
        loadScript: async () => null,
      });

      // Loading should warn but not throw
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const script = await runtime.loadFromSource(
        '$Result = exec("scripts/missing.cs");',
      );
      warnSpy.mockRestore();

      // Execution should warn and set $Result to false
      const warnSpy2 = vi.spyOn(console, "warn").mockImplementation(() => {});
      script.execute();
      expect(warnSpy2).toHaveBeenCalledWith(
        'exec("scripts/missing.cs"): script not found',
      );
      warnSpy2.mockRestore();
      expect(runtime.$g.get("Result")).toBe(false);
    });

    it("returns false when exec called without loadScript", async () => {
      const runtime = createRuntime();

      // Warn about missing loader during load
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const script = await runtime.loadFromSource(
        '$Result = exec("scripts/test.cs");',
      );
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();

      // Execution should warn and set $Result to false
      const warnSpy2 = vi.spyOn(console, "warn").mockImplementation(() => {});
      script.execute();
      expect(warnSpy2).toHaveBeenCalledWith(
        'exec("scripts/test.cs"): script not found',
      );
      warnSpy2.mockRestore();
      expect(runtime.$g.get("Result")).toBe(false);
    });

    it("returns false and logs error when exec called without extension", async () => {
      // Engine requires file extension (matches tribes2-engine/TorqueSDK-1.2 behavior)
      const runtime = createRuntime();

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const script = await runtime.loadFromSource(
        '$Result = exec("scripts/noextension");',
      );
      script.execute();
      expect(errorSpy).toHaveBeenCalledWith(
        'exec: invalid script file name "scripts/noextension".',
      );
      errorSpy.mockRestore();
      debugSpy.mockRestore();
      expect(runtime.$g.get("Result")).toBe(false);
    });

    it("shares globals between exec'd scripts", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/setter.cs": "$SharedValue = 42;",
          "scripts/getter.cs": "$ReadValue = $SharedValue;",
        }),
      });

      const script = await runtime.loadFromSource(`
        exec("scripts/setter.cs");
        exec("scripts/getter.cs");
      `);
      script.execute();

      expect(runtime.$g.get("SharedValue")).toBe(42);
      expect(runtime.$g.get("ReadValue")).toBe(42);
    });

    it("shares functions between exec'd scripts", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/define.cs": 'function helper() { return "from helper"; }',
          "scripts/use.cs": "$Result = helper();",
        }),
      });

      const script = await runtime.loadFromSource(`
        exec("scripts/define.cs");
        exec("scripts/use.cs");
      `);
      script.execute();

      expect(runtime.$g.get("Result")).toBe("from helper");
    });
  });

  describe("loadFromSource", () => {
    it("loads and executes a script from source", async () => {
      const runtime = createRuntime();
      const script = await runtime.loadFromSource("$Loaded = 1;");
      script.execute();

      expect(runtime.$g.get("Loaded")).toBe(1);
    });

    it("loads dependencies via loadScript option", async () => {
      const runtime = createRuntime({
        loadScript: async (path) => {
          if (path.toLowerCase() === "scripts/dep.cs") {
            return "$DepLoaded = 1;";
          }
          return null;
        },
      });

      const script = await runtime.loadFromSource(
        'exec("scripts/dep.cs"); $MainLoaded = 1;',
      );
      script.execute();

      expect(runtime.$g.get("DepLoaded")).toBe(1);
      expect(runtime.$g.get("MainLoaded")).toBe(1);
    });

    it("skips missing dependencies with warning", async () => {
      const runtime = createRuntime({
        loadScript: async () => null,
      });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await runtime.loadFromSource('exec("scripts/missing.cs");');

      expect(warnSpy).toHaveBeenCalledWith(
        "Script not found: scripts/missing.cs",
      );
      warnSpy.mockRestore();
    });
  });

  describe("loadFromAST", () => {
    it("loads and executes a script from AST", async () => {
      const ast = parse("$FromAST = 42;");
      const runtime = createRuntime();
      const script = await runtime.loadFromAST(ast);
      script.execute();

      expect(runtime.$g.get("FromAST")).toBe(42);
    });

    it("loads dependencies via loadScript option", async () => {
      const runtime = createRuntime({
        loadScript: async (path) => {
          if (path.toLowerCase() === "scripts/dep.cs") {
            return "$DepValue = 100;";
          }
          return null;
        },
      });

      const ast = parse('exec("scripts/dep.cs"); $MainValue = $DepValue + 1;');
      const script = await runtime.loadFromAST(ast);
      script.execute();

      expect(runtime.$g.get("DepValue")).toBe(100);
      expect(runtime.$g.get("MainValue")).toBe(101);
    });
  });

  describe("loadFromPath", () => {
    it("loads a script by path using loadScript option", async () => {
      const runtime = createRuntime({
        loadScript: async (path) => {
          if (path.toLowerCase() === "scripts/test.cs") {
            return "$PathLoaded = 1;";
          }
          return null;
        },
      });

      const script = await runtime.loadFromPath("scripts/test.cs");
      script.execute();

      expect(runtime.$g.get("PathLoaded")).toBe(1);
    });

    it("recursively loads dependencies", async () => {
      const sources: Record<string, string> = {
        "scripts/main.cs": 'exec("scripts/a.cs"); $Main = 1;',
        "scripts/a.cs": 'exec("scripts/b.cs"); $A = 1;',
        "scripts/b.cs": "$B = 1;",
      };

      const runtime = createRuntime({
        loadScript: async (path) => sources[path.toLowerCase()] ?? null,
      });

      const script = await runtime.loadFromPath("scripts/main.cs");
      script.execute();

      expect(runtime.$g.get("Main")).toBe(1);
      expect(runtime.$g.get("A")).toBe(1);
      expect(runtime.$g.get("B")).toBe(1);
    });

    it("throws when loadScript not provided", async () => {
      const runtime = createRuntime();

      await expect(runtime.loadFromPath("scripts/test.cs")).rejects.toThrow(
        "loadFromPath requires loadScript option to be set",
      );
    });

    it("throws when script not found", async () => {
      const runtime = createRuntime({
        loadScript: async () => null,
      });

      await expect(runtime.loadFromPath("scripts/missing.cs")).rejects.toThrow(
        "Script not found: scripts/missing.cs",
      );
    });

    it("handles circular dependencies", async () => {
      const sources: Record<string, string> = {
        "scripts/a.cs": 'exec("scripts/b.cs"); $A = 1;',
        "scripts/b.cs": 'exec("scripts/a.cs"); $B = 1;',
      };
      const runtime = createRuntime({
        loadScript: async (path) => sources[path.toLowerCase()] ?? null,
      });

      // Should not hang or throw
      const script = await runtime.loadFromPath("scripts/a.cs");
      script.execute();

      expect(runtime.$g.get("A")).toBe(1);
      expect(runtime.$g.get("B")).toBe(1);
    });

    it("does not reload already loaded scripts", async () => {
      let loadCount = 0;
      const runtime = createRuntime({
        loadScript: async (path) => {
          if (path.toLowerCase() === "scripts/test.cs") {
            loadCount++;
            return "$Value = $Value + 1;";
          }
          return null;
        },
      });
      runtime.$g.set("Value", 0);

      await runtime.loadFromPath("scripts/test.cs");
      await runtime.loadFromPath("scripts/test.cs");

      expect(loadCount).toBe(1); // Only loaded once
    });

    it("handles diamond dependencies (parallel deduplication)", async () => {
      // A depends on B and C, both B and C depend on D
      // D should only be loaded once
      let dLoadCount = 0;
      const sources: Record<string, string> = {
        "scripts/a.cs": 'exec("scripts/b.cs"); exec("scripts/c.cs"); $A = 1;',
        "scripts/b.cs": 'exec("scripts/d.cs"); $B = 1;',
        "scripts/c.cs": 'exec("scripts/d.cs"); $C = 1;',
        "scripts/d.cs": "$D = 1;",
      };
      const runtime = createRuntime({
        loadScript: async (path) => {
          if (path === "scripts/d.cs") dLoadCount++;
          return sources[path] ?? null;
        },
      });

      const script = await runtime.loadFromPath("scripts/a.cs");
      script.execute();

      expect(dLoadCount).toBe(1); // D loaded only once despite being dep of both B and C
      expect(runtime.$g.get("A")).toBe(1);
      expect(runtime.$g.get("B")).toBe(1);
      expect(runtime.$g.get("C")).toBe(1);
      expect(runtime.$g.get("D")).toBe(1);
    });

    it("handles longer cycles not involving main script (A → B → C → B)", async () => {
      const sources: Record<string, string> = {
        "scripts/a.cs": 'exec("scripts/b.cs"); $A = 1;',
        "scripts/b.cs": 'exec("scripts/c.cs"); $B = 1;',
        "scripts/c.cs": 'exec("scripts/b.cs"); $C = 1;', // Cycle back to B
      };
      const runtime = createRuntime({
        loadScript: async (path) => sources[path] ?? null,
      });

      // Should not hang
      const script = await runtime.loadFromPath("scripts/a.cs");
      script.execute();

      expect(runtime.$g.get("A")).toBe(1);
      expect(runtime.$g.get("B")).toBe(1);
      expect(runtime.$g.get("C")).toBe(1);
    });

    it("handles multiple scripts depending on each other in complex patterns", async () => {
      // A → [B, C], B → [D, E], C → [E, F], D → G, E → G, F → G
      // G should only be loaded once
      let gLoadCount = 0;
      const sources: Record<string, string> = {
        "scripts/a.cs": 'exec("scripts/b.cs"); exec("scripts/c.cs"); $A = 1;',
        "scripts/b.cs": 'exec("scripts/d.cs"); exec("scripts/e.cs"); $B = 1;',
        "scripts/c.cs": 'exec("scripts/e.cs"); exec("scripts/f.cs"); $C = 1;',
        "scripts/d.cs": 'exec("scripts/g.cs"); $D = 1;',
        "scripts/e.cs": 'exec("scripts/g.cs"); $E = 1;',
        "scripts/f.cs": 'exec("scripts/g.cs"); $F = 1;',
        "scripts/g.cs": "$G = 1;",
      };
      const runtime = createRuntime({
        loadScript: async (path) => {
          if (path === "scripts/g.cs") gLoadCount++;
          return sources[path] ?? null;
        },
      });

      const script = await runtime.loadFromPath("scripts/a.cs");
      script.execute();

      expect(gLoadCount).toBe(1); // G loaded only once
      expect(runtime.$g.get("A")).toBe(1);
      expect(runtime.$g.get("G")).toBe(1);
    });

    it("continues loading other scripts when one fails", async () => {
      const sources: Record<string, string> = {
        "scripts/main.cs":
          'exec("scripts/good.cs"); exec("scripts/bad.cs"); exec("scripts/also-good.cs"); $Main = 1;',
        "scripts/good.cs": "$Good = 1;",
        // bad.cs is missing
        "scripts/also-good.cs": "$AlsoGood = 1;",
      };
      const runtime = createRuntime({
        loadScript: async (path) => sources[path] ?? null,
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const script = await runtime.loadFromPath("scripts/main.cs");
      script.execute();
      warnSpy.mockRestore();

      // Good scripts should still be loaded and executed
      expect(runtime.$g.get("Main")).toBe(1);
      expect(runtime.$g.get("Good")).toBe(1);
      expect(runtime.$g.get("AlsoGood")).toBe(1);
    });

    it("handles parse errors gracefully without blocking other scripts", async () => {
      const sources: Record<string, string> = {
        "scripts/main.cs":
          'exec("scripts/good.cs"); exec("scripts/bad-syntax.cs"); $Main = 1;',
        "scripts/good.cs": "$Good = 1;",
        "scripts/bad-syntax.cs": "this is not valid { syntax",
      };
      const runtime = createRuntime({
        loadScript: async (path) => sources[path] ?? null,
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const script = await runtime.loadFromPath("scripts/main.cs");
      script.execute();
      warnSpy.mockRestore();

      expect(runtime.$g.get("Main")).toBe(1);
      expect(runtime.$g.get("Good")).toBe(1);
    });

    it("respects pre-aborted signal when loading dependencies", async () => {
      const controller = new AbortController();
      controller.abort(); // Abort before starting

      let loaderCalled = false;
      const runtime = createRuntime({
        loadScript: async () => {
          loaderCalled = true;
          return "$X = 1;";
        },
        signal: controller.signal,
      });

      // Load a script that has dependencies - should throw when trying to load deps
      await expect(
        runtime.loadFromSource('exec("scripts/dep.cs"); $Main = 1;'),
      ).rejects.toThrow();
      expect(loaderCalled).toBe(false); // Loader should never be called
    });

    it("loads scripts in parallel (not serially)", async () => {
      const loadOrder: string[] = [];
      const sources: Record<string, string> = {
        "scripts/main.cs":
          'exec("scripts/a.cs"); exec("scripts/b.cs"); exec("scripts/c.cs");',
        "scripts/a.cs": "$A = 1;",
        "scripts/b.cs": "$B = 1;",
        "scripts/c.cs": "$C = 1;",
      };

      const runtime = createRuntime({
        loadScript: async (path) => {
          loadOrder.push(`start:${path}`);
          // Small delay to allow interleaving
          await new Promise((resolve) => setTimeout(resolve, 10));
          loadOrder.push(`end:${path}`);
          return sources[path] ?? null;
        },
      });

      await runtime.loadFromPath("scripts/main.cs");

      // If parallel: starts happen before all ends
      // If serial: each end would happen before the next start
      const bStart = loadOrder.indexOf("start:scripts/b.cs");
      const cStart = loadOrder.indexOf("start:scripts/c.cs");
      const aEnd = loadOrder.indexOf("end:scripts/a.cs");

      // All starts should happen before any of them ends (parallel behavior)
      expect(bStart).toBeLessThan(aEnd);
      expect(cStart).toBeLessThan(aEnd);
    });
  });

  describe("path option", () => {
    it("loadFromSource with path prevents re-execution via exec()", async () => {
      const runtime = createRuntime({
        loadScript: async () => null,
      });

      const script = await runtime.loadFromSource("$Value = $Value + 1;", {
        path: "scripts/main.cs",
      });
      runtime.$g.set("Value", 0);
      script.execute();

      expect(runtime.$g.get("Value")).toBe(1);

      // Now try to exec the same path - should be a no-op
      const script2 = await runtime.loadFromSource(
        'exec("scripts/main.cs"); $AfterExec = $Value;',
      );
      script2.execute();

      // Value should still be 1, not 2
      expect(runtime.$g.get("Value")).toBe(1);
      expect(runtime.$g.get("AfterExec")).toBe(1);
    });

    it("loadFromAST with path prevents re-execution via exec()", async () => {
      const runtime = createRuntime({
        loadScript: async () => null,
      });

      const ast = parse("$Value = $Value + 1;");
      const script = await runtime.loadFromAST(ast, {
        path: "scripts/main.cs",
      });
      runtime.$g.set("Value", 0);
      script.execute();

      expect(runtime.$g.get("Value")).toBe(1);

      // Now try to exec the same path - should be a no-op
      const script2 = await runtime.loadFromSource(
        'exec("scripts/main.cs"); $AfterExec = $Value;',
      );
      script2.execute();

      // Value should still be 1, not 2
      expect(runtime.$g.get("Value")).toBe(1);
      expect(runtime.$g.get("AfterExec")).toBe(1);
    });

    it("path is normalized for comparison", async () => {
      const runtime = createRuntime({
        loadScript: async () => null,
      });

      const script = await runtime.loadFromSource("$Value = $Value + 1;", {
        path: "Scripts\\Main.cs",
      });
      runtime.$g.set("Value", 0);
      script.execute();

      // exec with different casing/slashes should still match
      const script2 = await runtime.loadFromSource(
        'exec("scripts/main.cs"); $AfterExec = $Value;',
      );
      script2.execute();

      expect(runtime.$g.get("Value")).toBe(1);
    });
  });

  describe("ScriptObject superClass inheritance", () => {
    it("finds methods on superClass when not defined on class", () => {
      const { $g } = run(`
        function DefaultGame::getMessage(%this) {
          return "default message";
        }

        // Create a ScriptObject with class and superClass
        %game = new ScriptObject() {
          class = "CTFGame";
          superClass = "DefaultGame";
        };

        // CTFGame doesn't define getMessage, so it should find DefaultGame::getMessage
        $result = %game.getMessage();
      `);
      expect($g.get("result")).toBe("default message");
    });

    it("prefers method on class over superClass", () => {
      const { $g } = run(`
        function DefaultGame::getMessage(%this) {
          return "default message";
        }

        function CTFGame::getMessage(%this) {
          return "CTF message";
        }

        %game = new ScriptObject() {
          class = "CTFGame";
          superClass = "DefaultGame";
        };

        $result = %game.getMessage();
      `);
      expect($g.get("result")).toBe("CTF message");
    });

    it("class method can call superClass method via namespace", () => {
      const { $g } = run(`
        function DefaultGame::getValue(%this) {
          return 10;
        }

        function CTFGame::getValue(%this) {
          %base = DefaultGame::getValue(%this);
          return %base + 5;
        }

        %game = new ScriptObject() {
          class = "CTFGame";
          superClass = "DefaultGame";
        };

        $result = %game.getValue();
      `);
      expect($g.get("result")).toBe(15);
    });

    it("works with ScriptGroup as well", () => {
      const { $g } = run(`
        function BaseGroup::getType(%this) {
          return "base";
        }

        %group = new ScriptGroup() {
          class = "MyGroup";
          superClass = "BaseGroup";
        };

        $result = %group.getType();
      `);
      expect($g.get("result")).toBe("base");
    });

    it("handles missing superClass method gracefully", () => {
      const { $g } = run(`
        %game = new ScriptObject() {
          class = "CTFGame";
          superClass = "DefaultGame";
        };

        // Neither CTFGame nor DefaultGame define this method
        $result = %game.undefinedMethod();
      `);
      expect($g.get("result")).toBe("");
    });

    it("superClass is case-insensitive", () => {
      const { $g } = run(`
        function defaultgame::getMessage(%this) {
          return "found it";
        }

        %game = new ScriptObject() {
          class = "CTFGame";
          superClass = "DefaultGame";  // Different case
        };

        $result = %game.getMessage();
      `);
      expect($g.get("result")).toBe("found it");
    });

    it("registers namespace parent link for other objects", () => {
      // When one object establishes a class->superClass link,
      // other objects with the same class should benefit from it
      const { $g } = run(`
        function DefaultGame::getInfo(%this) {
          return "info";
        }

        // First object establishes the CTFGame -> DefaultGame link
        %game1 = new ScriptObject() {
          class = "CTFGame";
          superClass = "DefaultGame";
        };

        // Second object with same class (no explicit superClass)
        // should still walk the namespace chain
        %game2 = new ScriptObject() {
          class = "CTFGame";
        };

        $result1 = %game1.getInfo();
        $result2 = %game2.getInfo();
      `);
      expect($g.get("result1")).toBe("info");
      expect($g.get("result2")).toBe("info");
    });

    it("Parent:: walks namespace chain when no package override exists", () => {
      // This tests the real TorqueScript behavior where Parent:: in a method
      // walks up the namespace inheritance chain (set via superClass),
      // not just the package override stack.
      // This is how TDMGame::missionLoadDone can call Parent::missionLoadDone
      // to invoke DefaultGame::missionLoadDone.
      const { $g } = run(`
        function DefaultGame::missionLoadDone(%game) {
          %game.defaultCalled = true;
          return "default";
        }

        function TDMGame::missionLoadDone(%game) {
          // This Parent:: call should resolve to DefaultGame::missionLoadDone
          // because TDMGame's superClass is DefaultGame
          %result = Parent::missionLoadDone(%game);
          %game.tdmCalled = true;
          return "tdm(" @ %result @ ")";
        }

        // Create the Game object with class/superClass to establish namespace chain
        %game = new ScriptObject(Game) {
          class = "TDMGame";
          superClass = "DefaultGame";
        };

        $result = %game.missionLoadDone();
        $defaultCalled = %game.defaultCalled;
        $tdmCalled = %game.tdmCalled;
      `);
      expect($g.get("result")).toBe("tdm(default)");
      expect($g.get("defaultCalled")).toBe(true);
      expect($g.get("tdmCalled")).toBe(true);
    });

    it("Parent:: walks multiple levels of namespace inheritance", () => {
      const { $g } = run(`
        function BaseGame::getValue(%this) {
          return "base";
        }

        function DefaultGame::getValue(%this) {
          return "default(" @ Parent::getValue(%this) @ ")";
        }

        function CTFGame::getValue(%this) {
          return "ctf(" @ Parent::getValue(%this) @ ")";
        }

        // Establish the chain: CTFGame -> DefaultGame -> BaseGame
        %dummy1 = new ScriptObject() {
          class = "DefaultGame";
          superClass = "BaseGame";
        };
        %game = new ScriptObject() {
          class = "CTFGame";
          superClass = "DefaultGame";
        };

        $result = %game.getValue();
      `);
      expect($g.get("result")).toBe("ctf(default(base))");
    });

    it("Parent:: through namespace chain finds package-overridden method", () => {
      // Tests the interaction between namespace inheritance and package overrides:
      // - BaseGame::getValue exists
      // - Package overrides BaseGame::getValue
      // - DefaultGame::getValue calls Parent::getValue
      // - Should get the overridden version of BaseGame::getValue
      const { $g } = run(`
        function BaseGame::getValue(%this) {
          return "base";
        }

        package Override {
          function BaseGame::getValue(%this) {
            return "overridden(" @ Parent::getValue(%this) @ ")";
          }
        };

        function DefaultGame::getValue(%this) {
          return "default(" @ Parent::getValue(%this) @ ")";
        }

        // Establish the chain: DefaultGame -> BaseGame
        %game = new ScriptObject() {
          class = "DefaultGame";
          superClass = "BaseGame";
        };

        // First call without package
        $resultWithout = %game.getValue();

        // Activate package and call again
        activatePackage(Override);
        $resultWith = %game.getValue();
      `);
      // Without override, should walk chain to base
      expect($g.get("resultWithout")).toBe("default(base)");
      // With override active, should get overridden BaseGame::getValue
      expect($g.get("resultWith")).toBe("default(overridden(base))");
    });

    it("Parent:: inside package override uses package stack, not namespace chain", () => {
      // When inside a package override, Parent:: should call the previous
      // version in the package stack, not walk the namespace chain
      const { $g } = run(`
        function DefaultGame::getValue(%this) {
          return "default";
        }

        package Pkg1 {
          function DefaultGame::getValue(%this) {
            return "pkg1(" @ Parent::getValue(%this) @ ")";
          }
        };

        // CTFGame inherits from DefaultGame
        function CTFGame::getValue(%this) {
          return "ctf(" @ Parent::getValue(%this) @ ")";
        }

        %game = new ScriptObject() {
          class = "CTFGame";
          superClass = "DefaultGame";
        };

        // Without package, CTFGame -> DefaultGame
        $resultBefore = %game.getValue();

        // With package active, CTFGame -> DefaultGame -> Pkg1's override
        activatePackage(Pkg1);
        $resultAfter = %game.getValue();
      `);
      expect($g.get("resultBefore")).toBe("ctf(default)");
      expect($g.get("resultAfter")).toBe("ctf(pkg1(default))");
    });
  });

  describe("method hooks (onMethodCalled)", () => {
    it("fires hook after method is called via object", () => {
      const runtime = createRuntime();
      const hookCalls: Array<{ thisObj: any; args: any[] }> = [];

      // Register hook before method is defined
      runtime.$.onMethodCalled(
        "TestClass",
        "doSomething",
        (thisObj, ...args) => {
          hookCalls.push({ thisObj, args });
        },
      );

      // Define method and create object via transpiled code
      const { code } = transpile(`
        function TestClass::doSomething(%this, %a, %b) {
          return %a + %b;
        }

        %obj = new ScriptObject() {
          class = "TestClass";
        };

        $result = %obj.doSomething(10, 20);
      `);

      const $l = runtime.$.locals();
      new Function("$", "$f", "$g", "$l", code)(
        runtime.$,
        runtime.$f,
        runtime.$g,
        $l,
      );

      expect(runtime.$g.get("result")).toBe(30);
      expect(hookCalls.length).toBe(1);
      expect(hookCalls[0].args).toEqual([10, 20]);
    });

    it("fires hook after namespace call (e.g., DefaultGame::method)", () => {
      const runtime = createRuntime();
      const hookCalls: Array<{ thisObj: any; args: any[] }> = [];

      runtime.$.onMethodCalled(
        "DefaultGame",
        "missionLoadDone",
        (thisObj, ...args) => {
          hookCalls.push({ thisObj, args });
        },
      );

      const { code } = transpile(`
        function DefaultGame::missionLoadDone(%game) {
          $defaultCalled = true;
        }

        function CTFGame::missionLoadDone(%game) {
          // Call parent via namespace
          DefaultGame::missionLoadDone(%game);
          $ctfCalled = true;
        }

        %game = new ScriptObject(Game) {
          class = "CTFGame";
          superClass = "DefaultGame";
        };

        %game.missionLoadDone();
      `);

      const $l = runtime.$.locals();
      new Function("$", "$f", "$g", "$l", code)(
        runtime.$,
        runtime.$f,
        runtime.$g,
        $l,
      );

      expect(runtime.$g.get("defaultCalled")).toBe(true);
      expect(runtime.$g.get("ctfCalled")).toBe(true);
      // Hook should fire when DefaultGame::missionLoadDone is called
      expect(hookCalls.length).toBe(1);
    });

    it("multiple hooks on same method all fire", () => {
      const runtime = createRuntime();
      const calls: string[] = [];

      runtime.$.onMethodCalled("TestClass", "test", () => {
        calls.push("hook1");
      });
      runtime.$.onMethodCalled("TestClass", "test", () => {
        calls.push("hook2");
      });

      const { code } = transpile(`
        function TestClass::test(%this) {
          return "done";
        }

        %obj = new ScriptObject() {
          class = "TestClass";
        };

        %obj.test();
      `);

      const $l = runtime.$.locals();
      new Function("$", "$f", "$g", "$l", code)(
        runtime.$,
        runtime.$f,
        runtime.$g,
        $l,
      );

      expect(calls).toEqual(["hook1", "hook2"]);
    });

    it("hook receives correct thisObj", () => {
      const runtime = createRuntime();
      let capturedObj: any = null;

      runtime.$.onMethodCalled("TestClass", "identify", (thisObj) => {
        capturedObj = thisObj;
      });

      const { code } = transpile(`
        function TestClass::identify(%this) {
          return %this.name;
        }

        %obj = new ScriptObject(MyObject) {
          class = "TestClass";
          name = "test-object";
        };

        $result = %obj.identify();
      `);

      const $l = runtime.$.locals();
      new Function("$", "$f", "$g", "$l", code)(
        runtime.$,
        runtime.$f,
        runtime.$g,
        $l,
      );

      expect(runtime.$g.get("result")).toBe("test-object");
      expect(capturedObj).not.toBeNull();
      expect(capturedObj._name).toBe("MyObject");
      expect(capturedObj.name).toBe("test-object");
    });

    it("hook is case-insensitive for class and method names", () => {
      const runtime = createRuntime();
      let hookFired = false;

      // Register with different case
      runtime.$.onMethodCalled("testclass", "DOACTION", () => {
        hookFired = true;
      });

      const { code } = transpile(`
        function TestClass::doAction(%this) {
          return true;
        }

        %obj = new ScriptObject() {
          class = "TESTCLASS";
        };

        %obj.DoAction();
      `);

      const $l = runtime.$.locals();
      new Function("$", "$f", "$g", "$l", code)(
        runtime.$,
        runtime.$f,
        runtime.$g,
        $l,
      );

      expect(hookFired).toBe(true);
    });

    it("hook fires for superClass method when called on subclass", () => {
      const runtime = createRuntime();
      const hookCalls: string[] = [];

      runtime.$.onMethodCalled("DefaultGame", "init", () => {
        hookCalls.push("DefaultGame::init");
      });

      const { code } = transpile(`
        function DefaultGame::init(%this) {
          $initialized = true;
        }

        // CTFGame doesn't override init, so DefaultGame::init will be called
        %game = new ScriptObject() {
          class = "CTFGame";
          superClass = "DefaultGame";
        };

        %game.init();
      `);

      const $l = runtime.$.locals();
      new Function("$", "$f", "$g", "$l", code)(
        runtime.$,
        runtime.$f,
        runtime.$g,
        $l,
      );

      expect(runtime.$g.get("initialized")).toBe(true);
      expect(hookCalls).toEqual(["DefaultGame::init"]);
    });

    it("hook fires when parent method is called via Parent::", () => {
      // This is the key test: when TDMGame::missionLoadDone calls
      // Parent::missionLoadDone (which resolves to DefaultGame::missionLoadDone),
      // the hook registered for DefaultGame::missionLoadDone should fire.
      const runtime = createRuntime();
      const hookCalls: string[] = [];

      runtime.$.onMethodCalled("DefaultGame", "missionLoadDone", (thisObj) => {
        hookCalls.push(
          `DefaultGame::missionLoadDone called with ${thisObj._name}`,
        );
      });

      const { code } = transpile(`
        function DefaultGame::missionLoadDone(%game) {
          %game.defaultCalled = true;
        }

        function TDMGame::missionLoadDone(%game) {
          // Call parent via Parent:: - should trigger DefaultGame hook
          Parent::missionLoadDone(%game);
          %game.tdmCalled = true;
        }

        %game = new ScriptObject(Game) {
          class = "TDMGame";
          superClass = "DefaultGame";
        };

        %game.missionLoadDone();
      `);

      const $l = runtime.$.locals();
      new Function("$", "$f", "$g", "$l", code)(
        runtime.$,
        runtime.$f,
        runtime.$g,
        $l,
      );

      const game = runtime.getObjectByName("Game");
      expect(game?.defaultcalled).toBe(true);
      expect(game?.tdmcalled).toBe(true);
      // Hook should have fired when Parent::missionLoadDone resolved to DefaultGame::missionLoadDone
      expect(hookCalls).toEqual([
        "DefaultGame::missionLoadDone called with Game",
      ]);
    });

    it("hook fires for package override parent called via Parent::", () => {
      const runtime = createRuntime();
      const hookCalls: string[] = [];

      runtime.$.onMethodCalled("TestClass", "getValue", () => {
        hookCalls.push("TestClass::getValue");
      });

      const { code } = transpile(`
        function TestClass::getValue(%this) {
          return "base";
        }

        package Override {
          function TestClass::getValue(%this) {
            // Call parent - should trigger hook for TestClass::getValue (base version)
            return "override(" @ Parent::getValue(%this) @ ")";
          }
        };

        %obj = new ScriptObject() {
          class = "TestClass";
        };

        activatePackage(Override);
        $result = %obj.getValue();
      `);

      const $l = runtime.$.locals();
      new Function("$", "$f", "$g", "$l", code)(
        runtime.$,
        runtime.$f,
        runtime.$g,
        $l,
      );

      expect(runtime.$g.get("result")).toBe("override(base)");
      // Hook should fire twice: once for override, once for base via Parent::
      expect(hookCalls).toEqual(["TestClass::getValue", "TestClass::getValue"]);
    });
  });

  describe("runtime reactivity events", () => {
    it("emits object lifecycle mutations and batched flush events", async () => {
      const runtime = createRuntime();
      const events: any[] = [];
      runtime.subscribeRuntimeEvents((event) => {
        events.push(event);
      });

      runtime.$.create("ScriptObject", "LifecycleTest", {});
      runtime.$.deleteObject("LifecycleTest");
      await Promise.resolve();

      const mutationEvents = events.filter(
        (event) => event.type !== "batch.flushed",
      );
      expect(
        mutationEvents.some((event) => event.type === "object.created"),
      ).toBe(true);
      expect(
        mutationEvents.some((event) => event.type === "object.deleted"),
      ).toBe(true);

      const batchEvents = events.filter(
        (event) => event.type === "batch.flushed",
      );
      expect(batchEvents.length).toBeGreaterThan(0);
      expect(
        batchEvents.some((batch) =>
          batch.events.some((event: any) => event.type === "object.created"),
        ),
      ).toBe(true);
      expect(
        batchEvents.some((batch) =>
          batch.events.some((event: any) => event.type === "object.deleted"),
        ),
      ).toBe(true);
    });

    it("emits field.changed for reactive fields and ignores untracked fields", async () => {
      const runtime = createRuntime();
      const events: any[] = [];
      runtime.subscribeRuntimeEvents((event) => {
        events.push(event);
      });

      const obj = runtime.$.create("SceneObject", "ReactiveFieldObject", {
        position: "0 0 0",
        customvalue: "before",
      });
      events.length = 0;

      runtime.$.setProp(obj, "position", "10 20 30");
      runtime.$.setProp(obj, "customvalue", "after");
      await Promise.resolve();

      const fieldEvents = events.filter(
        (event) => event.type === "field.changed",
      );
      expect(fieldEvents.length).toBe(1);
      expect(fieldEvents[0].field).toBe("position");
      expect(fieldEvents[0].value).toBe("10 20 30");
    });

    it("emits method.called for tracked methods only", async () => {
      const runtime = createRuntime();
      const events: any[] = [];
      runtime.subscribeRuntimeEvents((event) => {
        events.push(event);
      });

      runtime.$.registerMethod("SceneObject", "setTransform", (thisObj) => {
        thisObj.position = "1 2 3";
      });
      runtime.$.registerMethod("SceneObject", "doNothing", () => {});

      const obj = runtime.$.create("SceneObject", "TrackedMethodObject", {});
      events.length = 0;

      runtime.$.call(obj, "setTransform", "1 2 3");
      runtime.$.call(obj, "doNothing");
      await Promise.resolve();

      const methodEvents = events.filter(
        (event) => event.type === "method.called",
      );
      expect(methodEvents.length).toBe(1);
      expect(methodEvents[0].className).toBe("sceneobject");
      expect(methodEvents[0].methodName).toBe("settransform");
      expect(methodEvents[0].objectId).toBe(obj._id);
    });

    it("emits global.changed for tracked globals only", async () => {
      const runtime = createRuntime();
      const events: any[] = [];
      runtime.subscribeRuntimeEvents((event) => {
        events.push(event);
      });

      runtime.$g.set("missionRunning", true);
      runtime.$g.set("customState", 123);
      await Promise.resolve();

      const globalEvents = events.filter(
        (event) => event.type === "global.changed",
      );
      expect(globalEvents.length).toBe(1);
      expect(globalEvents[0].name).toBe("missionrunning");
      expect(globalEvents[0].value).toBe(true);
    });

    it("supports overriding reactiveGlobalNames", async () => {
      const runtime = createRuntime({
        reactiveGlobalNames: ["customState"],
      });
      const events: any[] = [];
      runtime.subscribeRuntimeEvents((event) => {
        events.push(event);
      });

      runtime.$g.set("missionRunning", true);
      runtime.$g.set("customState", 456);
      await Promise.resolve();

      const globalEvents = events.filter(
        (event) => event.type === "global.changed",
      );
      expect(globalEvents.length).toBe(1);
      expect(globalEvents[0].name).toBe("customstate");
      expect(globalEvents[0].value).toBe(456);
    });
  });

  describe("isFunction", () => {
    it("returns true for user-defined functions", () => {
      const { $ } = run(`
        function myCustomFunction() {
          return "test";
        }
      `);
      expect($.isFunction("myCustomFunction")).toBe(true);
      expect($.isFunction("MYCUSTOMFUNCTION")).toBe(true); // case-insensitive
    });

    it("returns true for builtin functions", () => {
      const { $ } = run(``);
      expect($.isFunction("echo")).toBe(true);
      expect($.isFunction("Echo")).toBe(true); // case-insensitive
      expect($.isFunction("strlen")).toBe(true);
      expect($.isFunction("getWord")).toBe(true);
    });

    it("returns false for non-existent functions", () => {
      const { $ } = run(``);
      expect($.isFunction("nonExistentFunction")).toBe(false);
    });
  });

  describe("getWord delimiter handling", () => {
    it("does not collapse consecutive delimiters", () => {
      const { $g } = run(`
        // With two spaces between a and b, getWord(1) should return empty
        $str = "a  b";
        $word0 = getWord($str, 0);  // "a"
        $word1 = getWord($str, 1);  // "" (empty - between two spaces)
        $word2 = getWord($str, 2);  // "b"
      `);
      expect($g.get("word0")).toBe("a");
      expect($g.get("word1")).toBe(""); // Engine behavior: empty word between consecutive delimiters
      expect($g.get("word2")).toBe("b");
    });

    it("handles multiple consecutive delimiters", () => {
      const { $g } = run(`
        $str = "a   b";  // Three spaces
        $word0 = getWord($str, 0);  // "a"
        $word1 = getWord($str, 1);  // ""
        $word2 = getWord($str, 2);  // ""
        $word3 = getWord($str, 3);  // "b"
      `);
      expect($g.get("word0")).toBe("a");
      expect($g.get("word1")).toBe("");
      expect($g.get("word2")).toBe("");
      expect($g.get("word3")).toBe("b");
    });

    it("correctly counts words with consecutive delimiters", () => {
      const { $g } = run(`
        $count1 = getWordCount("a b");    // 2 words
        $count2 = getWordCount("a  b");   // 3 words (includes empty)
        $count3 = getWordCount("a   b");  // 4 words (includes two empty)
      `);
      expect($g.get("count1")).toBe(2);
      expect($g.get("count2")).toBe(3);
      expect($g.get("count3")).toBe(4);
    });
  });

  describe("ignoreScripts option", () => {
    function createLoader(
      files: Record<string, string>,
    ): (path: string) => Promise<string | null> {
      return async (path: string) =>
        files[path.replace(/\\/g, "/").toLowerCase()] ?? null;
    }

    it("skips scripts matching glob patterns", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/main.cs": 'exec("scripts/ai/brain.cs"); $Main = 1;',
          "scripts/ai/brain.cs": "$AI = 1;",
        }),
        ignoreScripts: ["**/ai/**"],
      });

      const script = await runtime.loadFromPath("scripts/main.cs");
      script.execute();

      expect(runtime.$g.get("Main")).toBe(1);
      expect(runtime.$g.get("AI")).toBe(""); // Not loaded
      expect(warnSpy).toHaveBeenCalledWith(
        "Ignoring script: scripts/ai/brain.cs",
      );
      warnSpy.mockRestore();
    });

    it("is case insensitive", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/main.cs": 'exec("Scripts/AI/Brain.cs"); $Main = 1;',
          "scripts/ai/brain.cs": "$AI = 1;",
        }),
        ignoreScripts: ["**/ai/**"],
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const script = await runtime.loadFromPath("scripts/main.cs");
      script.execute();
      warnSpy.mockRestore();

      expect(runtime.$g.get("Main")).toBe(1);
      expect(runtime.$g.get("AI")).toBe(""); // Not loaded due to case-insensitive match
    });

    it("supports multiple patterns", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/main.cs":
            'exec("scripts/ai/brain.cs"); exec("scripts/vehicles/tank.cs"); exec("scripts/utils.cs"); $Main = 1;',
          "scripts/ai/brain.cs": "$AI = 1;",
          "scripts/vehicles/tank.cs": "$Vehicle = 1;",
          "scripts/utils.cs": "$Utils = 1;",
        }),
        ignoreScripts: ["**/ai/**", "**/vehicles/**"],
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const script = await runtime.loadFromPath("scripts/main.cs");
      script.execute();
      warnSpy.mockRestore();

      expect(runtime.$g.get("Main")).toBe(1);
      expect(runtime.$g.get("AI")).toBe(""); // Ignored
      expect(runtime.$g.get("Vehicle")).toBe(""); // Ignored
      expect(runtime.$g.get("Utils")).toBe(1); // Loaded (not in ignore list)
    });

    it("marks ignored scripts as failed (not retried)", async () => {
      let loadCount = 0;
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const runtime = createRuntime({
        loadScript: async (path) => {
          loadCount++;
          if (path.toLowerCase() === "scripts/ignored.cs") {
            return "$Ignored = 1;";
          }
          if (path.toLowerCase() === "scripts/main.cs") {
            return 'exec("scripts/ignored.cs"); exec("scripts/ignored.cs"); $Main = 1;';
          }
          return null;
        },
        ignoreScripts: ["**/ignored.cs"],
      });

      const script = await runtime.loadFromPath("scripts/main.cs");
      script.execute();

      // Should only warn once (second exec sees it's already in failedScripts)
      expect(
        warnSpy.mock.calls.filter(
          (c) => c[0] === "Ignoring script: scripts/ignored.cs",
        ).length,
      ).toBe(1);
      // Loader should only be called for main.cs, not for ignored.cs
      expect(loadCount).toBe(1);
      warnSpy.mockRestore();
    });

    it("matches exact filenames with glob", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/main.cs":
            'exec("scripts/skip-me.cs"); exec("scripts/keep-me.cs"); $Main = 1;',
          "scripts/skip-me.cs": "$Skip = 1;",
          "scripts/keep-me.cs": "$Keep = 1;",
        }),
        ignoreScripts: ["**/skip-me.cs"],
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const script = await runtime.loadFromPath("scripts/main.cs");
      script.execute();
      warnSpy.mockRestore();

      expect(runtime.$g.get("Main")).toBe(1);
      expect(runtime.$g.get("Skip")).toBe(""); // Ignored
      expect(runtime.$g.get("Keep")).toBe(1); // Loaded
    });

    it("does nothing when ignoreScripts is empty array", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/main.cs": 'exec("scripts/dep.cs"); $Main = 1;',
          "scripts/dep.cs": "$Dep = 1;",
        }),
        ignoreScripts: [],
      });

      const script = await runtime.loadFromPath("scripts/main.cs");
      script.execute();

      expect(runtime.$g.get("Main")).toBe(1);
      expect(runtime.$g.get("Dep")).toBe(1); // Loaded normally
    });

    it("does nothing when ignoreScripts is not provided", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/main.cs": 'exec("scripts/dep.cs"); $Main = 1;',
          "scripts/dep.cs": "$Dep = 1;",
        }),
        // No ignoreScripts option
      });

      const script = await runtime.loadFromPath("scripts/main.cs");
      script.execute();

      expect(runtime.$g.get("Main")).toBe(1);
      expect(runtime.$g.get("Dep")).toBe(1); // Loaded normally
    });

    it("exec() returns false for ignored scripts", async () => {
      const runtime = createRuntime({
        loadScript: createLoader({
          "scripts/main.cs": '$Result = exec("scripts/ignored.cs"); $Main = 1;',
          "scripts/ignored.cs": "$Ignored = 1;",
        }),
        ignoreScripts: ["**/ignored.cs"],
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const script = await runtime.loadFromPath("scripts/main.cs");
      script.execute();
      warnSpy.mockRestore();

      expect(runtime.$g.get("Main")).toBe(1);
      // exec() should return false when the script is ignored (same as failed)
      expect(runtime.$g.get("Result")).toBe(false);
    });
  });

  describe("nsRef with execution context", () => {
    it("tracks execution context for Parent:: calls via nsRef", () => {
      const runtime = createRuntime();
      const { code } = transpile(`
        function TestClass::getValue(%this) {
          return "base";
        }

        package Pkg1 {
          function TestClass::getValue(%this) {
            return "pkg1(" @ Parent::getValue(%this) @ ")";
          }
        };

        package Pkg2 {
          function TestClass::getValue(%this) {
            return "pkg2(" @ Parent::getValue(%this) @ ")";
          }
        };

        activatePackage(Pkg1);
        activatePackage(Pkg2);
      `);

      const $l = runtime.$.locals();
      new Function("$", "$f", "$g", "$l", code)(
        runtime.$,
        runtime.$f,
        runtime.$g,
        $l,
      );

      // Get method reference via nsRef and call it directly
      const fn = runtime.$.nsRef("TestClass", "getValue");
      expect(fn).not.toBeNull();

      // Call the method - it should track execution context for proper Parent:: support
      const result = fn!("dummyThis");
      expect(result).toBe("pkg2(pkg1(base))");
    });
  });
});
