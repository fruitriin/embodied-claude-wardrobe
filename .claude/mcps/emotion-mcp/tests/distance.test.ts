import { describe, expect, test } from "bun:test";
import { EMOTIONS } from "../src/emotions";
import {
  activationCurve,
  buildDistanceMatrix,
  buildRawBaselineMatrix,
  directionCoefficient,
  effectiveDistance,
  minMaxNormalize,
  pairKey,
} from "../src/distance";
import type { DirectionCoefficients } from "../src/types";

describe("min-max 正規化（テッドレシピ: 正規化必須）", () => {
  test("生値が狭い帯域に密集していても [0,1] 全域へ引き延ばす", () => {
    // GoEmotions の生 Jaccard 距離は [0.929, 1.0] に密集する、を模した行列
    const raw: Record<string, Record<string, number>> = {};
    for (const a of EMOTIONS) {
      raw[a] = {};
      for (const b of EMOTIONS) {
        if (a === b) raw[a]![b] = 0;
        else raw[a]![b] = 0.929 + 0.071 * Math.abs(EMOTIONS.indexOf(a) - EMOTIONS.indexOf(b)) / 26;
      }
    }
    const normalized = minMaxNormalize(raw);
    let min = Infinity;
    let max = -Infinity;
    for (const a of EMOTIONS) {
      for (const b of EMOTIONS) {
        if (a === b) continue;
        min = Math.min(min, normalized[a]![b]!);
        max = Math.max(max, normalized[a]![b]!);
      }
    }
    expect(min).toBe(0);
    expect(max).toBe(1);
  });

  test("ベースライン行列は対称・対角0・[0,1]", () => {
    const matrix = minMaxNormalize(buildRawBaselineMatrix());
    for (const a of EMOTIONS) {
      expect(matrix[a]![a]).toBe(0);
      for (const b of EMOTIONS) {
        expect(matrix[a]![b]!).toBeGreaterThanOrEqual(0);
        expect(matrix[a]![b]!).toBeLessThanOrEqual(1);
        expect(matrix[a]![b]).toBeCloseTo(matrix[b]![a]!, 10);
      }
    }
  });

  test("直感的な近さ: joy-excitement は joy-grief より近い", () => {
    const matrix = buildDistanceMatrix();
    expect(matrix.joy!.excitement!).toBeLessThan(matrix.joy!.grief!);
  });
});

describe("ペルソナ差分上書き（ベースラインを叩き台に本人が上書き）", () => {
  test("指定ペアだけ変わり、対称性が保たれる", () => {
    const base = buildDistanceMatrix();
    const overridden = buildDistanceMatrix({ pairs: { [pairKey("joy", "sadness")]: 0.2 } });
    expect(overridden.joy!.sadness).toBe(0.2);
    expect(overridden.sadness!.joy).toBe(0.2);
    // 他ペアは無傷
    expect(overridden.joy!.excitement).toBe(base.joy!.excitement!);
  });

  test("上書き値は [0,1] にクランプされる", () => {
    const matrix = buildDistanceMatrix({ pairs: { [pairKey("joy", "grief")]: 1.7 } });
    expect(matrix.joy!.grief).toBe(1);
  });
});

describe("方向別移動係数（独自拡張: 実効距離の非対称化）", () => {
  const coefs: DirectionCoefficients = {
    valence: { "positive->negative": 1.4 },
    pairs: { "joy->sadness": 2.0 },
  };

  test("順序付きペア指定 > valence クラス指定 > 1.0 の優先順位", () => {
    expect(directionCoefficient(coefs, "joy", "sadness")).toBe(2.0);
    expect(directionCoefficient(coefs, "joy", "grief")).toBe(1.4); // positive->negative
    expect(directionCoefficient(coefs, "sadness", "joy")).toBe(1.0); // 未指定
  });

  test("実効距離が方向によって非対称になる", () => {
    const matrix = buildDistanceMatrix();
    const forward = effectiveDistance(matrix, coefs, "joy", "sadness");
    const backward = effectiveDistance(matrix, coefs, "sadness", "joy");
    expect(forward).toBeGreaterThan(backward);
    expect(forward).toBeCloseTo(matrix.joy!.sadness! * 2.0, 10);
  });
});

describe("伝播カーブ activation = strength * exp(-4 * distance²)", () => {
  test("距離 0.5 で約 37%", () => {
    expect(activationCurve(1.0, 0.5)).toBeCloseTo(Math.exp(-1), 6);
    expect(activationCurve(1.0, 0.5)).toBeCloseTo(0.3679, 3);
  });

  test("距離 0 で strength そのまま、距離 1 で約 1.8%", () => {
    expect(activationCurve(0.6, 0)).toBe(0.6);
    expect(activationCurve(1.0, 1)).toBeCloseTo(Math.exp(-4), 6);
  });

  test("strength に比例する", () => {
    expect(activationCurve(0.8, 0.3)).toBeCloseTo(2 * activationCurve(0.4, 0.3), 10);
  });
});
