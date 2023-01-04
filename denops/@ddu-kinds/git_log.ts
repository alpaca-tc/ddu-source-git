import {
  ActionFlags,
  Actions,
  BaseKind,
  DduItem,
  Item,
} from "https://deno.land/x/ddu_vim@v2.0.0/types.ts";

import { Denops, fn, vars } from "https://deno.land/x/ddu_vim@v2.0.0/deps.ts";

export type Params = {
  gitCommand: string;
};

export type ActionData = {
  commit: string;
};

export class Kind extends BaseKind<Params> {
  override actions: Actions<Params> = {
    yank_hash: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      const items = args.items as Item<ActionData>[];

      for (const item of items) {
        const commit = item.action!.commit;

        await fn.setreg(args.denops, '"', commit, "v");
        await fn.setreg(
          args.denops,
          await vars.v.get(args.denops, "register"),
          commit,
          "v",
        );
      }

      return Promise.resolve(ActionFlags.Persist);
    },
  };

  override params(): Params {
    return {
      gitCommand: "git",
    };
  }
}
