# Ad Bike Backend (Cloudflare Workers)

Cloudflare Workersで動作する広告申込みAPIバックエンドです。

## 機能

- **POST /api/apply**: 広告申込みを受け付けます。
  - フォームデータ (multipart/form-data) を受信
  - 画像を R2 (Cloudflare Object Storage) に保存
  - 画像の公開URLを発行
  - Slack に申込み内容を通知

## 環境設定 (Environment Setup)

### 1. バインディング (wrangler.toml)

R2バケット `bike` を `AD_IMAGES_BUCKET` としてバインド済みです。

```toml
[[r2_buckets]]
binding = "AD_IMAGES_BUCKET"
bucket_name = "bike"
```

### 2. 環境変数 (Environment Variables)

以下の環境変数を設定してください（`wrangler secret put` またはダッシュボードで設定）。

| 変数名 | 説明 | 例 |
| :--- | :--- | :--- |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL | `https://hooks.slack.com/services/...` |
| `PUBLIC_IMAGE_BASE_URL` | R2公開バケットのベースURL | `https://pub-xxxx.r2.dev` |

**設定コマンド例:**

```bash
npx wrangler secret put SLACK_WEBHOOK_URL
npx wrangler secret put PUBLIC_IMAGE_BASE_URL
```

## デプロイ (Deployment)

```bash
npm install
npm run deploy
# または
npx wrangler deploy
```

## 動作確認 (Verification)

### 1. 正常系テスト (Success Case)

`curl` を使用して、画像付きの申込みを送信します。
※ `test-image.jpg` という画像ファイルがカレントディレクトリにある想定です。

**Windows (Command Prompt / curl.exe):**

※ Windows 10/11 には標準で `curl.exe` が搭載されています。PowerShellではなくコマンドプロンプト、または `curl.exe` と明示して実行することをお勧めします。

```cmd
:: 画像がない場合はダミー作成
echo dummy > test-image.jpg

:: リクエスト送信
curl.exe -v -X POST https://ad-bike-back.<your-subdomain>.workers.dev/api/apply ^
  -F "applicantName=株式会社テスト" ^
  -F "phone=090-1234-5678" ^
  -F "email=test@example.com" ^
  -F "adText=テスト広告です。よろしくお願いします。" ^
  -F "adImage=@test-image.jpg;type=image/jpeg"
```

**Bash / Mac / Linux:**

```bash
# 画像がない場合はダミー作成
echo "dummy" > test-image.jpg

# リクエスト送信
curl -v -X POST https://ad-bike-back.<your-subdomain>.workers.dev/api/apply \
  -F "applicantName=株式会社テスト" \
  -F "phone=090-1234-5678" \
  -F "email=test@example.com" \
  -F "adText=テスト広告です。よろしくお願いします。" \
  -F "adImage=@test-image.jpg;type=image/jpeg"
```

**確認事項:**
1. レスポンスが `{ "ok": true, "imageUrl": "..." }` であること。
2. Slackに通知が届いていること。
3. Slack通知内の画像URLをクリックして画像が表示されること。

### 2. エラー系テスト (Error Cases)

**必須項目不足:**

```bash
curl -v -X POST https://ad-bike-back.<your-subdomain>.workers.dev/api/apply \
  -F "applicantName=Test"
# -> 400 Bad Request ({ "error": "Missing required fields" })
```

**不正なメールアドレス:**

```bash
curl -v -X POST https://ad-bike-back.<your-subdomain>.workers.dev/api/apply \
  -F "applicantName=Test" \
  -F "phone=000" \
  -F "email=invalid-email" \
  -F "adText=text" \
  -F "adImage=@test-image.jpg"
# -> 400 Bad Request ({ "error": "Invalid email format" })
```

**画像形式NG:**

```bash
echo "text" > test.txt
curl -v -X POST https://ad-bike-back.<your-subdomain>.workers.dev/api/apply \
  -F "applicantName=Test" \
  -F "phone=000" \
  -F "email=test@example.com" \
  -F "adText=text" \
  -F "adImage=@test.txt;type=text/plain"
# -> 415 Unsupported Media Type ({ "error": "File must be an image" })
```
