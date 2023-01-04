import { abortable } from "https://deno.land/std@0.165.0/async/mod.ts";
import { iterLine } from "./iterLine.ts";

export const getRootDir = async (
  cwd: string,
  gitCommand: string,
  abortController: AbortController,
): Promise<string | undefined> => {
  const cmd = [
    gitCommand,
    "rev-parse",
    "--show-superproject-working-tree",
    "--show-toplevel",
  ];

  const proc = Deno.run({
    cmd: cmd,
    stdout: "piped",
    stderr: "piped",
    stdin: "null",
    cwd: cwd,
  });

  const lines: string[] = [];

  for await (
    const line of abortable(
      iterLine(proc.stdout),
      abortController.signal,
    )
  ) {
    line.trim();
    lines.push(line);
  }

  return lines[0];
};
