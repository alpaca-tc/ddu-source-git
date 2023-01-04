import {
  ActionFlags,
  Actions,
  BaseKind,
  DduItem,
  Item,
} from "https://deno.land/x/ddu_vim@v2.0.0/types.ts";

import { Denops } from "https://deno.land/x/ddu_vim@v2.0.0/deps.ts";

export type Params = {
  gitCommand: string;
};

export type ActionData = {
  commit: string;
};

export class Kind extends BaseKind<Params> {
  override actions: Actions<Params> = {
    debug: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      console.log(args);
      return await Promise.resolve(ActionFlags.None);
    },

    patch: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      console.log(args);
      return await Promise.resolve(ActionFlags.None);
    },

    diff: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      console.log(args);
      return await Promise.resolve(ActionFlags.None);
    },

    yank_hash: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      console.log(args);
      return await Promise.resolve(ActionFlags.None);
    },
  };

  override params(): Params {
    return {
      gitCommand: "git",
    };
  }
}
