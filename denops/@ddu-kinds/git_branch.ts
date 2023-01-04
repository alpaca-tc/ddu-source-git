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
  cwd: string;
  fullName: string;
  isCurrent: boolean;
  isRemote: boolean;
};

const deleteBranches = async (
  args: { sourceParams: Params; denops: Denops; items: DduItem[] },
  force: boolean,
) => {
  const items = args.items as (DduItem & Item<ActionData>)[];

  const cmd: string[] = [
    args.sourceParams.gitCommand,
    "branch",
    "--delete",
  ];

  if (force) {
    cmd.push("--force");
  }

  const branchNames = items.filter((item) => !item.action!.isRemote).map((
    item,
  ) => item.action!.fullName);

  cmd.push(...branchNames);

  try {
    const p = Deno.run({
      cmd,
      stdout: "piped",
      stderr: "piped",
      stdin: "piped",
    });

    const result = await p.status();

    if (result.success) {
      console.log(`Deleted branch: ${branchNames.join(", ")}`);
    } else {
      const rawErrorOutput = await p.stderrOutput();
      const errorOutput = (new TextDecoder()).decode(rawErrorOutput);

      await args.denops.call(
        "ddu#util#print_error",
        errorOutput,
      );
    }
  } catch (e) {
    await args.denops.call(
      "ddu#util#print_error",
      `Run ${cmd} is failed.`,
    );

    if (e instanceof Error) {
      await args.denops.call(
        "ddu#util#print_error",
        e.message,
      );
    }
  }
};

export class Kind extends BaseKind<Params> {
  override actions: Actions<Params> = {
    debug: async (args: { denops: Denops; items: DduItem[] }) => {
      console.log(args.items);
      return await Promise.resolve(ActionFlags.None);
    },

    delete_local: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      await deleteBranches(args, false);
      return await Promise.resolve(ActionFlags.Redraw);
    },

    delete_local_force: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      await deleteBranches(args, true);
      return await Promise.resolve(ActionFlags.Redraw);
    },

    switch: async (
      args: { sourceParams: Params; denops: Denops; items: DduItem[] },
    ) => {
      const items = args.items as (DduItem & Item<ActionData>)[];

      if (items.length === 1) {
        const item = items[0];

        const cmd: string[] = [
          args.sourceParams.gitCommand,
          "switch",
        ];

        const fullName = item.action!.fullName;

        if (item.action!.isRemote) {
          cmd.push("--detach", fullName);
        } else {
          cmd.push(fullName);
        }

        try {
          const p = Deno.run({
            cmd,
            stdout: "piped",
            stderr: "piped",
            stdin: "piped",
          });

          await p.status();

          console.log(`Switched to branch '${fullName}'`);
        } catch (e) {
          await args.denops.call(
            "ddu#util#print_error",
            `Run ${cmd} is failed.`,
          );

          if (e instanceof Error) {
            await args.denops.call(
              "ddu#util#print_error",
              e.message,
            );
          }
        }

        return await Promise.resolve(ActionFlags.None);
      } else {
        await args.denops.call(
          "ddu#util#print_error",
          `'switch' is called with multiple items.`,
        );

        console.log(args);
        return await Promise.resolve(ActionFlags.None);
      }
    },
  };

  override params(): Params {
    return {
      gitCommand: "git",
    };
  }
}
