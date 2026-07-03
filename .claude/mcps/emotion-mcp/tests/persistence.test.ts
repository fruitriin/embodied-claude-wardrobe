import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEGACY_STATE_FILENAME, loadState, saveState, defaultStatePath } from "../src/persistence";
import { initialState } from "../src/engine";
import { DEFAULT_PROFILE } from "../src/profile";
import { createEmotionApi, resolveRootDir } from "../src/api";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "emotion-mcp-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("substance_state.json の永続化", () => {
  test("save → load のラウンドトリップで状態が完全に一致する", () => {
    const path = join(dir, "substance_state.json");
    const state = initialState("riin", DEFAULT_PROFILE, new Date("2026-07-03T12:00:00Z"));
    state.substance.DA = 0.72;
    state.activations = { joy: 0.5, excitement: 0.3 };
    state.last_context = "テスト";
    state.recent_deltas = [{ ts: "2026-07-03T11:59:00Z", deltas: { DA: 0.12 } }];
    saveState(path, state);
    expect(loadState(path)).toEqual(state);
  });

  test("親ディレクトリが無ければ作る・tmp ファイルが残らない", () => {
    const path = join(dir, "nested", "deep", "substance_state.json");
    saveState(path, initialState("x", DEFAULT_PROFILE, new Date()));
    expect(existsSync(path)).toBe(true);
    const entries = require("node:fs").readdirSync(join(dir, "nested", "deep"));
    expect(entries).toEqual(["substance_state.json"]);
  });

  test("存在しない・JSON として読めない・persona 不明のファイルは null（作り直しを促す）", () => {
    expect(loadState(join(dir, "missing.json"))).toBeNull();
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{not json", "utf-8");
    expect(loadState(broken)).toBeNull();
    const noPersona = join(dir, "no-persona.json");
    writeFileSync(noPersona, JSON.stringify({ substance: { DA: 0.5 } }), "utf-8");
    expect(loadState(noPersona)).toBeNull();
  });

  test("不正フィールドは全体 null ではなくフィールド単位でベースライン修復される", () => {
    // NaN は JSON.stringify で null になる（NaN 毒の永続化経路の再現）
    const poisoned = join(dir, "poisoned.json");
    writeFileSync(
      poisoned,
      JSON.stringify({
        persona: "riin",
        substance: { DA: null, NA: 0.9, "5-HT": "broken", ACh: 0.3 },
        activations: { joy: 0.4, sadness: null },
        last_updated: "2026-07-03T12:00:00Z",
      }),
      "utf-8"
    );
    const state = loadState(poisoned, DEFAULT_PROFILE.baseline);
    expect(state).not.toBeNull();
    // 不正フィールドだけベースラインで修復
    expect(state!.substance.DA).toBe(DEFAULT_PROFILE.baseline.DA);
    expect(state!.substance["5-HT"]).toBe(DEFAULT_PROFILE.baseline["5-HT"]);
    // 蓄積された正常フィールドは保全される（全消去しない）
    expect(state!.substance.NA).toBe(0.9);
    expect(state!.substance.ACh).toBe(0.3);
    expect(state!.activations).toEqual({ joy: 0.4 });
    expect(state!.last_updated).toBe("2026-07-03T12:00:00Z");
  });

  test("last_updated 不正は現在時刻で修復される（過去に飛ばして decay 全消ししない）", () => {
    const path = join(dir, "bad-ts.json");
    writeFileSync(
      path,
      JSON.stringify({
        persona: "riin",
        substance: { DA: 0.9, NA: 0.45, "5-HT": 0.55, ACh: 0.6 },
        last_updated: "not-a-date",
      }),
      "utf-8"
    );
    const before = Date.now();
    const state = loadState(path);
    expect(state).not.toBeNull();
    expect(new Date(state!.last_updated).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(state!.substance.DA).toBe(0.9);
  });
});

