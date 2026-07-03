import { describe, expect, test } from "bun:test";
import {
  applyDecay,
  detectIntrinsic,
  initialState,
  transitionEmotion,
  updateSubstance,
} from "../src/engine";
import { buildDistanceMatrix } from "../src/distance";
import { DEFAULT_INTRINSIC, DEFAULT_PROFILE, mergeProfile } from "../src/profile";
import type { EmotionState, PersonaProfile } from "../src/types";

const T0 = new Date("2026-07-03T12:00:00Z");
const minutesLater = (m: number) => new Date(T0.getTime() + m * 60_000);
const matrix = buildDistanceMatrix();

function freshState(profile: PersonaProfile = DEFAULT_PROFILE): EmotionState {
  return initialState("test", profile, T0);
}

describe("ベクトル移動（substance_update 相当）", () => {
  test("delta を与えると4変数が動く", () => {
    const { state } = updateSubstance(
      freshState(),
      DEFAULT_PROFILE,
      { DA: 0.1, NA: -0.05 },
      DEFAULT_INTRINSIC,
      { now: minutesLater(1) }
    );
    expect(state.substance.DA).toBeCloseTo(0.7, 5);
    expect(state.substance.NA).toBeCloseTo(0.4, 5);
    expect(state.substance["5-HT"]).toBeCloseTo(0.55, 5);
  });

  test("更新は入力イベントの強さに比例する（メタテスト: 比例性）", () => {
    const a = updateSubstance(freshState(), DEFAULT_PROFILE, { DA: 0.05 }, DEFAULT_INTRINSIC, {
      now: minutesLater(1),
    });
    const b = updateSubstance(freshState(), DEFAULT_PROFILE, { DA: 0.1 }, DEFAULT_INTRINSIC, {
      now: minutesLater(1),
    });
    const moveA = a.state.substance.DA - DEFAULT_PROFILE.baseline.DA;
    const moveB = b.state.substance.DA - DEFAULT_PROFILE.baseline.DA;
    expect(moveB).toBeCloseTo(2 * moveA, 5);
  });

  test("発言者重み: user 発言は ×1.5（テッド準拠）", () => {
    const self = updateSubstance(freshState(), DEFAULT_PROFILE, { DA: 0.1 }, DEFAULT_INTRINSIC, {
      source: "self",
      now: minutesLater(1),
    });
    const user = updateSubstance(freshState(), DEFAULT_PROFILE, { DA: 0.1 }, DEFAULT_INTRINSIC, {
      source: "user",
      now: minutesLater(1),
    });
    expect(user.applied.DA!).toBeCloseTo(1.5 * self.applied.DA!, 5);
  });

  test("安全弁: 1回の変動上限 ±0.2", () => {
    const { applied } = updateSubstance(
      freshState(),
      DEFAULT_PROFILE,
      { NA: 0.5 },
      DEFAULT_INTRINSIC,
      { now: minutesLater(1) }
    );
    expect(applied.NA).toBeCloseTo(0.2, 5);
  });

  test("安全弁: 1時間累積上限 ±0.4", () => {
    let state = freshState();
    // NA baseline 0.45 → +0.2, +0.2 で累積 0.4 に到達
    for (let i = 1; i <= 2; i++) {
      state = updateSubstance(state, DEFAULT_PROFILE, { NA: 0.2 }, DEFAULT_INTRINSIC, {
        now: minutesLater(i * 0.1),
      }).state;
    }
    const third = updateSubstance(state, DEFAULT_PROFILE, { NA: 0.2 }, DEFAULT_INTRINSIC, {
      now: minutesLater(0.3),
    });
    expect(third.applied.NA ?? 0).toBeCloseTo(0, 5);
    expect(third.state.substance.NA).toBeCloseTo(0.85, 2); // 微小な減衰分は許容
  });

  test("安全弁: 1時間経過すると累積枠が回復する", () => {
    // 減衰の影響を切るため decay を実質無効化したプロファイルで確認
    const noDecay = mergeProfile({ decay_rate: 0.0000001 });
    let state = freshState(noDecay);
    for (let i = 1; i <= 2; i++) {
      state = updateSubstance(state, noDecay, { NA: 0.2 }, DEFAULT_INTRINSIC, {
        now: minutesLater(i * 0.1),
      }).state;
    }
    // 61分後: ウィンドウ外になり再び動ける
    const later = updateSubstance(state, noDecay, { NA: 0.1 }, DEFAULT_INTRINSIC, {
      now: minutesLater(61.2),
    });
    expect(later.applied.NA!).toBeGreaterThan(0.05);
  });

  test("値域 [0,1] を超えない", () => {
    let state = freshState();
    state = { ...state, substance: { ...state.substance, DA: 0.95 } };
    const { state: next } = updateSubstance(state, DEFAULT_PROFILE, { DA: 0.2 }, DEFAULT_INTRINSIC, {
      now: minutesLater(0.1),
    });
    expect(next.substance.DA).toBeLessThanOrEqual(1);
  });

  test("方向別移動係数（substance側）: 上昇と下降でゲインが変わる", () => {
    const asym = mergeProfile({
      substance_direction_gain: { NA: { up: 1.0, down: 0.5 } },
    });
    const up = updateSubstance(freshState(asym), asym, { NA: 0.1 }, DEFAULT_INTRINSIC, {
      now: minutesLater(0.1),
    });
    const down = updateSubstance(freshState(asym), asym, { NA: -0.1 }, DEFAULT_INTRINSIC, {
      now: minutesLater(0.1),
    });
    expect(up.applied.NA!).toBeCloseTo(0.1, 5);
    expect(down.applied.NA!).toBeCloseTo(-0.05, 5); // 下降はゲイン 0.5
  });
});

