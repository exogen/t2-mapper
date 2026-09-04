/**
 * The little argv conventions the scripts share: `--name value` options,
 * `--name` switches, the positionals left over, and a usage line that
 * exits. Kept deliberately small — a script wanting more uses
 * `node:util`'s parseArgs.
 */

const argv = process.argv.slice(2);

/** The value after `--name`, or the fallback. A following flag is not
 *  a value: `--out --no-world` leaves `out` unset. */
export function arg(name: string, fallback?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = argv[i + 1];
  return next != null && !next.startsWith("--") ? next : fallback;
}

/** Whether `--name` was given. */
export function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}

/**
 * The arguments that are neither options nor their values. Every
 * `--name` followed by a non-flag token is taken as a valued option;
 * name the switches that take no value so what follows them stays
 * positional.
 */
export function positionals(switches: string[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const next = argv[i + 1];
      if (
        !switches.includes(token.slice(2)) &&
        next &&
        !next.startsWith("--")
      ) {
        i++;
      }
      continue;
    }
    out.push(token);
  }
  return out;
}

/** Print the usage line and exit. */
export function usage(text: string): never {
  console.error(`usage: ${text}`);
  process.exit(1);
}
