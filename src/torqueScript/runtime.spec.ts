import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRuntime } from "./runtime";
import type { TorqueRuntimeOptions } from "./types";
import { parse, transpile } from "./index";

function run(script: string, options?: TorqueRuntimeOptions) {
  const { $, $f, $g, state } = createRuntime(options);
  const { code } = transpile(script);
  const fn = new Function("$", "$f", "$g", code);
  fn($, $f, $g);
  return { $, $f, $g, state };
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

    it("handles division by zero (returns 0)", () => {
      const { $g } = run(`$result = 10 / 0;`);
      expect($g.get("result")).toBe(0);
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
    it("overrides functions when package is defined", () => {
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

        $after = getMessage();
      `);
      expect($g.get("before")).toBe("original");
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

        $result = getValue();
      `);
      expect($g.get("result")).toBe("extended(base)");
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

    it("$.package activates and overrides functions", () => {
      const { $, $f } = createRuntime();
      $.registerFunction("getMessage", () => "original");
      expect($f.call("getMessage")).toBe("original");

      $.package("TestPackage", () => {
        $.registerFunction("getMessage", () => "overridden");
      });
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

  describe("real TorqueScript files", () => {
    const emptyAST = parse("");

    async function runFile(filepath: string) {
      const source = readFileSync(filepath, "utf8");
      // Provide a loader that returns empty scripts for known dependencies
      const runtime = createRuntime({
        loadScript: async (path) => {
          // Return empty script for known dependencies
          if (path.toLowerCase().includes("aitdm")) return "";
          return null;
        },
      });
      const script = await runtime.loadFromSource(source);
      script.execute();
      return {
        $: runtime.$,
        $f: runtime.$f,
        $g: runtime.$g,
        state: runtime.state,
      };
    }

    it("transpiles and executes TR2Roles.cs", async () => {
      const { $g, state } = await runFile(
        "docs/base/@vl2/TR2final105-server.vl2/scripts/TR2Roles.cs",
      );

      // Verify globals were set
      expect($g.get("TR2::numRoles")).toBe(3);
      expect($g.get("TR2::role0")).toBe("Goalie");
      expect($g.get("TR2::role1")).toBe("Defense");
      expect($g.get("TR2::role2")).toBe("Offense");

      // Verify methods were registered
      expect(state.methods.has("TR2Game")).toBe(true);
    });

    it("transpiles and executes a .mis mission file", async () => {
      const { $, state } = await runFile(
        "docs/base/@vl2/4thGradeDropout.vl2/missions/4thGradeDropout.mis",
      );

      // Verify MissionGroup was created
      const missionGroup = $.deref("MissionGroup");
      expect(missionGroup).toBeDefined();
      expect(missionGroup._className).toBe("SimGroup");

      // Verify child objects were created
      const terrain = $.deref("Terrain");
      expect(terrain).toBeDefined();

      const sky = $.deref("Sky");
      expect(sky).toBeDefined();

      // Verify object count
      expect(state.objectsByName.size).toBeGreaterThan(10);
    });

    it("transpiles TDMGame.cs with methods and parent calls", async () => {
      const source = readFileSync(
        "docs/base/@vl2/z_DMP2-V0.6.vl2/scripts/TDMGame.cs",
        "utf-8",
      );
      const runtime = createRuntime({
        loadScript: async (path) => {
          if (path.toLowerCase().includes("aitdm")) return "";
          return null;
        },
      });
      const script = await runtime.loadFromSource(source);
      script.execute();

      // Verify methods were registered on TDMGame
      expect(runtime.state.methods.has("TDMGame")).toBe(true);
      const tdmMethods = runtime.state.methods.get("TDMGame");
      expect(tdmMethods).toBeDefined();

      // Verify transpiled code contains parent calls
      const { code } = transpile(source);
      expect(code).toContain("$.parent(");
    });
  });

  describe("exec() with loadScript", () => {
    function createLoader(
      files: Record<string, string>,
    ): (path: string) => Promise<string | null> {
      return async (path: string) => files[path.toLowerCase()] ?? null;
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
});
