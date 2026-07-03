import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadState, saveState, defaultStatePath } from "../src/persistence";
import { initialState } from "../src/engine";
import { DEFAULT_PROFILE } from "../src/profile";
import { createEmotionApi } from "../src/api";

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

  test("存在しない・壊れたファイルは null（作り直しを促す）", () => {
    expect(loadState(join(dir, "missing.json"))).toBeNull();
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{not json", "utf-8");
    expect(loadState(broken)).toBeNull();
    const wrongShape = join(dir, "wrong.json");
    writeFileSync(wrongShape, JSON.stringify({ persona: "x", substance: { DA: 0.5 } }), "utf-8");
    expect(loadState(wrongShape)).toBeNull();
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
    expect(api.statePath).toBe(defaultStatePath(dir));
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