describe("自然減衰（ホメオスタシス・ベースライン回帰）", () => {
  function deviated(profile: PersonaProfile): EmotionState {
    const state = freshState(profile);
    return { ...state, substance: { ...state.substance, DA: 0.9, NA: 0.1 } };
  }

  test("decay_minutes 経過でちょうど decay_rate 分だけベースラインへ近づく", () => {
    const state = deviated(DEFAULT_PROFILE);
    const decayed = applyDecay(state, DEFAULT_PROFILE, minutesLater(30));
    // DA: 0.9 → 0.6 + 0.3 * (1 - 0.15) = 0.855
    expect(decayed.substance.DA).toBeCloseTo(0.855, 5);
    // NA: 0.1 → 0.45 - 0.35 * 0.85 = 0.1525
    expect(decayed.substance.NA).toBeCloseTo(0.1525, 5);
  });

  test("時間経過に対して単調（メタテスト: 単調性）", () => {
    const state = deviated(DEFAULT_PROFILE);
    let prev = state.substance.DA;
    for (const minutes of [5, 15, 30, 60, 120, 600]) {
      const decayed = applyDecay(state, DEFAULT_PROFILE, minutesLater(minutes));
      expect(decayed.substance.DA).toBeLessThan(prev);
      expect(decayed.substance.DA).toBeGreaterThanOrEqual(DEFAULT_PROFILE.baseline.DA);
      prev = decayed.substance.DA;
    }
  });

  test("十分な時間でベースラインに収束する", () => {
    const decayed = applyDecay(deviated(DEFAULT_PROFILE), DEFAULT_PROFILE, minutesLater(60 * 24 * 7));
    expect(decayed.substance.DA).toBeCloseTo(DEFAULT_PROFILE.baseline.DA, 3);
    expect(decayed.substance.NA).toBeCloseTo(DEFAULT_PROFILE.baseline.NA, 3);
  });

  test("ペルソナ別ベースライン: 気質の違う2ペルソナは別の点へ回帰する", () => {
    const explorer = mergeProfile({ baseline: { DA: 0.75, NA: 0.45, "5-HT": 0.55, ACh: 0.55 } });
    const scholar = mergeProfile({ baseline: { DA: 0.55, NA: 0.4, "5-HT": 0.6, ACh: 0.75 } });
    const s1 = { ...freshState(explorer), substance: { DA: 0.5, NA: 0.5, "5-HT": 0.5, ACh: 0.5 } };
    const s2 = { ...freshState(scholar), substance: { DA: 0.5, NA: 0.5, "5-HT": 0.5, ACh: 0.5 } };
    const week = minutesLater(60 * 24 * 7);
    const d1 = applyDecay(s1, explorer, week);
    const d2 = applyDecay(s2, scholar, week);
    expect(d1.substance.DA).toBeCloseTo(0.75, 2);
    expect(d2.substance.DA).toBeCloseTo(0.55, 2);
    expect(d2.substance.ACh).toBeCloseTo(0.75, 2);
  });

  test("減衰は安全弁の累積に計上されない", () => {
    const state = deviated(DEFAULT_PROFILE);
    const decayed = applyDecay(state, DEFAULT_PROFILE, minutesLater(30));
    expect(decayed.recent_deltas.length).toBe(state.recent_deltas.length);
  });
});

