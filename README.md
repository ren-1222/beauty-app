# beauty-app

`@tazimagumi/client` 経由で、親リポジトリの `@tazimagumi/beauty-kit` サーバーを呼ぶ最小美容アプリです。最初の接続対象は表現チェック（`kit.expression.check`）に限定しています。

## 起動

Node.js 22.18 以上が必要です。親リポジトリのルートで依存を入れてから、2つのターミナルで起動します。

```sh
# 親リポジトリのルート
npm ci
npm run --workspace=beauty-kit serve

# apps/beauty-app
npm install
npm start
```

ブラウザで <http://127.0.0.1:5173> を開きます。キットサーバーのURLを変える場合は `BEAUTY_KIT_URL`、アプリの待受ポートを変える場合は `APP_PORT` を設定します。

## 今回の範囲

- `beauty-kit` の `/api/health` を表示して接続状態を確認
- `@tazimagumi/client` の `createKitClient` でSDKを生成
- `kit.expression.check(text)` をアプリのサーバーから呼び出し、結果を画面に表示
- APIキーはブラウザに置かず、ローカルモードで動作確認

商品検索・肌写真解析・RAG相談など、外部キーや追加環境が必要な機能はこの最小接続の後に追加します。
