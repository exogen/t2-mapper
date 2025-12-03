import type { BuiltinsContext, TorqueFunction } from "./types";
import { normalizePath } from "./utils";

/** Coerce value to string, treating null/undefined as empty string. */
function toStr(v: any): string {
  return String(v ?? "");
}

/** Coerce value to number, treating null/undefined/NaN as 0. */
function toNum(v: any): number {
  return Number(v) || 0;
}

function parseVector(v: any): [number, number, number] {
  const parts = toStr(v || "0 0 0")
    .split(" ")
    .map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

// TorqueScript unit delimiters (from SDK source):
// - Words: space, tab, newline (" \t\n")
// - Fields: tab, newline ("\t\n")
// - Records: newline ("\n")
const WORD_DELIM_SET = " \t\n";
const FIELD_DELIM_SET = "\t\n";
const RECORD_DELIM_SET = "\n";
const FIELD_DELIM_CHAR = "\t"; // Use tab when joining

/**
 * Get the span of characters NOT in the delimiter set (like C's strcspn).
 * Returns the length of the initial segment that doesn't contain any delimiter.
 */
function strcspn(str: string, pos: number, delims: string): number {
  let len = 0;
  while (pos + len < str.length && !delims.includes(str[pos + len])) {
    len++;
  }
  return len;
}

/**
 * Get a unit (word/field/record) at the given index.
 * Matches engine behavior: doesn't collapse consecutive delimiters.
 */
function getUnit(str: string, index: number, delims: string): string {
  let pos = 0;

  // Skip to the target index
  while (index > 0) {
    if (pos >= str.length) return "";
    const sz = strcspn(str, pos, delims);
    if (pos + sz >= str.length) return ""; // No more delimiters
    pos += sz + 1; // Skip word + ONE delimiter
    index--;
  }

  // Get the unit at this position
  const sz = strcspn(str, pos, delims);
  if (sz === 0) return ""; // Empty unit
  return str.substring(pos, pos + sz);
}

/**
 * Get units from startIndex to endIndex (inclusive).
 * Matches engine behavior.
 */
function getUnits(
  str: string,
  startIndex: number,
  endIndex: number,
  delims: string,
): string {
  let pos = 0;
  let index = startIndex;

  // Skip to startIndex
  while (index > 0) {
    if (pos >= str.length) return "";
    const sz = strcspn(str, pos, delims);
    if (pos + sz >= str.length) return "";
    pos += sz + 1;
    index--;
  }

  const startPos = pos;

  // Find end position
  let count = endIndex - startIndex + 1;
  while (count > 0) {
    const sz = strcspn(str, pos, delims);
    pos += sz;
    if (pos >= str.length) break;
    pos++; // Skip delimiter
    count--;
  }

  // Trim trailing delimiter if we stopped at one
  let endPos = pos;
  if (endPos > startPos && delims.includes(str[endPos - 1])) {
    endPos--;
  }

  return str.substring(startPos, endPos);
}

/**
 * Count the number of units in the string.
 * Engine behavior: counts delimiters + 1.
 * So "a b" has 1 delimiter -> 2 units.
 * And "a  b" has 2 delimiters -> 3 units (with an empty one in the middle).
 */
function getUnitCount(str: string, delims: string): number {
  if (str === "") return 0;

  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (delims.includes(str[i])) {
      count++;
    }
  }

  return count + 1;
}

/**
 * Set a unit at the given index, preserving other units.
 */
function setUnit(
  str: string,
  index: number,
  value: string,
  delims: string,
  joinChar: string,
): string {
  const parts: string[] = [];
  let pos = 0;
  let i = 0;

  while (pos < str.length || i <= index) {
    if (pos < str.length) {
      const sz = strcspn(str, pos, delims);
      if (i === index) {
        parts.push(value);
      } else {
        parts.push(str.substring(pos, pos + sz));
      }
      pos += sz;
      if (pos < str.length) pos++; // Skip delimiter
    } else {
      // Past end of string, pad with empty strings
      if (i === index) {
        parts.push(value);
      } else {
        parts.push("");
      }
    }
    i++;
    if (i > index && pos >= str.length) break;
  }

  return parts.join(joinChar);
}

/**
 * Remove a unit at the given index.
 */
