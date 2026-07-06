#!/usr/bin/env bun
/**
 * emotion-mcp Layer 1 CLI — 状態エンジンの操作面
 *
 * 使い方:
 *   bun run cli.ts get [--persona <id>] [--sync]
 *     --sync: decay 反映後の状態を書き戻す（デフォルトの get は読み取り専用）
 *   bun run cli.ts update --delta DA=0.1 --delta NA=-0.05 [--source user|self|environment] [--context "..."]
 *   bun run cli.ts transition <emotion> [--magnitude 0.5] [--context "..."]
 *
 * 共通オプション:
 *   --persona <id>   ペルソナID（デフォルト: default）
 *   --root <dir>     emotion-mcp ルート（デフォルト: CLAUDE_PROJECT_DIR/.claude/mcps/emotion-mcp、
 *                    未設定ならこのファイルのディレクトリ）
 *   --state <path>   状態ファイルパスの上書き
 *
 * 状態ファイルは substance_state.<personaId>.json（1ディレクトリ=1ペルソナ + ファイル名の保険）。
 * 状態ファイルの persona が指定と食い違う場合は exit 1。
 */

import { SUBSTANCE_KEYS, type SubstanceKey } from "./src/types";
import { createEmotionApi, resolveRootDir } from "./src/api";

interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Map<string, string[]>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) {
        flags.set(name, [...(flags.get(name) ?? []), "true"]);
      } else {
        flags.set(name, [...(flags.get(name) ?? []), value]);
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, flags };
}

function flagValue(args: ParsedArgs, name: string): string | undefined {
  return args.flags.get(name)?.at(-1);
}

function usage(): never {
  console.error(
    [
      "usage:",
      "  cli.ts get [--persona <id>] [--sync]",
      "  cli.ts update --delta KEY=VALUE ... [--source user|self|environment] [--context <text>]",
      `    KEY: ${SUBSTANCE_KEYS.join(" | ")}`,
      "  cli.ts transition <emotion> [--magnitude 0..1] [--context <text>]",
    ].join("\n")
  );
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));

const api = createEmotionApi({
  rootDir: flagValue(args, "root") ?? resolveRootDir(),
  personaId: flagValue(args, "persona"),
  statePath: flagValue(args, "state"),
});

try {
  switch (args.command) {
    case "get": {
      console.log(JSON.stringify(api.get({ sync: args.flags.has("sync") }), null, 2));
      break;
    }
    case "update": {
      const deltas: Partial<Record<SubstanceKey, number>> = {};
      for (const spec of args.flags.get("delta") ?? []) {
        const [key, raw] = spec.split("=");
        const value = Number(raw);
        if (!key || !(SUBSTANCE_KEYS as readonly string[]).includes(key) || !Number.isFinite(value)) {
          console.error(`invalid --delta: ${spec}`);
          usage();
        }
        deltas[key as SubstanceKey] = value;
      }
      if (Object.keys(deltas).length === 0) usage();
      const snapshot = api.update(deltas, {
        source: flagValue(args, "source"),
        context: flagValue(args, "context"),
      });
      console.log(JSON.stringify(snapshot, null, 2));
      break;
    }
    case "transition": {
      const target = args.positional[0];
      if (!target) usage();
      const magnitude = Number(flagValue(args, "magnitude") ?? "0.5");
      if (!Number.isFinite(magnitude)) usage();
      const snapshot = api.transition(target, magnitude, flagValue(args, "context"));
      console.log(JSON.stringify(snapshot, null, 2));
      break;
    }
    default:
      usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
