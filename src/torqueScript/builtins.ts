import type { BuiltinsContext, TorqueFunction } from "./types";
import { normalizePath } from "./utils";

function parseVector(v: any): [number, number, number] {
  const parts = String(v ?? "0 0 0")
    .split(" ")
    .map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

// TorqueScript unit delimiters (from SDK source):
// - Words: space, tab, newline (" \t\n")
// - Fields: tab, newline ("\t\n")
// - Records: newline ("\n")
const FIELD_DELIM = /[\t\n]/;
const FIELD_DELIM_CHAR = "\t"; // Use tab when joining

/**
 * Default TorqueScript built-in functions.
 *
 * Names are lowercased to optimize lookup, since TorqueScript is case-insensitive.
 */
export function createBuiltins(
  ctx: BuiltinsContext,
): Record<string, TorqueFunction> {
  const { runtime } = ctx;
  return {
    // Console
    echo(...args: any[]): void {
      console.log(...args.map((a) => String(a ?? "")));
    },
    warn(...args: any[]): void {
      console.warn(...args.map((a) => String(a ?? "")));
    },
    error(...args: any[]): void {
      console.error(...args.map((a) => String(a ?? "")));
    },
    call(funcName: any, ...args: any[]): any {
      return runtime().$f.call(String(funcName ?? ""), ...args);
    },
    eval(_code: any): any {
      throw new Error(
        "eval() not implemented: requires runtime parsing and execution",
      );
    },
    collapseescape(str: any): string {
      // Single-pass replacement to correctly handle sequences like \\n
      return String(str ?? "").replace(/\\([ntr\\])/g, (_, char) => {
        if (char === "n") return "\n";
        if (char === "t") return "\t";
        if (char === "r") return "\r";
        return "\\";
      });
    },
    expandescape(str: any): string {
      return String(str ?? "")
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
      return String(str ?? "").length;
    },
    strchr(str: any, char: any): string {
      // Returns remainder of string starting at first occurrence of char, or ""
      const s = String(str ?? "");
      const c = String(char ?? "")[0] ?? "";
      const idx = s.indexOf(c);
      return idx >= 0 ? s.substring(idx) : "";
    },
    strpos(haystack: any, needle: any, offset?: any): number {
      const s = String(haystack ?? "");
      const n = String(needle ?? "");
      const o = Number(offset) || 0;
      return s.indexOf(n, o);
    },
    strcmp(a: any, b: any): number {
      const sa = String(a ?? "");
      const sb = String(b ?? "");
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    },
    stricmp(a: any, b: any): number {
      const sa = String(a ?? "").toLowerCase();
      const sb = String(b ?? "").toLowerCase();
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    },
    strstr(haystack: any, needle: any): number {
      return String(haystack ?? "").indexOf(String(needle ?? ""));
    },
    getsubstr(str: any, start: any, len?: any): string {
      const s = String(str ?? "");
      const st = Number(start) || 0;
      if (len === undefined) return s.substring(st);
      return s.substring(st, st + (Number(len) || 0));
    },
    getword(str: any, index: any): string {
      const words = String(str ?? "").split(/\s+/);
      const i = Number(index) || 0;
      return words[i] ?? "";
    },
    getwordcount(str: any): number {
      const s = String(str ?? "").trim();
      if (s === "") return 0;
      return s.split(/\s+/).length;
    },
    getfield(str: any, index: any): string {
      const fields = String(str ?? "").split(FIELD_DELIM);
      const i = Number(index) || 0;
      return fields[i] ?? "";
    },
    getfieldcount(str: any): number {
      const s = String(str ?? "");
      if (s === "") return 0;
      return s.split(FIELD_DELIM).length;
    },
    setword(str: any, index: any, value: any): string {
      const words = String(str ?? "").split(/\s+/);
      const i = Number(index) || 0;
      words[i] = String(value ?? "");
      return words.join(" ");
    },
    setfield(str: any, index: any, value: any): string {
      const fields = String(str ?? "").split(FIELD_DELIM);
      const i = Number(index) || 0;
      fields[i] = String(value ?? "");
      return fields.join(FIELD_DELIM_CHAR);
    },
    firstword(str: any): string {
      const words = String(str ?? "").split(/\s+/);
      return words[0] ?? "";
    },
    restwords(str: any): string {
      const words = String(str ?? "").split(/\s+/);
      return words.slice(1).join(" ");
    },
    trim(str: any): string {
      return String(str ?? "").trim();
    },
    ltrim(str: any): string {
      return String(str ?? "").replace(/^\s+/, "");
    },
    rtrim(str: any): string {
      return String(str ?? "").replace(/\s+$/, "");
    },
    strupr(str: any): string {
      return String(str ?? "").toUpperCase();
    },
    strlwr(str: any): string {
      return String(str ?? "").toLowerCase();
    },
    strreplace(str: any, from: any, to: any): string {
      return String(str ?? "")
        .split(String(from ?? ""))
        .join(String(to ?? ""));
    },
    filterstring(str: any, _replacementChars?: any): string {
      // Filters profanity/bad words from the string (requires bad word dictionary)
      // Since we don't have a bad word filter, just return the string unchanged
      return String(str ?? "");
    },
    stripchars(str: any, chars: any): string {
      // Removes all characters in `chars` from the string
      const s = String(str ?? "");
      const toRemove = new Set(String(chars ?? "").split(""));
      return s
        .split("")
        .filter((c) => !toRemove.has(c))
        .join("");
    },
    getfields(str: any, start: any, end?: any): string {
      const fields = String(str ?? "").split(FIELD_DELIM);
      const s = Number(start) || 0;
      const e = end !== undefined ? Number(end) + 1 : 1000000;
      return fields.slice(s, e).join(FIELD_DELIM_CHAR);
    },
    getwords(str: any, start: any, end?: any): string {
      const words = String(str ?? "").split(/\s+/);
      const s = Number(start) || 0;
      const e = end !== undefined ? Number(end) + 1 : 1000000;
      return words.slice(s, e).join(" ");
    },
    removeword(str: any, index: any): string {
      const words = String(str ?? "").split(/\s+/);
      const i = Number(index) || 0;
      words.splice(i, 1);
      return words.join(" ");
    },
    removefield(str: any, index: any): string {
      const fields = String(str ?? "").split(FIELD_DELIM);
      const i = Number(index) || 0;
      fields.splice(i, 1);
      return fields.join(FIELD_DELIM_CHAR);
    },
    getrecord(str: any, index: any): string {
      const records = String(str ?? "").split("\n");
      const i = Number(index) || 0;
      return records[i] ?? "";
    },
    getrecordcount(str: any): number {
      const s = String(str ?? "");
      if (s === "") return 0;
      return s.split("\n").length;
    },
    setrecord(str: any, index: any, value: any): string {
      const records = String(str ?? "").split("\n");
      const i = Number(index) || 0;
      records[i] = String(value ?? "");
      return records.join("\n");
    },
    removerecord(str: any, index: any): string {
      const records = String(str ?? "").split("\n");
      const i = Number(index) || 0;
      records.splice(i, 1);
      return records.join("\n");
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
      return String(str ?? "")
        .replace(/[^\w\s-]/g, "")
        .trim();
    },

    // Math functions
    mabs(n: any): number {
      return Math.abs(Number(n) || 0);
    },
    mfloor(n: any): number {
      return Math.floor(Number(n) || 0);
    },
    mceil(n: any): number {
      return Math.ceil(Number(n) || 0);
    },
    msqrt(n: any): number {
      return Math.sqrt(Number(n) || 0);
    },
    mpow(base: any, exp: any): number {
      return Math.pow(Number(base) || 0, Number(exp) || 0);
    },
    msin(n: any): number {
      return Math.sin(Number(n) || 0);
    },
    mcos(n: any): number {
      return Math.cos(Number(n) || 0);
    },
    mtan(n: any): number {
      return Math.tan(Number(n) || 0);
    },
    masin(n: any): number {
      return Math.asin(Number(n) || 0);
    },
    macos(n: any): number {
      return Math.acos(Number(n) || 0);
    },
    matan(rise: any, run: any): number {
      // SDK: mAtan(rise, run) - always requires 2 args, returns atan2
      return Math.atan2(Number(rise) || 0, Number(run) || 0);
    },
    mlog(n: any): number {
      return Math.log(Number(n) || 0);
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
        return Math.floor(Math.random() * (Number(a) + 1));
      }
      const min = Number(a) || 0;
      const max = Number(b) || 0;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    mdegtorad(deg: any): number {
      return (Number(deg) || 0) * (Math.PI / 180);
    },
    mradtodeg(rad: any): number {
      return (Number(rad) || 0) * (180 / Math.PI);
    },
    mfloatlength(n: any, precision: any): string {
      return (Number(n) || 0).toFixed(Number(precision) || 0);
    },
    getboxcenter(box: any): string {
      // Box format: "minX minY minZ maxX maxY maxZ"
      const parts = String(box ?? "")
        .split(" ")
        .map(Number);
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
      const scale = Number(s) || 0;
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
        rt.$f.call(String(func), ...args);
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
      // FIXME: Unsure if this is referring to demo (.rec) playback, or a demo
      // version of the game.
      return false;
    },

    // Files
    isfile(_path: any): boolean {
      throw new Error("isFile() not implemented: requires filesystem access");
    },
    fileext(path: any): string {
      const s = String(path ?? "");
      const dot = s.lastIndexOf(".");
      return dot >= 0 ? s.substring(dot) : "";
    },
    filebase(path: any): string {
      const s = String(path ?? "");
      const slash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
      const dot = s.lastIndexOf(".");
      const start = slash >= 0 ? slash + 1 : 0;
      const end = dot > start ? dot : s.length;
      return s.substring(start, end);
    },
    filepath(path: any): string {
      const s = String(path ?? "");
      const slash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
      return slash >= 0 ? s.substring(0, slash) : "";
    },
    expandfilename(_path: any): string {
      throw new Error(
        "expandFilename() not implemented: requires filesystem path expansion",
      );
    },
    findfirstfile(_pattern: any): string {
      throw new Error(
        "findFirstFile() not implemented: requires filesystem directory listing",
      );
    },
    findnextfile(_pattern: any): string {
      throw new Error(
        "findNextFile() not implemented: requires filesystem directory listing",
      );
    },
    getfilecrc(_path: any): number {
      throw new Error(
        "getFileCRC() not implemented: requires filesystem access",
      );
    },
    iswriteablefilename(path: any): boolean {
      return false;
    },

    // Package management
    activatepackage(name: any): void {
      runtime().$.activatePackage(String(name ?? ""));
    },
    deactivatepackage(name: any): void {
      runtime().$.deactivatePackage(String(name ?? ""));
    },
    ispackage(name: any): boolean {
      return runtime().$.isPackage(String(name ?? ""));
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
      return String(_tagged ?? "");
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
    startheartbeat(): void {},
    stopheartbeat(): void {},
    gotowebpage(_url: any): void {
      // Could potentially open URL in browser
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