describe("API 統合（emotion_get / substance_update / emotion_transition 相当）", () => {
  const T0 = new Date("2026-07-03T12:00:00Z");

  function makeApi(nowRef: { value: Date }, personaId?: string) {
    return createEmotionApi({
      rootDir: dir,
      personaId,
      now: () => nowRef.value,
    });
  }

  test("get は状態ファイルを規定の場所に作る", () => {
    const nowRef = { value: T0 };
    const api = makeApi(nowRef);
    const snapshot = api.get();
    expect(api.statePath).toBe(defaultStatePath(dir, "default"));
    expect(existsSync(api.statePath)).toBe(true);
    expect(snapshot.substance).toEqual(DEFAULT_PROFILE.baseline);
    expect(snapshot.nearest_emotion).toBe("neutral");
  });

  test("update がプロセスをまたいで永続化される（別 API インスタンスで読める）", () => {
    const nowRef = { value: T0 };
    makeApi(nowRef).update({ DA: 0.15, ACh: 0.1 }, { source: "user", context: "面白い記事" });
    // 別インスタンス（=別プロセス相当）で読み直す
    nowRef.value = new Date(T0.getTime() + 1000);
    const snapshot = makeApi(nowRef).get();
    expect(snapshot.substance.DA).toBeGreaterThan(0.7);
    expect(snapshot.intrinsic_emotion).toBe("curiosity");
    expect(snapshot.last_context).toBe("面白い記事");
  });

  test("ベースライン回帰: decay_minutes 経過後の get でベースラインに近づいている", () => {
    const nowRef = { value: T0 };
    const api = makeApi(nowRef);
    const excited = api.update({ DA: 0.2 }, { context: "興奮" });
    const deviation0 = excited.substance.DA - DEFAULT_PROFILE.baseline.DA;
    expect(deviation0).toBeCloseTo(0.2, 5);

    nowRef.value = new Date(T0.getTime() + 30 * 60_000); // decay_minutes = 30
    const later = api.get();
    const deviation1 = later.substance.DA - DEFAULT_PROFILE.baseline.DA;
    // decay_rate = 0.15 分だけ近づく
    expect(deviation1).toBeCloseTo(0.2 * 0.85, 5);

    nowRef.value = new Date(T0.getTime() + 48 * 60 * 60_000);
    const rested = api.get();
    expect(rested.substance.DA).toBeCloseTo(DEFAULT_PROFILE.baseline.DA, 3);
    expect(rested.intrinsic_emotion).toBe("neutral");
  });

  test("ペルソナ別ベースライン: personas/<id>/profile.json が読み込まれ回帰先が変わる", () => {
    const personaDir = join(dir, "personas", "explorer");
    mkdirSync(personaDir, { recursive: true });
    writeFileSync(
      join(personaDir, "profile.json"),
      JSON.stringify({ baseline: { DA: 0.8 }, decay_rate: 0.5, decay_minutes: 10 }),
      "utf-8"
    );
    const nowRef = { value: T0 };
    const api = makeApi(nowRef, "explorer");
    const first = api.get();
    expect(first.persona).toBe("explorer");
    expect(first.substance.DA).toBe(0.8); // 初期状態はペルソナのベースライン
    expect(first.substance.NA).toBe(DEFAULT_PROFILE.baseline.NA); // 未指定はデフォルト継承

    api.update({ DA: -0.2 }, { context: "退屈" });
    nowRef.value = new Date(T0.getTime() + 10 * 60_000);
    const later = api.get();
    // DA: 0.6 → 0.8 - 0.2 * 0.5 = 0.7（explorer の decay 設定で explorer のベースラインへ）
    expect(later.substance.DA).toBeCloseTo(0.7, 5);
  });

  test("ペルソナ別 distances.json の上書きが transition の伝播に効く", () => {
    const personaDir = join(dir, "personas", "linked");
    mkdirSync(personaDir, { recursive: true });
    // joy と grief を極端に近づける上書き
    writeFileSync(
      join(personaDir, "distances.json"),
      JSON.stringify({ pairs: { "grief|joy": 0.05 } }),
      "utf-8"
    );
    const nowRef = { value: T0 };
    const overridden = makeApi(nowRef, "linked").transition("joy", 0.8, "test");
    const griefAct = overridden.top_activations.find((a) => a.emotion === "grief");
    expect(griefAct).toBeDefined();
    expect(griefAct!.activation).toBeGreaterThan(0.7); // 距離0.05 → ほぼ全量伝播

    // デフォルト行列では grief はほぼ活性化しない
    const plainDir = mkdtempSync(join(tmpdir(), "emotion-mcp-plain-"));
    try {
      const plain = createEmotionApi({ rootDir: plainDir, now: () => T0 }).transition("joy", 0.8);
      const plainGrief = plain.top_activations.find((a) => a.emotion === "grief");
      expect(plainGrief).toBeUndefined();
    } finally {
      rmSync(plainDir, { recursive: true, force: true });
    }
  });

  test("persona スコープ: ペルソナごとに別ファイルに保存され互いに干渉しない", () => {
    const nowRef = { value: T0 };
    makeApi(nowRef, "alice").update({ DA: 0.2 }, { context: "alice の出来事" });
    makeApi(nowRef, "bob").update({ DA: -0.2 }, { context: "bob の出来事" });

    expect(existsSync(defaultStatePath(dir, "alice"))).toBe(true);
    expect(existsSync(defaultStatePath(dir, "bob"))).toBe(true);

    nowRef.value = new Date(T0.getTime() + 1000);
    expect(makeApi(nowRef, "alice").get().substance.DA).toBeCloseTo(0.8, 2);
    expect(makeApi(nowRef, "bob").get().substance.DA).toBeCloseTo(0.4, 2);
  });

  test("persona 不一致はサイレント初期化ではなく明示エラー", () => {
    const nowRef = { value: T0 };
    makeApi(nowRef, "alice").update({ DA: 0.2 });
    // 状態ファイルの persona スタンプを改ざん（別ペルソナのファイルが紛れ込んだ状況の再現）
    const path = defaultStatePath(dir, "alice");
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    raw.persona = "bob";
    writeFileSync(path, JSON.stringify(raw), "utf-8");

    expect(() => makeApi(nowRef, "alice").get()).toThrow(/persona mismatch/);
    expect(() => makeApi(nowRef, "alice").update({ DA: 0.1 })).toThrow(/persona mismatch/);
    // エラー後もファイルは上書きされていない（データ保全）
    expect(JSON.parse(readFileSync(path, "utf-8")).persona).toBe("bob");
  });

  test("旧パス substance_state.json は persona 一致時のみ一度だけ新パスへ移行される", () => {
    const legacyPath = join(dir, LEGACY_STATE_FILENAME);
    const legacy = initialState("default", DEFAULT_PROFILE, T0);
    legacy.substance.DA = 0.85;
    legacy.last_context = "旧レイアウト時代の記憶";
    saveState(legacyPath, legacy);

    const nowRef = { value: new Date(T0.getTime() + 1000) };
    const snapshot = makeApi(nowRef).get();
    // 旧状態が引き継がれている（initialState に巻き戻らない）
    expect(snapshot.substance.DA).toBeCloseTo(0.85, 2);
    expect(snapshot.last_context).toBe("旧レイアウト時代の記憶");
    // 新パスに移行済み。以後は新パスが正
    const newPath = defaultStatePath(dir, "default");
    expect(existsSync(newPath)).toBe(true);
    expect(JSON.parse(readFileSync(newPath, "utf-8")).persona).toBe("default");

    // persona 不一致の旧ファイルは移行されない（黙って初期状態から始まる）
    const other = makeApi(nowRef, "someone-else").get();
    expect(other.substance.DA).toBeCloseTo(DEFAULT_PROFILE.baseline.DA, 5);
  });

  test("resolveRootDir は CLAUDE_PROJECT_DIR を優先する", () => {
    const saved = process.env.CLAUDE_PROJECT_DIR;
    try {
      process.env.CLAUDE_PROJECT_DIR = "/tmp/some-project";
      expect(resolveRootDir()).toBe(join("/tmp/some-project", ".claude", "mcps", "emotion-mcp"));
      delete process.env.CLAUDE_PROJECT_DIR;
      // 未設定時はパッケージ自身のディレクトリ
      expect(resolveRootDir().endsWith("emotion-mcp")).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = saved;
    }
  });

  test("intrinsic-patterns.json をルートから読む（ファイル定義が優先される）", () => {
    writeFileSync(
      join(dir, "intrinsic-patterns.json"),
      JSON.stringify({
        deviation_threshold: 0.05,
        patterns: [
          {
            label: "sparked",
            conditions: { DA: "high" },
            sensation: "ぱちっと火がついた",
            anchor: "excitement",
          },
        ],
      }),
      "utf-8"
    );
    const nowRef = { value: T0 };
    const snapshot = makeApi(nowRef).update({ DA: 0.1 });
    expect(snapshot.intrinsic_emotion).toBe("sparked");
    expect(snapshot.nearest_emotion).toBe("excitement");
  });
});
