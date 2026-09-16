import {
  ActionFlags,
  Actions,
  BaseKind,
  DduItem,
  Item,
} from "https://deno.land/x/ddu_vim@v2.0.0/types.ts";

import { Denops, fn } from "https://deno.land/x/ddu_vim@v2.0.0/deps.ts";

export type Preset = "worktree" | "wt";

export type Params = {
  gitCommand: string;
  preset: Preset;
  addCommand: string[];
  deleteCommand: string[];
  forceDeleteCommand: string[];
};

export type ActionData = {
  cwd: string;
  path: string;
  head: string;
  branch: string;
  isCurrent: boolean;
  isBare: boolean;
  isDetached: boolean;
};

const PRESETS: { [key in Preset]: {
  add: string[];
  delete: string[];
  forceDelete: string[];
} } = {
  worktree: {
    add: ["worktree", "add"],
    delete: ["worktree", "remove"],
    forceDelete: ["worktree", "remove", "--force"],
  },
  wt: {
    add: ["wt"],
    delete: ["wt", "-d"],
    forceDelete: ["wt", "-D"],
  },
};

const resolveCommand = (
  params: Params,
  kind: "add" | "delete" | "forceDelete",
): string[] => {
  const override = {
    add: params.addCommand,
    delete: params.deleteCommand,
    forceDelete: params.forceDeleteCommand,
  }[kind];

  const cmd = override.length ? override : PRESETS[params.preset][kind];

  return [params.gitCommand, ...cmd];
};

const runCommand = async (
  cmd: string[],
  denops: Denops,
  cwd: string,
): Promise<void> => {
  try {
    const p = Deno.run({
      cmd,
      stdout: "piped",
      stderr: "piped",
      stdin: "piped",
      cwd,
    });

    const status = await p.status();

    if (!status.success) {
      const rawErrorOutput = await p.stderrOutput();
      const errorOutput = (new TextDecoder()).decode(rawErrorOutput);

      await denops.call(
        "ddu#util#print_error",
        errorOutput,
      );
    }

    p.close();
  } catch (e) {
    await denops.call(
      "ddu#util#print_error",
      `Run ${cmd} is failed.`,
    );

    if (e instanceof Error) {
      await denops.call(
        "ddu#util#print_error",
        e.message,
      );
    }
  }
};

export class Kind extends BaseKind<Params> {
  override actions: Actions<Params> = {
    cd: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      const items = args.items as (DduItem & Item<ActionData>)[];

      if (items.length === 0) {
        return await Promise.resolve(ActionFlags.None);
      }

      if (items.length > 1) {
        await args.denops.call(
          "ddu#util#print_error",
          `'cd' is called with multiple items.`,
        );
      }

      await fn.chdir(args.denops, items[0].action!.path);

      return await Promise.resolve(ActionFlags.None);
    },

    delete: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      await deleteWorktrees(args, false);
      return await Promise.resolve(ActionFlags.RefreshItems);
    },

    force_delete: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      await deleteWorktrees(args, true);
      return await Promise.resolve(ActionFlags.RefreshItems);
    },

    new: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      const items = args.items as (DduItem & Item<ActionData>)[];

      const name = await fn.input(args.denops, "New worktree: ") as string;

      if (name === "") {
        return await Promise.resolve(ActionFlags.None);
      }

      const cwd = items.length
        ? items[0].action!.cwd
        : await fn.getcwd(args.denops) as string;

      const cmd = [...resolveCommand(args.sourceParams, "add"), name];

      await runCommand(cmd, args.denops, cwd);

      console.log(`Created worktree: ${name}`);

      return await Promise.resolve(ActionFlags.RefreshItems);
    },
  };

  override params(): Params {
    return {
      gitCommand: "git",
      preset: "worktree",
      addCommand: [],
      deleteCommand: [],
      forceDeleteCommand: [],
    };
  }
}

const deleteWorktrees = async (
  args: { sourceParams: Params; denops: Denops; items: DduItem[] },
  force: boolean,
) => {
  const items = args.items as (DduItem & Item<ActionData>)[];

  const targets = items.filter((item) =>
    !item.action!.isCurrent && !item.action!.isBare
  );

  if (targets.length === 0) {
    await args.denops.call(
      "ddu#util#print_error",
      "No deletable worktree is selected.",
    );
    return;
  }

  const cmd = resolveCommand(
    args.sourceParams,
    force ? "forceDelete" : "delete",
  );

  for (const item of targets) {
    await runCommand(
      [...cmd, item.action!.path],
      args.denops,
      item.action!.cwd,
    );
  }
};
