# 自律行動ガイド

> cron でエージェントを定期的に起動し、呼ばれなくても自分で考えて動くようにする。

---

## 前提

- wardrobe のセットアップが完了していること（[セットアップガイド](setup.md)）
- memory-mcp がインストール済みであること
- `/wd-configure` で自律行動を「有効」にしていること

---

## 仕組み

`autonomous-action.sh` が cron で 20 分ごとに実行される。中では:

1. 時間帯・曜日のチェック（`schedule.conf` で制御）
2. 欲望の蓄積チェック（`desires.conf` で制御）
3. 内受容感覚の生成（`interoception.ts`）
4. 記憶の軽量想起（`recall-lite.ts`）
5. Claude Code の `--resume` で新しいターンを開始

エージェントは Heartbeat Protocol（CLAUDE.md に定義）に従って行動する。

---

## cron の設定

```bash
# 20分ごとに実行
*/20 * * * * /path/to/embodied-claude-wardrobe/autonomous-action.sh
```

パスは絶対パスで指定する。`~` は cron では展開されないことがある。

---

## 設定ファイル

### schedule.conf — いつ動くか

```conf
# 曜日: 0=日, 1=月, ..., 6=土
# 時間帯: 0-23
# active: 1=動く, 0=動かない

# 深夜は動かない
hour_0-5 = 0

# 平日の日中は動く
weekday_1-5 hour_9-22 = 1

# 土日は控えめに
weekday_0,6 hour_10-20 = 1
```

テンプレート: `.claude/templates/schedule.template.conf`

### desires.conf — 何をしたくなるか

```conf
# 欲望名 = 発火間隔（時間）
remember = 3      # 記憶を刻みたくなる
rest = 6           # 休みたくなる
reflect = 24       # 振り返りたくなる
consolidate = 24   # 記憶を整理したくなる
read = 48          # 何か読みたくなる
```

間隔を過ぎると欲望が蓄積し、自律行動時に発火する。

テンプレート: `.claude/templates/desires.template.conf`

### ROUTINES.md — 定期タスク

```markdown
## 週次
- [ ] 記憶の振り返り（最終: 2026-03-25）
- [ ] knowhow の更新確認（最終: 2026-03-20）

## 日次
- [ ] TODO.md の整理（最終: 2026-03-29）
```

自律行動時に ROUTINES.md を確認し、間隔が空いたタスクを実行する。

テンプレート: `.claude/templates/ROUTINES.template.md`

---

## 活動頻度の制御

### `/sleep` — 頻度を下げる

```
/sleep
```

`schedule.conf` の active を全て 0 にする。cron 自体は動くが、スクリプトが即座に終了する。

### `/awake` — 頻度を戻す

```
/awake
```

`schedule.conf` を元に戻す。

これらのスキルは `.claude/wardrobeOptions/skills/` にある。`/wd-configure` で自律行動を有効にすると自動的にリンクされる。

---

## Heartbeat Protocol — 自律行動時の行動指針

cron で起動したとき、エージェントは以下に従う:

1. 直近の記憶を引く
2. TODO.md を確認し、今すぐできるタスクがあるか判断する
3. 新しくやりたいことが浮かんだら TODO.md に追加する
4. やりたいことが複数あって迷ったら `/wd-dice` で決める
5. 何もなければ無理に何かを生産しない

「タスク消化マシンにならない」が鉄則。結果だけでなく「やってみてどう思ったか」を記憶に残す。

---

## トラブルシューティング

### 自律行動が動かない

1. cron が設定されているか確認: `crontab -l`
2. `schedule.conf` で現在の時間帯が active=1 か確認
3. `autonomous-action.sh` に実行権限があるか: `chmod +x autonomous-action.sh`

### ゾンビプロセスが残る

`autonomous-action.sh` にはタイムアウト機構が組み込まれている。通常は自動で終了するが、プロセスが残る場合は手動で停止する。