function removeUnit(
  str: string,
  index: number,
  delims: string,
  joinChar: string,
): string {
  const parts: string[] = [];
  let pos = 0;
  let i = 0;

  while (pos < str.length) {
    const sz = strcspn(str, pos, delims);
    if (i !== index) {
      parts.push(str.substring(pos, pos + sz));
    }
    pos += sz;
    if (pos < str.length) pos++; // Skip delimiter
    i++;
  }

  return parts.join(joinChar);
}

/**
 * Default TorqueScript built-in functions.
 *
 * Names are lowercased to optimize lookup, since TorqueScript is case-insensitive.
 */
export function createBuiltins(
  ctx: BuiltinsContext,
): Record<string, TorqueFunction> {
  const { runtime, fileSystem } = ctx;

  // File search iterator state
  let fileSearchResults: string[] = [];
  let fileSearchIndex = 0;
  let fileSearchPattern: string = "";

  return {
    // Console
    echo(...args: any[]): void {
      console.log(...args.map(toStr));
    },
    warn(...args: any[]): void {
      console.warn(...args.map(toStr));
    },
    error(...args: any[]): void {
      console.error(...args.map(toStr));
    },
    call(funcName: any, ...args: any[]): any {
      return runtime().$f.call(toStr(funcName), ...args);
    },
    eval(_code: any): any {
      throw new Error(
        "eval() not implemented: requires runtime parsing and execution",
      );
    },
    collapseescape(str: any): string {
      // Single-pass replacement to correctly handle sequences like \\n
      return toStr(str).replace(/\\([ntr\\])/g, (_, char) => {
        if (char === "n") return "\n";
        if (char === "t") return "\t";
        if (char === "r") return "\r";
        return "\\";
      });
    },
    expandescape(str: any): string {
      return toStr(str)
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t")
        .replace(/\r/g, "\\r");
    },
    export(pattern: any, filename?: any, append?: any): void {
      console.warn(`export(${pattern}): not implemented`);
    },
    quit(): void {
      console.warn("quit(): not implemented in browser");
    },
    trace(_enable: any): void {
      // Enable/disable function call tracing
    },

    // Type checking
    isobject(obj: any): boolean {
      return runtime().$.isObject(obj);
    },

    // Object lookup
    nametoid(name: string): number {
      return runtime().$.nameToId(name);
    },

    // String functions
    strlen(str: any): number {
      return toStr(str).length;
    },
    strchr(str: any, char: any): string {
      // Returns remainder of string starting at first occurrence of char, or ""
      const s = toStr(str);
      const c = toStr(char)[0] ?? "";
      const idx = s.indexOf(c);
      return idx >= 0 ? s.substring(idx) : "";
    },
    strpos(haystack: any, needle: any, offset?: any): number {
      return toStr(haystack).indexOf(toStr(needle), toNum(offset));
    },
    strcmp(a: any, b: any): number {
      const sa = toStr(a);
      const sb = toStr(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    },
    stricmp(a: any, b: any): number {
      const sa = toStr(a).toLowerCase();
      const sb = toStr(b).toLowerCase();
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    },
    strstr(haystack: any, needle: any): number {
      return toStr(haystack).indexOf(toStr(needle));
    },
    getsubstr(str: any, start: any, len?: any): string {
      const s = toStr(str);
      const st = toNum(start);
      if (len === undefined) return s.substring(st);
      return s.substring(st, st + toNum(len));
    },
    getword(str: any, index: any): string {
      return getUnit(toStr(str), toNum(index), WORD_DELIM_SET);
    },
    getwordcount(str: any): number {
      return getUnitCount(toStr(str), WORD_DELIM_SET);
    },
    getfield(str: any, index: any): string {
      return getUnit(toStr(str), toNum(index), FIELD_DELIM_SET);
    },
    getfieldcount(str: any): number {
      return getUnitCount(toStr(str), FIELD_DELIM_SET);
    },
    setword(str: any, index: any, value: any): string {
      return setUnit(
        toStr(str),
        toNum(index),
        toStr(value),
        WORD_DELIM_SET,
        " ",
      );
    },
    setfield(str: any, index: any, value: any): string {
      return setUnit(
        toStr(str),
        toNum(index),
        toStr(value),
        FIELD_DELIM_SET,
        FIELD_DELIM_CHAR,
      );
    },
    firstword(str: any): string {
      return getUnit(toStr(str), 0, WORD_DELIM_SET);
    },
    restwords(str: any): string {
      // Get all words starting from index 1
      return getUnits(toStr(str), 1, 1000000, WORD_DELIM_SET);
    },
    trim(str: any): string {
      return toStr(str).trim();
    },
    ltrim(str: any): string {
      return toStr(str).replace(/^\s+/, "");
    },
    rtrim(str: any): string {
      return toStr(str).replace(/\s+$/, "");
    },
    strupr(str: any): string {
      return toStr(str).toUpperCase();
    },
    strlwr(str: any): string {
      return toStr(str).toLowerCase();
    },
    strreplace(str: any, from: any, to: any): string {
      return toStr(str).split(toStr(from)).join(toStr(to));
    },
    filterstring(str: any, _replacementChars?: any): string {
      // Filters profanity/bad words from the string (requires bad word dictionary)
      // Since we don't have a bad word filter, just return the string unchanged
      return toStr(str);
    },
    stripchars(str: any, chars: any): string {
      // Removes all characters in `chars` from the string
      const s = toStr(str);
      const toRemove = new Set(toStr(chars).split(""));
      return s
        .split("")
        .filter((c) => !toRemove.has(c))
        .join("");
    },
    getfields(str: any, start: any, end?: any): string {
      const e = end !== undefined ? Number(end) : 1000000;
      return getUnits(toStr(str), toNum(start), e, FIELD_DELIM_SET);
    },
    getwords(str: any, start: any, end?: any): string {
      const e = end !== undefined ? Number(end) : 1000000;
      return getUnits(toStr(str), toNum(start), e, WORD_DELIM_SET);
    },
    removeword(str: any, index: any): string {
      return removeUnit(toStr(str), toNum(index), WORD_DELIM_SET, " ");
    },
    removefield(str: any, index: any): string {
      return removeUnit(
        toStr(str),
        toNum(index),
        FIELD_DELIM_SET,
        FIELD_DELIM_CHAR,
      );
    },
    getrecord(str: any, index: any): string {
      return getUnit(toStr(str), toNum(index), RECORD_DELIM_SET);
    },
    getrecordcount(str: any): number {
      return getUnitCount(toStr(str), RECORD_DELIM_SET);
    },
    setrecord(str: any, index: any, value: any): string {
      return setUnit(
        toStr(str),
        toNum(index),
        toStr(value),
        RECORD_DELIM_SET,
        "\n",
      );
    },
    removerecord(str: any, index: any): string {
      return removeUnit(toStr(str), toNum(index), RECORD_DELIM_SET, "\n");
    },
    nexttoken(_str: any, _tokenVar: any, _delim: any): string {
      // nextToken modifies a variable to store the remainder of the string,
      // which cannot be implemented correctly from a builtin function.
      throw new Error(
        "nextToken() is not implemented: it requires variable mutation",
      );
    },
    strtoplayername(str: any): string {
      // Sanitizes a string to be a valid player name
      return toStr(str)
        .replace(/[^\w\s-]/g, "")
        .trim();
    },

    // Math functions
    mabs(n: any): number {
      return Math.abs(toNum(n));
    },
    mfloor(n: any): number {
      return Math.floor(toNum(n));
    },
    mceil(n: any): number {
      return Math.ceil(toNum(n));
    },
    msqrt(n: any): number {
      return Math.sqrt(toNum(n));
    },
    mpow(base: any, exp: any): number {
      return Math.pow(toNum(base), toNum(exp));
    },
    msin(n: any): number {
      return Math.sin(toNum(n));
    },
    mcos(n: any): number {
      return Math.cos(toNum(n));
    },
    mtan(n: any): number {
      return Math.tan(toNum(n));
    },
    masin(n: any): number {
      return Math.asin(toNum(n));
    },
    macos(n: any): number {
      return Math.acos(toNum(n));
    },
    matan(rise: any, run: any): number {
      // SDK: mAtan(rise, run) - always requires 2 args, returns atan2
      return Math.atan2(toNum(rise), toNum(run));
    },
    mlog(n: any): number {
      return Math.log(toNum(n));
    },
    getrandom(a?: any, b?: any): number {
      // SDK behavior:
      // - 0 args: returns float 0-1
      // - 1 arg: returns int 0 to a
      // - 2 args: returns int a to b
      if (a === undefined) {
        return Math.random();
      }
      if (b === undefined) {
        return Math.floor(Math.random() * (toNum(a) + 1));
      }
      const min = toNum(a);
      const max = toNum(b);
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    mdegtorad(deg: any): number {
      return toNum(deg) * (Math.PI / 180);
    },
    mradtodeg(rad: any): number {
      return toNum(rad) * (180 / Math.PI);
    },
    mfloatlength(n: any, precision: any): string {
      return toNum(n).toFixed(toNum(precision));
    },
    getboxcenter(box: any): string {
      // Box format: "minX minY minZ maxX maxY maxZ"
      const parts = toStr(box).split(" ").map(Number);
      const minX = parts[0] || 0;
      const minY = parts[1] || 0;
      const minZ = parts[2] || 0;
      const maxX = parts[3] || 0;
      const maxY = parts[4] || 0;
      const maxZ = parts[5] || 0;
      return `${(minX + maxX) / 2} ${(minY + maxY) / 2} ${(minZ + maxZ) / 2}`;
    },

    // Vector math (3-component vectors as space-separated strings)
    vectoradd(a: any, b: any): string {
      const [ax, ay, az] = parseVector(a);
      const [bx, by, bz] = parseVector(b);
      return `${ax + bx} ${ay + by} ${az + bz}`;
    },
    vectorsub(a: any, b: any): string {
      const [ax, ay, az] = parseVector(a);
      const [bx, by, bz] = parseVector(b);
      return `${ax - bx} ${ay - by} ${az - bz}`;
    },
    vectorscale(v: any, s: any): string {
      const [x, y, z] = parseVector(v);
      const scale = toNum(s);
      return `${x * scale} ${y * scale} ${z * scale}`;
    },
    vectordot(a: any, b: any): number {
      const [ax, ay, az] = parseVector(a);
      const [bx, by, bz] = parseVector(b);
      return ax * bx + ay * by + az * bz;
    },
    vectorcross(a: any, b: any): string {
      const [ax, ay, az] = parseVector(a);
      const [bx, by, bz] = parseVector(b);
      return `${ay * bz - az * by} ${az * bx - ax * bz} ${ax * by - ay * bx}`;
    },
    vectorlen(v: any): number {
      const [x, y, z] = parseVector(v);
      return Math.sqrt(x * x + y * y + z * z);
    },
    vectornormalize(v: any): string {
      const [x, y, z] = parseVector(v);
      const len = Math.sqrt(x * x + y * y + z * z);
      if (len === 0) return "0 0 0";
      return `${x / len} ${y / len} ${z / len}`;
    },
    vectordist(a: any, b: any): number {
      const [ax, ay, az] = parseVector(a);
      const [bx, by, bz] = parseVector(b);
      const dx = ax - bx;
      const dy = ay - by;
      const dz = az - bz;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },

    // Matrix math - these require full 3D matrix operations with axis-angle/quaternion
    // conversions that we haven't implemented
    matrixcreate(_pos: any, _rot: any): string {
      throw new Error(
        "MatrixCreate() not implemented: requires axis-angle rotation math",
      );
    },
    matrixcreatefromeuler(_euler: any): string {
      throw new Error(
        "MatrixCreateFromEuler() not implemented: requires Euler→Quaternion→AxisAngle conversion",
      );
    },
    matrixmultiply(_a: any, _b: any): string {
      throw new Error(
        "MatrixMultiply() not implemented: requires full 4x4 matrix multiplication",
      );
    },
    matrixmulpoint(_mat: any, _point: any): string {
      throw new Error(
        "MatrixMulPoint() not implemented: requires full transform application",
      );
    },
    matrixmulvector(_mat: any, _vec: any): string {
      throw new Error(
        "MatrixMulVector() not implemented: requires rotation matrix application",
      );
    },

    // Simulation
    getsimtime(): number {
      return Date.now() - runtime().state.startTime;
    },
    getrealtime(): number {
      return Date.now();
    },

    // Schedule
    schedule(
      delay: any,
      _obj: any,
      func: any,
      ...args: any[]
    ): ReturnType<typeof setTimeout> {
      const ms = Number(delay) || 0;
      const rt = runtime();
      const timeoutId = setTimeout(() => {
        rt.state.pendingTimeouts.delete(timeoutId);
        try {
          rt.$f.call(String(func), ...args);
        } catch (err) {
          console.error(`schedule: error calling ${func}:`, err);
          throw err;
        }
      }, ms);
      rt.state.pendingTimeouts.add(timeoutId);
      return timeoutId;
    },
    cancel(id: any): void {
      clearTimeout(id);
      runtime().state.pendingTimeouts.delete(id);
    },
    iseventpending(id: any): boolean {
      return runtime().state.pendingTimeouts.has(id);
    },

    // Script loading
    exec(path: any): boolean {
      const pathString = String(path ?? "");
      console.debug(
        `exec(${JSON.stringify(pathString)}): preparing to execute…`,
      );

      // Engine requires an extension - check for a '.' in the filename
      if (!pathString.includes(".")) {
        console.error(
          `exec: invalid script file name ${JSON.stringify(pathString)}.`,
        );
        return false;
      }

      const normalizedPath = normalizePath(pathString);
      const rt = runtime();
      const { executedScripts, scripts } = rt.state;

      // Check if already executed
      if (executedScripts.has(normalizedPath)) {
        console.debug(
          `exec(${JSON.stringify(pathString)}): skipping (already executed)`,
        );
        return true;
      }

      // Get the pre-parsed AST from the scripts map
      const ast = scripts.get(normalizedPath);
      if (ast == null) {
        console.warn(`exec(${JSON.stringify(pathString)}): script not found`);
        return false;
      }

      // Mark as executed before running (handles circular deps)
      executedScripts.add(normalizedPath);

      console.debug(`exec(${JSON.stringify(pathString)}): executing!`);
      rt.executeAST(ast);
      return true;
    },
    compile(_path: any): boolean {
      throw new Error(
        "compile() not implemented: requires DSO bytecode compiler",
      );
    },

    // Misc
    isdemo(): boolean {
      // NOTE: Refers to demo version of the game, not demo recordings (.rec file playback)
      return false;
    },

    // Files
    isfile(path: any): boolean {
      if (!fileSystem) {
        console.warn("isFile(): no fileSystem handler configured");
        return false;
      }
      return fileSystem.isFile(toStr(path));
    },
    fileext(path: any): string {
      const s = toStr(path);
      const dot = s.lastIndexOf(".");
      return dot >= 0 ? s.substring(dot) : "";
    },
    filebase(path: any): string {
      const s = toStr(path);
      const slash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
      const dot = s.lastIndexOf(".");
      const start = slash >= 0 ? slash + 1 : 0;
      const end = dot > start ? dot : s.length;
      return s.substring(start, end);
    },
    filepath(path: any): string {
      const s = toStr(path);
      const slash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
      return slash >= 0 ? s.substring(0, slash) : "";
    },
    expandfilename(_path: any): string {
      throw new Error(
        "expandFilename() not implemented: requires filesystem path expansion",
      );
    },
    findfirstfile(pattern: any): string {
      if (!fileSystem) {
        console.warn("findFirstFile(): no fileSystem handler configured");
        return "";
      }
      fileSearchPattern = toStr(pattern);
      fileSearchResults = fileSystem.findFiles(fileSearchPattern);
      fileSearchIndex = 0;
      return fileSearchResults[fileSearchIndex++] ?? "";
    },
    findnextfile(pattern: any): string {
      const patternStr = toStr(pattern);
      // If pattern changed, get new results but keep the cursor position.
      // This matches engine behavior where the cursor is global and persists
      // across pattern changes. If the cursor is past the end of the new
      // results, we return "" (no more matches).
      if (patternStr !== fileSearchPattern) {
        if (!fileSystem) {
          return "";
        }
        fileSearchPattern = patternStr;
        fileSearchResults = fileSystem.findFiles(patternStr);
        // Don't reset fileSearchIndex - maintain global cursor position
      }
      return fileSearchResults[fileSearchIndex++] ?? "";
    },
    getfilecrc(path: any): string {
      // Return path as a pseudo-CRC for identification purposes
      return toStr(path);
    },
    iswriteablefilename(path: any): boolean {
      return false;
    },

    // Package management
    activatepackage(name: any): void {
      runtime().$.activatePackage(toStr(name));
    },
    deactivatepackage(name: any): void {
      runtime().$.deactivatePackage(toStr(name));
    },
    ispackage(name: any): boolean {
      return runtime().$.isPackage(toStr(name));
    },
    isactivepackage(name: any): boolean {
      return runtime().$.isActivePackage(toStr(name));
    },
    getpackagelist(): string {
      return runtime().$.getPackageList();
    },

    // Messaging (stubs - no networking layer)
    addmessagecallback(_msgType: any, _callback: any): void {
      // No-op: message callbacks are for multiplayer networking
    },

    // ===== ENGINE STUBS =====
    // These functions are called by scripts but require engine features we don't have.
    // They're implemented as no-ops or return sensible defaults.

    // Audio (OpenAL)
    alxcreatesource(..._args: any[]): number {
      return 0;
    },
    alxgetwavelen(_source: any): number {
      return 0;
    },
    alxlistenerf(_param: any, _value: any): void {},
    alxplay(..._args: any[]): number {
      return 0;
    },
    alxsetchannelvolume(_channel: any, _volume: any): void {},
    alxsourcef(_source: any, _param: any, _value: any): void {},
    alxstop(_source: any): void {},
    alxstopall(): void {},

    // Device I/O
    activatedirectinput(): void {},
    activatekeyboard(): void {},
    deactivatedirectinput(): void {},
    deactivatekeyboard(): void {},
    disablejoystick(): void {},
    enablejoystick(): void {},
    enablewinconsole(_enable: any): void {},
    isjoystickdetected(): boolean {
      return false;
    },
    lockmouse(_lock: any): void {},

    // Video/Display
    addmaterialmapping(_from: any, _to: any): void {},
    flushtexturecache(): void {},
    getdesktopresolution(): string {
      return "1920 1080 32";
    },
    getdisplaydevicelist(): string {
      return "OpenGL";
    },
    getresolutionlist(_device: any): string {
      return "640 480\t800 600\t1024 768\t1280 720\t1920 1080";
    },
    getvideodriverinfo(): string {
      return "WebGL";
    },
    isdevicefullscreenonly(_device: any): boolean {
      return false;
    },
    isfullscreen(): boolean {
      return false;
    },
    screenshot(_filename: any): void {},
    setdisplaydevice(_device: any): boolean {
      return true;
    },
    setfov(_fov: any): void {},
    setinteriorrendermode(_mode: any): void {},
    setopenglanisotropy(_level: any): void {},
    setopenglmipreduction(_level: any): void {},
    setopenglskymipreduction(_level: any): void {},
    setopengltexturecompressionhint(_hint: any): void {},
    setscreenmode(
      _width: any,
      _height: any,
      _bpp: any,
      _fullscreen: any,
    ): void {},
    setverticalsync(_enable: any): void {},
    setzoomspeed(_speed: any): void {},
    togglefullscreen(): void {},
    videosetgammacorrection(_gamma: any): void {},
    snaptoggle(): void {},

    // Networking
    addtaggedstring(_str: any): number {
      return 0;
    },
    buildtaggedstring(_format: any, ..._args: any[]): string {
      return "";
    },
    detag(_tagged: any): string {
      return toStr(_tagged);
    },
    gettag(_str: any): number {
      return 0;
    },
    gettaggedstring(_tag: any): string {
      return "";
    },
    removetaggedstring(_tag: any): void {},
    commandtoclient(_client: any, _func: any, ..._args: any[]): void {},
    commandtoserver(_func: any, ..._args: any[]): void {},
    cancelserverquery(): void {},
    querymasterserver(..._args: any[]): void {},
    querysingleserver(..._args: any[]): void {},
    setnetport(_port: any): boolean {
      return true;
    },
    allowconnections(_allow: any): void {},
    startheartbeat(): void {},
    stopheartbeat(): void {},
    gotowebpage(_url: any): void {
      // Could potentially open URL in browser
    },

    // Simulation management
    deletedatablocks(): void {
      // Clears all datablocks in preparation for loading a new mission.
      // For map parsing, we don't need to actually delete anything.
    },
    preloaddatablock(_datablock: any): boolean {
      return true;
    },

    // Scene/Physics
    containerboxempty(..._args: any[]): boolean {
      return true;
    },
    containerraycast(..._args: any[]): string {
      return "";
    },
    containersearchcurrdist(): number {
      return 0;
    },
    containersearchnext(): number {
      return 0;
    },
    initcontainerradiussearch(..._args: any[]): void {},
    calcexplosioncoverage(..._args: any[]): number {
      return 1;
    },
    getcontrolobjectaltitude(): number {
      return 0;
    },
    getcontrolobjectspeed(): number {
      return 0;
    },
    getterrainheight(_pos: any): number {
      return 0;
    },
    lightscene(..._args: any[]): void {},
    pathonmissionloaddone(): void {},
  };
}
