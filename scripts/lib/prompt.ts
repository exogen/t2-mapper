/**
 * Yes/no and pick-one prompts for interactive scripts. With `yes` every
 * prompt takes its default without asking; without a TTY and without
 * `yes` the script refuses rather than hanging.
 */
import readline from "node:readline/promises";

export interface Prompter {
  confirm(question: string, defaultValue?: boolean): Promise<boolean>;
  choose<T>(
    question: string,
    options: { label: string; value: T }[],
    defaultIndex?: number,
  ): Promise<T>;
  close(): void;
}

export function createPrompter({
  yes = false,
}: { yes?: boolean } = {}): Prompter {
  const interactive = !yes && process.stdin.isTTY && process.stdout.isTTY;
  if (!yes && !interactive) {
    console.error("Not a terminal: pass --yes to accept every default.");
    process.exit(1);
  }
  const rl = interactive
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;
  // Without a listener, readline swallows Ctrl-C at a question (it only
  // pauses stdin), so the script would hang instead of quitting.
  rl?.on("SIGINT", () => {
    rl.close();
    console.log();
    process.exit(130);
  });

  return {
    async confirm(question, defaultValue = true) {
      const hint = defaultValue ? "Y/n" : "y/N";
      if (!rl) {
        console.log(`${question} [${hint}] ${defaultValue ? "y" : "n"}`);
        return defaultValue;
      }
      const answer = (await rl.question(`${question} [${hint}] `)).trim();
      if (answer === "") return defaultValue;
      return /^y(es)?$/i.test(answer);
    },
    async choose(question, options, defaultIndex = 0) {
      console.log(question);
      options.forEach((o, i) => {
        console.log(
          `  ${i + 1}) ${o.label}${i === defaultIndex ? " (default)" : ""}`,
        );
      });
      if (!rl) return options[defaultIndex].value;
      for (;;) {
        const answer = (
          await rl.question(`Choice [${defaultIndex + 1}]: `)
        ).trim();
        if (answer === "") return options[defaultIndex].value;
        const n = parseInt(answer, 10);
        if (n >= 1 && n <= options.length) return options[n - 1].value;
        console.log(`Enter a number from 1 to ${options.length}.`);
      }
    },
    close() {
      rl?.close();
    },
  };
}
