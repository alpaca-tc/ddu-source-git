import {
  BaseSource,
  Item,
  SourceOptions,
} from "https://deno.land/x/ddu_vim@v2.0.0/types.ts";
import { Denops, fn } from "https://deno.land/x/ddu_vim@v2.0.0/deps.ts";
import { abortable } from "https://deno.land/std@0.165.0/async/mod.ts";
import { sprintf } from "https://deno.land/std@0.41.0/fmt/sprintf.ts";
import { relative } from "https://deno.land/std@0.165.0/path/mod.ts";
import { ActionData } from "../@ddu-kinds/git_worktree.ts";
import { Params as KindParams } from "../@ddu-kinds/git_worktree.ts";
import { getRootDir } from "../getRootDir.ts";
import { iterLine } from "../iterLine.ts";

type Params = KindParams & {
  path: string;
  current: boolean;
};

type WorktreeRecord = {
  path: string;
  head: string;
  branch: string;
  isBare: boolean;
  isDetached: boolean;
};

const parsePorcelain = (lines: string[]): WorktreeRecord[] => {
  const records: WorktreeRecord[] = [];
  let current: WorktreeRecord | undefined;

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      current = {
        path: line.slice("worktree ".length),
        head: "",
        branch: "",
        isBare: false,
        isDetached: false,
      };
      records.push(current);
    } else if (!current) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch refs/heads/".length);
    } else if (line === "bare") {
      current.isBare = true;
    } else if (line === "detached") {
      current.isDetached = true;
    }
  }

  return records;
};

export class Source extends BaseSource<Params> {
  override kind = "git_worktree";

  override gather(args: {
    denops: Denops;
    sourceOptions: SourceOptions;
    sourceParams: Params;
    input: string;
  }): ReadableStream<Item<ActionData>[]> {
    const abortController = new AbortController();

    return new ReadableStream({
      async start(controller) {
        const cwd = args.sourceParams.path === ""
          ? await fn.getcwd(args.denops) as string
          : args.sourceParams.path;

        const rootDir = await getRootDir(
          cwd,
          args.sourceParams.gitCommand,
          abortController,
        );

        if (!rootDir) {
          // not git directory
          controller.enqueue([]);
          controller.close();
          return;
        }

        const cmd = [
          args.sourceParams.gitCommand,
          "worktree",
          "list",
          "--porcelain",
        ];

        const proc = Deno.run({
          cmd: cmd,
          stdout: "piped",
          stderr: "piped",
          stdin: "null",
          cwd: rootDir,
        });

        const lines: string[] = [];

        try {
          for await (
            const line of abortable(
              iterLine(proc.stdout),
              abortController.signal,
            )
          ) {
            lines.push(line);
          }

          const records = parsePorcelain(lines);

          const displayPaths = records.map((record) =>
            args.sourceParams.current ? relative(cwd, record.path) : record.path
          );
          const pathWidth = Math.max(
            40,
            ...displayPaths.map((p) => p.length),
          );

          const items: Item<ActionData>[] = records.map((record, i) => {
            const isCurrent = record.path === cwd;
            const suffix = record.isBare
              ? "(bare)"
              : record.isDetached
              ? `(detached ${record.head.slice(0, 7)})`
              : record.branch;

            const word = sprintf(
              `%s %-${pathWidth}s %s`,
              isCurrent ? "*" : " ",
              displayPaths[i],
              suffix,
            );

            return {
              word,
              action: {
                cwd: rootDir,
                path: record.path,
                head: record.head,
                branch: record.branch,
                isCurrent,
                isBare: record.isBare,
                isDetached: record.isDetached,
              },
            };
          });

          if (items.length) {
            controller.enqueue(items);
          }
        } catch (e: unknown) {
          if (e instanceof DOMException) {
            proc.kill("SIGTERM");
          } else {
            console.error(e);
          }
        } finally {
          const [status, stderr] = await Promise.all([
            proc.status(),
            proc.stderrOutput(),
          ]);
          proc.close();
          if (!status.success) {
            const mes = new TextDecoder().decode(stderr);
            console.error(mes);
          }
          controller.close();
        }
      },

      cancel(reason): void {
        abortController.abort(reason);
      },
    });
  }

  override params(): Params {
    return {
      gitCommand: "git",
      preset: "worktree",
      addCommand: [],
      deleteCommand: [],
      forceDeleteCommand: [],
      path: "",
      current: false,
    };
  }
}
