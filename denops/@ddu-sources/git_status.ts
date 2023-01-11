import {
  BaseSource,
  Item,
  SourceOptions,
} from "https://deno.land/x/ddu_vim@v2.0.0/types.ts";
import { Denops, fn } from "https://deno.land/x/ddu_vim@v2.0.0/deps.ts";
import { abortable } from "https://deno.land/std@0.165.0/async/mod.ts";
import { ActionData } from "../@ddu-kinds/git_status.ts";
import { Params as KindParams } from "../@ddu-kinds/git_branch.ts";
import { TextLineStream } from "https://deno.land/std@0.165.0/streams/mod.ts";
import { StatusSymbol, StatusSymbols } from "../@ddu-kinds/git_status.ts";
import { join } from "https://deno.land/std@0.159.0/path/mod.ts";
import { sprintf } from "https://deno.land/std@0.41.0/fmt/sprintf.ts";
import { getRootDir } from "../getRootDir.ts";

type Params = KindParams & {
  path: string;
};

async function* iterLine(r: Deno.Reader): AsyncIterable<string> {
  const lines = r.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());

  for await (const line of lines) {
    if (line.length) {
      yield line;
    }
  }
}

const STATUS_RE = /^(.)(.)\s(.*)$/;

const resolveStatusSymbol = (maybeSymbol: string): StatusSymbol => {
  if (maybeSymbol in StatusSymbols) {
    return maybeSymbol as StatusSymbol;
  } else {
    return " " as StatusSymbol;
  }
};

export class Source extends BaseSource<Params> {
  override kind = "git_status";

  override gather(args: {
    denops: Denops;
    sourceOptions: SourceOptions;
    sourceParams: Params;
    input: string;
  }): ReadableStream<Item<ActionData>[]> {
    const abortController = new AbortController();

    const parseLine = (line: string, rootDir: string): Item<ActionData> => {
      line.trim();
      const match = line.match(STATUS_RE);

      if (match) {
        const index = resolveStatusSymbol(match[1]);
        const workingTree = resolveStatusSymbol(match[2]);
        const relativePath = String(match[3]);
        const word = sprintf(
          "%-12s%-12s %s",
          `[${StatusSymbols[index]}]`,
          `<${StatusSymbols[workingTree]}>`,
          relativePath,
        );

        return {
          word,
          action: {
            rootDir,
            index,
            workingTree,
            fullpath: join(rootDir, relativePath),
          },
        };
      } else {
        throw new Error("Failed to parse git status");
      }
    };

    const scopedGetRootDir = async (
      cwd: string,
    ): Promise<string | undefined> => {
      return await getRootDir(
        cwd,
        args.sourceParams.gitCommand,
        abortController,
      );
    };

    return new ReadableStream({
      async start(controller) {
        const cwd = args.sourceParams.path === ""
          ? await fn.getcwd(args.denops) as string
          : args.sourceParams.path;

        const rootDir = await scopedGetRootDir(cwd);

        if (!rootDir) {
          // not git directory
          controller.enqueue([]);
          return;
        }

        const items: Item<ActionData>[] = [];

        const cmd = [
          args.sourceParams.gitCommand,
          "status",
          "--porcelain=v1",
        ];

        const proc = Deno.run({
          cmd: cmd,
          stdout: "piped",
          stderr: "piped",
          stdin: "null",
          cwd: cwd,
        });

        try {
          for await (
            const line of abortable(
              iterLine(proc.stdout),
              abortController.signal,
            )
          ) {
            items.push(parseLine(line, rootDir));
          }
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
      path: "",
    };
  }
}