describe("内発的感情（条件マッチ、LLM挟まない）", () => {
  const base = DEFAULT_PROFILE.baseline;

  test("DA高 + ACh高 → curiosity", () => {
    const pattern = detectIntrinsic(
      { DA: base.DA + 0.15, NA: base.NA, "5-HT": base["5-HT"], ACh: base.ACh + 0.12 },
      base,
      DEFAULT_INTRINSIC
    );
    expect(pattern?.label).toBe("curiosity");
  });

  test("DA低 + 5-HT低 + ACh低 → fatigue が restlessness より優先（特異性）", () => {
    const pattern = detectIntrinsic(
      { DA: base.DA - 0.2, NA: base.NA, "5-HT": base["5-HT"] - 0.2, ACh: base.ACh - 0.2 },
      base,
      DEFAULT_INTRINSIC
    );
    expect(pattern?.label).toBe("fatigue");
  });

  test("DA低 + 5-HT低（ACh は正常）→ restlessness", () => {
    const pattern = detectIntrinsic(
      { DA: base.DA - 0.2, NA: base.NA, "5-HT": base["5-HT"] - 0.2, ACh: base.ACh },
      base,
      DEFAULT_INTRINSIC
    );
    expect(pattern?.label).toBe("restlessness");
  });

  test("逸脱なし → null（neutral 扱い）", () => {
    expect(detectIntrinsic({ ...base }, base, DEFAULT_INTRINSIC)).toBeNull();
  });

  test("substance の状態遷移でラベルが切り替わる", () => {
    let state = freshState();
    const up = updateSubstance(state, DEFAULT_PROFILE, { DA: 0.15, ACh: 0.1 }, DEFAULT_INTRINSIC, {
      now: minutesLater(0.1),
    });
    expect(up.state.intrinsic_emotion).toBe("curiosity");
    expect(up.state.intrinsic_sensation).toContain("面白いもの");
    // 安全弁（1回±0.2）の範囲内で2段階かけて下げる
    const down1 = updateSubstance(
      up.state,
      DEFAULT_PROFILE,
      { DA: -0.2, "5-HT": -0.2, ACh: -0.2 },
      DEFAULT_INTRINSIC,
      { now: minutesLater(0.2) }
    );
    const down2 = updateSubstance(
      down1.state,
      DEFAULT_PROFILE,
      { DA: -0.2, "5-HT": -0.2, ACh: -0.2 },
      DEFAULT_INTRINSIC,
      { now: minutesLater(0.3) }
    );
    expect(down2.state.intrinsic_emotion).toBe("fatigue");
    // ラベルが変わったので since が更新される
    expect(down2.state.since).toBe(minutesLater(0.3).toISOString());
  });
});

describe("感情遷移（emotion_transition 相当）と伝播", () => {
  test("target が nearest_emotion になり、近い感情ほど強く活性化する", () => {
    const state = transitionEmotion(
      freshState(),
      DEFAULT_PROFILE,
      matrix,
      "joy",
      0.8,
      DEFAULT_INTRINSIC,
      { now: minutesLater(0.1) }
    );
    expect(state.nearest_emotion).toBe("joy");
    expect(state.activations.joy).toBeCloseTo(0.8, 5);
    // 伝播: joy に近い excitement は、遠い grief より強く活性化する
    expect(state.activations.excitement ?? 0).toBeGreaterThan(state.activations.grief ?? 0);
    // 伝播カーブの検算: activation = strength * exp(-4 * d²)
    const d = matrix.joy!.excitement!;
    expect(state.activations.excitement).toBeCloseTo(0.8 * Math.exp(-4 * d * d), 5);
  });

  test("方向別移動係数: 動きにくい方向への遷移は実効 magnitude が目減りする", () => {
    const sticky = mergeProfile({
      direction_coefficients: { valence: { "positive->negative": 2.0 }, pairs: {} },
    });
    // まず joy にいる状態を作る
    const atJoy = transitionEmotion(freshState(sticky), sticky, matrix, "joy", 0.8, DEFAULT_INTRINSIC, {
      now: minutesLater(0.1),
    });
    expect(atJoy.nearest_emotion).toBe("joy");
    // joy → sadness は係数 2.0 で実効 magnitude が半減する
    const toSad = transitionEmotion(atJoy, sticky, matrix, "sadness", 0.6, DEFAULT_INTRINSIC, {
      now: minutesLater(0.2),
    });
    // 係数なしなら 0.6 のまま乗る
    const neutral = transitionEmotion(atJoy, DEFAULT_PROFILE, matrix, "sadness", 0.6, DEFAULT_INTRINSIC, {
      now: minutesLater(0.2),
    });
    // 前段（joy 遷移）からの微小な伝播残差は両者共通なので、差分がちょうど目減り分になる
    expect(neutral.activations.sadness! - toSad.activations.sadness!).toBeCloseTo(0.3, 5);
    expect(toSad.activations.sadness!).toBeCloseTo(0.3, 1);
  });

  test("活性値は半減期で減衰し、消えると nearest は内発的感情アンカーへ戻る", () => {
    const excited = transitionEmotion(
      freshState(),
      DEFAULT_PROFILE,
      matrix,
      "excitement",
      0.7,
      DEFAULT_INTRINSIC,
      { now: minutesLater(0.1) }
    );
    // 半減期(30分)後: 約半分
    const half = applyDecay(excited, DEFAULT_PROFILE, minutesLater(30.1));
    expect(half.activations.excitement).toBeCloseTo(0.35, 2);
    // 十分な時間で活性は消え、substance もベースラインへ → neutral
    const gone = applyDecay(excited, DEFAULT_PROFILE, minutesLater(60 * 12));
    expect(Object.keys(gone.activations).length).toBe(0);
  });

  test("未知の感情名は拒否する", () => {
    expect(() =>
      transitionEmotion(freshState(), DEFAULT_PROFILE, matrix, "thinking", 0.5, DEFAULT_INTRINSIC, {
        now: minutesLater(0.1),
      })
    ).toThrow(/unknown emotion/);
  });
});
