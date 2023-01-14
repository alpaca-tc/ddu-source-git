import {
  BaseSource,
  Item,
  SourceOptions,
} from "https://deno.land/x/ddu_vim@v2.0.0/types.ts";
import { Denops, fn } from "https://deno.land/x/ddu_vim@v2.0.0/deps.ts";
import { join, resolve } from "https://deno.land/std@0.166.0/path/mod.ts";
import { relative } from "https://deno.land/std@0.166.0/path/mod.ts";
import { abortable } from "https://deno.land/std@0.165.0/async/mod.ts";
import { ActionData } from "../@ddu-kinds/git_branch.ts";
import { Params as KindParams } from "../@ddu-kinds/git_branch.ts";
import { TextLineStream } from "https://deno.land/std@0.165.0/streams/mod.ts";

type Params = KindParams & {
  path: string;
  args: string[];
};

type Branch = {
  fullName: string;
  isCurrent: boolean;
  isRemote: boolean;
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

const BRANCH_NAME_RE = /^(\*?)\s+(\S+)/;

export class Source extends BaseSource<Params> {
  override kind = "git_branch";

  override gather(args: {
    denops: Denops;
    sourceOptions: SourceOptions;
    sourceParams: Params;
    input: string;
  }): ReadableStream<Item<ActionData>[]> {
    const abortController = new AbortController();

    const parseLine = (line: string, cwd: string): Item<ActionData> => {
      line.trim();
      const match = line.match(BRANCH_NAME_RE);

      if (match) {
        const isCurrent = match[1];
        const fullName = match[2];

        return {
          word: line,
          action: {
            cwd: cwd,
            fullName: fullName,
            isRemote: fullName.startsWith("remotes/"),
            isCurrent: !!isCurrent,
          },
        };
      } else {
        return {
          word: "(no branch)",
          action: {
            cwd: cwd,
            fullName: "",
            isRemote: false,
            isCurrent: false,
          },
        };
      }
    };

    return new ReadableStream({
      async start(controller) {
        const cmd = [
          args.sourceParams.gitCommand,
          "branch",
          ...args.sourceParams.args,
        ];
        const cwd = args.sourceParams.path === ""
          ? await fn.getcwd(args.denops) as string
          : args.sourceParams.path;

        const items: Item<ActionData>[] = [];

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
            items.push(parseLine(line, cwd));
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
      args: [],
    };
  }
}
