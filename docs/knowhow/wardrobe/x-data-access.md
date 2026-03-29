# X（Twitter）データ取得の選択肢

## わかったこと

- X の公式 API は高額（Basic $100/月、Pro $5,000/月）。個人利用には現実的でない
- Nitter は 2024 年にほぼ全公開インスタンスが停止。セルフホストも実アカウント必須
- 代替手段はいくつかある:

| 手段 | 特徴 | コスト |
|---|---|---|
| **Xpoz** | MCP 対応。自然言語で10億件のツイート検索。月10万件無料 | 無料枠あり |
| **XRSS** | セルフホスト。ツイートを RSS に変換。フィルタ付き | 無料（運用コスト） |
| **RSSHub** | セルフホスト。X 含む多数のサイトを RSS 化 | 無料（X はセッション Cookie 必要） |
| **RSS.app** | SaaS。URL 入力で RSS 生成 | 無料プランあり |

## ワードローブでの使い方

- **wd-cc-tracker**（Claude Code 機能トラッカー）で X の情報源として使う
- Xpoz MCP がインストールされていればそちらを使い、なければスキップする設計にする
- CHANGELOG（GitHub WebFetch）は常に使える。X は補助的な情報源

## 気をつけること

- Xpoz は外部サービス依存。将来の料金変更や停止リスクがある
- RSSHub の X 対応はウェブセッション Cookie が必要で、定期的に更新が要る
- スクレイピング系はすべて利用規約のグレーゾーン

## 参照

- [Xpoz](https://www.xpoz.ai/apps/openclaw-skills/twitter-api-alternative/)
- [XRSS](https://github.com/Thytu/XRSS)
- [RSSHub](https://github.com/DIYgod/RSSHub)
- [RSS.app](https://rss.app/rss-feed/create-twitter-rss-feed)
