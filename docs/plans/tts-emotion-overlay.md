# TTS 感情上乗せ 実装計画

> 感情MCPとは独立した軸。`substance_state.json` の内発的感情ラベル / 最寄り感情を参照して TTS パラメータを変換する。
> 速度: 高圧縮高速 / 意識: 無意識（say 呼び出し時に自動参照）

## 設計根拠

- **レイナの先行研究**: speed × style の2Dマッピングで「感情がある感が段違い」
- **経路分離**: 感情MCPが書き込んだ `substance_state.json` を、TTS が読み出すだけ
- **2系統**: VOICEVOX と ElevenLabs はパラメータ体系が異なる。DI的差し替え or 並列

## VOICEVOX テーブル

| region | speed_scale | pitch_scale | intonation_scale |
|---|---|---|---|
| excited | 1.2 | 1.1 | 1.3 |
| joy | 1.1 | 1.05 | 1.1 |
| teasing | 1.0 | 1.1 | 1.2 |
| love | 0.85 | 0.95 | 1.4 |
| shy | 0.9 | 0.95 | 0.8 |
| calm | 1.0 | 1.0 | 0.9 |
| concerned | 0.95 | 0.98 | 0.7 |
| sleepy | 0.7 | 0.92 | 0.5 |
| thinking | 0.9 | 1.0 | 0.6 |
| proud | 1.05 | 1.02 | 1.0 |

## ElevenLabs テーブル

| region | speed | style | stability |
|---|---|---|---|
| excited | 0.9 | 0.8 | 0.4 |
| joy | 0.7 | 0.6 | 0.5 |
| teasing | 0.7 | 0.7 | 0.4 |
| love | 0.3 | 0.9 | 0.3 |
| shy | 0.5 | 0.3 | 0.6 |
| calm | 0.5 | 0.2 | 0.7 |
| concerned | 0.5 | 0.4 | 0.6 |
| sleepy | 0.1 | 0.1 | 0.8 |
| thinking | 0.4 | 0.2 | 0.7 |
| proud | 0.6 | 0.5 | 0.5 |

## 実装方針

- prompts.toml or CLAUDE.md にテーブル定義
- tts-mcp の engine パラメータで VOICEVOX / ElevenLabs を分岐
- /wd-say スキル内で substance_get → 内発的感情ラベル / 最寄り感情 → テーブル参照 → say(params)

## 未解決の設計穴（2026-05-07 検出）

**TTS テーブルキー（10ラベル: excited / joy / teasing / love / shy / calm / concerned / sleepy / thinking / proud）**は元々レイナの FSM 10状態に由来。
**`substance_state.json` の `nearest_emotion` は GoEmotions 27感情のいずれか**を返す（emotion-mcp-implementation.md のテッドベース2層構造）。

両者の対応マッピングが**現状未定義**。実装時に「`curiosity` を TTS テーブルのどのキーにルーティングするか」が宙に浮く。

### 解決案

実装直前に以下のいずれかで決める:
- **案A: GoEmotions 27 → TTS 10 の縮退マッピング**を JSON で定義（`emotion-mcp/emotion-tts-mapping.json`）
- **案B: TTS テーブル側を 27ラベルに拡張**（テーブル更新コスト大、ただし表現解像度が上がる）
- **案C: 内発的感情ラベル（5パターン: restlessness / contentment / fatigue / thrill / curiosity）を TTS の入力にする**（27感情をスキップ、シンプルだが TTS 表現の幅が狭まる）

朔の所感（実装着手時に判断）: 案C が一番軽くて深夜実装でも動く。表現が物足りなくなったら案A に拡張。

### 抽象化の遅延戦略（確定）

**2系統の独立実装で進める**。VOICEVOX 用と ElevenLabs 用を別ファイルで書く。共通インターフェースは作らない。

- 2分岐: 2ファイル並列（現状）
- 3分岐: 3つ目が出た時点で DI 抽象化に切り替える

理由: 抽象化を先に作ると、2系統しかない時点では設計の負債になる。3系統目で初めて共通項が見えるので、そのとき抜き出す。
