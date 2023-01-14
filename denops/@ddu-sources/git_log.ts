import {
  BaseSource,
  Item,
  SourceOptions,
} from "https://deno.land/x/ddu_vim@v2.0.0/types.ts";
import { Denops, fn } from "https://deno.land/x/ddu_vim@v2.0.0/deps.ts";
import { abortable } from "https://deno.land/std@0.165.0/async/mod.ts";
import { ActionData } from "../@ddu-kinds/git_log.ts";
import { Params as KindParams } from "../@ddu-kinds/git_log.ts";
import { sprintf } from "https://deno.land/std@0.41.0/fmt/sprintf.ts";
import { getRootDir } from "../getRootDir.ts";
import { DelimiterStream } from "https://deno.land/std@0.165.0/streams/mod.ts";

// "abbreviatedCommit": "%h",
// "tree": "%T",
// "abbreviatedTree": "%t",
// "parent": "%P",
// "abbreviatedParent": "%p",
// "commitNotes": "%N",
// "verificationFlag": "%G?",
// "signer": "%GS",
// "signerKey": "%GK",

const FORMAT_DELIMITER = "---*DELIMITER*---";
const FORMAT_END = "---*END*---";

const PRETTY_FORMATS: { [key: string]: string } = {
  commit: "%H",
  subject: "%s",
  body: "%b",
  sanitizedSubjectLine: "%f",
  refs: "%D",
  author_name: "%aN",
  author_email: "%aE",
  author_date: "%ad",
  commiter_name: "%cN",
  commiter_email: "%cE",
  commiter_date: "%cd",
};

const PRETTY_FORMAT =
  Object.keys(PRETTY_FORMATS).map((key) =>
    `${key}${FORMAT_DELIMITER}${PRETTY_FORMATS[key]}${FORMAT_DELIMITER}`
  ).join("") + FORMAT_END;

const eachPair = (
  arr: string[],
  iterator: (key: string, value: string) => void,
): void => {
  for (let i = 0, l = arr.length; i < l; i += 2) {
    const key = arr[i];
    const value = arr[i + 1];

    iterator(key, value);
  }
};

type PrettyFormat = {
  commit: string;
  // abbreviatedCommit: string;
  // tree: string;
  // abbreviatedTree: string;
  // parent: string;
  // abbreviatedParent: string;
  refs: string;
  subject: string;
  // sanitizedSubjectLine: string;
  body: string;
  // commitNotes: string;
  // verificationFlag: string;
  // signer: string;
  // signerKey: string;
  // date: string;
  author_name: string;
  author_email: string;
  author_date: string;
  commiter_name: string;
  commiter_email: string;
  commiter_date: string;
};

const PRETTY_FORMAT_KEYS: Array<keyof PrettyFormat> = [
  "commit",
  "refs",
  "subject",
  "body",
  "author_name",
  "author_email",
  "author_date",
  "commiter_name",
  "commiter_email",
  "commiter_date",
];

type Params = KindParams & {
  path: string;
  lineCount: number;
  dateFormat: string;
  lineFormat: string;
  wrapFormat: { [K in keyof PrettyFormat]?: string };
};

const embedVariableRe = /<([^>]+)>/g;

const extractEmbedVariableKeys = (
  format: string,
): Array<keyof PrettyFormat> => {
  const keys = [...format.matchAll(embedVariableRe)].map((m) =>
    m[1] as keyof PrettyFormat
  );

  return keys;
};

const verifyPrettyFormat = (
  h: { [key: string]: unknown },
): h is PrettyFormat => {
  let valid = true;

  PRETTY_FORMAT_KEYS.forEach((key) => {
    valid &&= typeof h[key] === "string";
  });

  return valid;
};

const iterRow = async function* (
  r: Deno.Reader,
): AsyncIterable<string> {
  const lines = r.readable
    .pipeThrough(new DelimiterStream(new TextEncoder().encode(FORMAT_END)))
    .pipeThrough(new TextDecoderStream());

  for await (const line of lines) {
    if (line.length) {
      yield line;
    }
  }
};
export class Source extends BaseSource<Params> {
  override kind = "git_log";

  override gather(args: {
    denops: Denops;
    sourceOptions: SourceOptions;
    sourceParams: Params;
    input: string;
  }): ReadableStream<Item<ActionData>[]> {
    const abortController = new AbortController();

    const parseRow = (row: string): Item<ActionData> => {
      row = row.trim();

      const json: { [key: string]: string } = {};

      eachPair(row.split(FORMAT_DELIMITER), (key, value) => {
        json[key] = value;
      });

      if (!verifyPrettyFormat(json)) {
        console.log({ json, row });
        console.error(new Error("failed to parse result of git log"));
      }

      const variableKeys = extractEmbedVariableKeys(
        args.sourceParams.lineFormat,
      );
      const format = args.sourceParams.lineFormat.replaceAll(
        embedVariableRe,
        "",
      );
      const variables = variableKeys.map((key) => {
        const wrapFormat = args.sourceParams.wrapFormat[key];

        if (wrapFormat && json[key]) {
          return sprintf(wrapFormat, json[key]);
        } else {
          return json[key];
        }
      });

      const word = sprintf(
        format,
        ...variables,
      );

      return {
        word,
        action: {
          commit: json.commit,
          subject: json.subject,
          body: json.body,
          author_name: json.author_name,
          author_email: json.author_email,
          author_date: json.author_date,
          commiter_name: json.commiter_name,
          commiter_email: json.commiter_email,
          commiter_date: json.commiter_date,
          refs: json.refs,
        },
      };
    };

    const bindedGetRootDir = async (
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

        const rootDir = await bindedGetRootDir(cwd);

        let items: Item<ActionData>[] = [];

        if (!rootDir) {
          // not git directory
          controller.enqueue(items);
          return;
        }

        const maxItems = 200;

        const cmd = [
          args.sourceParams.gitCommand,
          "log",
          `-${args.sourceParams.lineCount}`,
          `--date=${args.sourceParams.dateFormat}`,
          `--pretty=format:${PRETTY_FORMAT}`,
        ];

        const proc = Deno.run({
          cmd,
          stdout: "piped",
          stderr: "piped",
          stdin: "null",
          cwd: cwd,
        });

        try {
          for await (
            const row of abortable(
              iterRow(proc.stdout),
              abortController.signal,
            )
          ) {
            items.push(parseRow(row));

            if (maxItems < items.length) {
              // Update items
              controller.enqueue(items);

              // Clear
              items = [];
            }
          }

          controller.enqueue(items);
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
      dateFormat: "format:%Y/%m/%d %H:%M",
      lineFormat:
        "%<author_date>10s %<commiter_name>-11.11s %<subject>s %<refs>s",
      path: "",
      lineCount: 30,
      wrapFormat: {
        refs: "{%s}",
      },
    };
  }
}
