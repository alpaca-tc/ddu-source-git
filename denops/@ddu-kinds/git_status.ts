import {
  ActionFlags,
  Actions,
  BaseKind,
  DduItem,
  Item,
} from "https://deno.land/x/ddu_vim@v2.0.0/types.ts";

import { Denops } from "https://deno.land/x/ddu_vim@v2.0.0/deps.ts";

export type StatusSymbol = " " | "M" | "A" | "D" | "R" | "C" | "U" | "?";

export const StatusSymbols: { [key in StatusSymbol]: string } = {
  " ": "Unmodified",
  "M": "Modified",
  "A": "Added",
  "D": "Deleted",
  "R": "Renamed",
  "C": "Copied",
  "U": "Unmerged",
  "?": "Untracked",
};

export type Params = {
  gitCommand: string;
  openCommand: "edit";
};

export type ActionData = {
  rootDir: string;
  fullpath: string;
  workingTree: StatusSymbol;
  index: StatusSymbol;
};

const runCommand = async (
  cmd: string[],
  denops: Denops,
  rootDir: string,
): Promise<void> => {
  try {
    const p = Deno.run({
      cmd,
      stdout: "piped",
      stderr: "piped",
      stdin: "piped",
      cwd: rootDir,
    });

    await p.status();
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
    open: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      const openCommand = args.sourceParams.openCommand ?? "edit";
      const items = args.items as (DduItem & Item<ActionData>)[];

      for (const item of items) {
        await args.denops.call(
          "ddu#util#execute_path",
          openCommand,
          item.action!.fullpath,
        );
      }

      return await Promise.resolve(ActionFlags.Persist);
    },

    add: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      const items = args.items as (DduItem & Item<ActionData>)[];
      if (items.length === 0) return;

      const cmd: string[] = [
        args.sourceParams.gitCommand,
        "add",
      ];

      items.forEach((item) => cmd.push(item.action!.fullpath));
      const rootDir = items[0].action!.rootDir;

      await runCommand(cmd, args.denops, rootDir);
      return await Promise.resolve(ActionFlags.RefreshItems);
    },

    unstage: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      const items = args.items as (DduItem & Item<ActionData>)[];

      const cmd: string[] = [
        args.sourceParams.gitCommand,
        "reset",
        "HEAD",
      ];

      items.forEach((item) => cmd.push(item.action!.fullpath));
      const rootDir = items[0].action!.rootDir;

      await runCommand(cmd, args.denops, rootDir);

      return await Promise.resolve(ActionFlags.RefreshItems);
    },

    restore: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      const items = args.items as (DduItem & Item<ActionData>)[];

      const cmd: string[] = [
        args.sourceParams.gitCommand,
        "restore",
      ];

      items.forEach((item) => cmd.push(item.action!.fullpath));
      const rootDir = items[0].action!.rootDir;

      await runCommand(cmd, args.denops, rootDir);

      return await Promise.resolve(ActionFlags.RefreshItems);
    },
  };

  override params(): Params {
    return {
      gitCommand: "git",
      openCommand: "edit",
    };
  }
}
