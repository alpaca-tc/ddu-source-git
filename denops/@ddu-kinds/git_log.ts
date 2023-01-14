import {
  ActionFlags,
  Actions,
  BaseKind,
  DduItem,
  Item,
} from "https://deno.land/x/ddu_vim@v2.0.0/types.ts";

import {
  Denops,
  echo,
  fn,
  vars,
} from "https://deno.land/x/ddu_vim@v2.0.0/deps.ts";

export type Params = {
  gitCommand: string;
};

export type ActionData = {
  commit: string;
  subject: string;
  body: string;
  author_name: string;
  author_email: string;
  author_date: string;
  commiter_name: string;
  commiter_email: string;
  commiter_date: string;
  refs: string;
};

const yank = async (denops: Denops, message: string): Promise<void> => {
  await fn.setreg(denops, '"', message, "v");
  await fn.setreg(
    denops,
    await vars.v.get(denops, "register"),
    message,
    "v",
  );
};

const parseItemToLog = (action: ActionData): string => {
  let buf = "";
  const refs = action.refs.length > 0 ? `(${action.refs})` : "";

  const indent = "    ";
  let body = "";

  if (action.body.trim().length > 0) {
    body += "\n\n";
    body += action.body.split("\n").map((line) =>
      line.length > 0 ? `${indent}${line}` : ""
    ).join("\n");
  }

  buf += `commit ${action.commit} ${refs}
Author: ${action.author_name} <${action.author_email}>
Date:   ${action.author_date}${body}`;

  return buf;
};

export class Kind extends BaseKind<Params> {
  override actions: Actions<Params> = {
    yank_hash: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      const items = args.items as Item<ActionData>[];

      for (const item of items) {
        const commit = item.action!.commit;

        await yank(args.denops, commit);

        echo(
          args.denops,
          `Copied commit hash.\n\n${parseItemToLog(item.action!)}`,
        );
      }

      return Promise.resolve(ActionFlags.Persist);
    },
    print_commit: (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ): Promise<ActionFlags> => {
      const items = args.items as Item<ActionData>[];
      let buf = "";

      for (const item of items) {
        const action = item.action!;
        buf += parseItemToLog(action);
      }

      echo(args.denops, buf);

      return Promise.resolve(ActionFlags.Persist);
    },
  };

  override params(): Params {
    return {
      gitCommand: "git",
    };
  }
}
