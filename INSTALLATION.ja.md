# OpenFamily をサーバーにインストールする

*[English version](INSTALLATION.md)*

このガイドでは、空のサーバーから始めて、OpenFamily を家族のために動かし、スマホからアクセスでき、最新の状態に保つところまで案内します。Linux サーバー（VPS、ミニ PC、Docker が動く NAS、Raspberry Pi 4/5、Proxmox コンテナ）とターミナルがある前提です。サーバーに Node.js は要りません。すべて Docker の中で動きます。

- [インストール方法を選ぶ](#インストール方法を選ぶ)
- [手早い方法: コンテナ1つ](#手早い方法-コンテナ1つ)
- [1. Docker をインストールする](#1-docker-をインストールする)
- [2. OpenFamily を取得する](#2-openfamily-を取得する)
- [3. 設定する](#3-設定する)
- [4. 起動する](#4-起動する)
- [5. 家族を作成する](#5-家族を作成する)
- [6. HTTPS で家の外からアクセスする](#6-https-で家の外からアクセスする)
- [7. 更新する](#7-更新する)
- [8. バックアップと復元](#8-バックアップと復元)
- [トラブルシューティング](#トラブルシューティング)
- [ローカル開発](#ローカル開発)

## インストール方法を選ぶ

| 手元にあるもの | 使うもの |
|---|---|
| つけっぱなしの Windows PC | [Windows インストーラー](https://github.com/NexaFlowFrance/OpenFamily/releases/latest/download/OpenFamily-Setup.exe)。Docker 不要、設定不要です。 |
| Proxmox ホスト | [Proxmox スクリプト](#proxmox): コンテナを作成し、Docker をインストールし、すべて設定します。 |
| Home Assistant、Umbrel、CasaOS、Runtipi、Unraid、TrueNAS | そのシステムのアプリカタログ: [一覧](README.ja.md#-サーバーのアプリカタログから)を見てください。 |
| Docker がある任意のマシン: サーバー、NAS、Raspberry Pi | [コンテナ1つ](#手早い方法-コンテナ1つ): コマンド1つ、設定不要です。 |
| PostgreSQL、API、Web サーバーを別々のコンテナにしたい、またはソースからビルドしたいサーバー | Docker Compose: このガイドのステップ1から進めてください。 |

**リソース:** 家族で使う分には CPU 1コアとメモリ 1 GB で十分です。イメージのビルド中は 2 GB あると快適です。単一イメージはディスク約 500 MB で、自分でイメージをビルドする場合は 3 GB を見込んでください。データベースには数百 MB が要ります。amd64 と arm64（Raspberry Pi）の両方に対応しています。

## 手早い方法: コンテナ1つ

1つのイメージに Web 画面、API、PostgreSQL が入っています。`.env` ファイルは要りません。秘密情報は初回起動時に生成され、データと一緒に保存されます。Docker がまだインストールされていない場合は、先に[ステップ1](#1-docker-をインストールする)を行ってください。

```bash
docker run -d --name openfamily --restart unless-stopped \
  -p 3000:3000 -v openfamily:/data \
  ghcr.io/nexaflowfrance/openfamily:latest
```

10秒ほど（Raspberry Pi の初回はデータベースの作成のため少し長く）で、OpenFamily が `http://<サーバーのアドレス>:3000` で開けます。Android アプリも同じアドレスに接続します。続けて[5. 家族を作成する](#5-家族を作成する)と[6. HTTPS で家の外からアクセスする](#6-https-で家の外からアクセスする)を行ってください。どちらもそのまま当てはまります。

Compose ファイルがいい場合は、[`docker/all-in-one/docker-compose.yml`](docker/all-in-one/docker-compose.yml) が同じコンテナを起動します。ダウンロードして、その隣で `docker compose up -d` を実行してください。

**保持するもの。** すべて `/data` の中にあります。データベースと、初回起動時に作られる秘密情報を入れた `openfamily.env`（セッションへの署名と保存された連携パスワードの暗号化に使う鍵、データベースのパスワード、プッシュ通知の鍵）です。上記のように Docker ボリュームを使うか、Linux ディスクのフォルダ（`-v /srv/openfamily:/data`）を使ってください。Windows のフォルダや SMB 共有ではだめです。PostgreSQL には Unix の権限を保持するファイルシステムが要ります。

**設定。** 必須のものはありません。[ステップ3](#3-設定する)の任意の変数はどれも `-e` で渡せます。全部をファイルにまとめて `--env-file` で渡すこともできます。

```bash
docker run -d --name openfamily --restart unless-stopped \
  -p 3000:3000 -v openfamily:/data \
  -e REGISTRATION_ENABLED=false \
  -e SMTP_HOST=smtp.example.com -e MAIL_FROM="OpenFamily <family@example.com>" \
  ghcr.io/nexaflowfrance/openfamily:latest
```

- この方法で渡した `JWT_SECRET` や `VAPID_*` の鍵ペアは、ボリュームに保存されたものより優先されます。既存のインストールの秘密情報を引き継ぐ方法がこれです。
- データベースの設定と `SERVER_PORT` はイメージ側のものです。別のポートを使うには、`-p` の左側を変更してください（`-p 8080:3000`）。
- `TZ` は任意です。新しい家族は作成したブラウザのタイムゾーンを引き継ぎ、保護者が設定で変更できます。
- Ollama のような同じマシンで動くサービスへ届かせるには、`--add-host host.docker.internal:host-gateway` を追加し、アドレスとして `http://host.docker.internal:11434` を使ってください。

**更新。** 先にバックアップしてください。新しいイメージを取得してコンテナを置き換えます。データはボリュームに残り、データベースの変更は起動時に自動で実行されます。

```bash
docker pull ghcr.io/nexaflowfrance/openfamily:latest
docker stop openfamily && docker rm openfamily
docker run -d --name openfamily ...   # the same command as the first time
```

使いたいバージョンに留めるには、`latest` の代わりにその番号を使ってください。例: `ghcr.io/nexaflowfrance/openfamily:2.2.0`。

**バックアップと復元。** 2つのファイルにすべてが入っています。

```bash
docker exec openfamily pg_dump -U openfamily -d openfamily -Fc > openfamily-$(date +%F).dump
docker exec openfamily cat /data/openfamily.env > openfamily-secrets.env
```

2つを一緒に、サーバー以外の場所に保管してください。新しいインストールへ復元するには、上記のようにコンテナを起動してから次を実行します。

```bash
docker exec -i openfamily pg_restore -U openfamily -d openfamily --clean --if-exists --no-owner < openfamily-2026-11-16.dump
docker cp openfamily-secrets.env openfamily:/data/openfamily.env
docker restart openfamily
```

秘密情報のファイルがないと、アカウントとデータはすべて揃っていても、保存された連携パスワードとフォロー中のカレンダーのアドレスが読めなくなり、各スマホで通知を再度許可する必要があります。

**Docker Compose 版からの移行と、戻す場合。** どちらも PostgreSQL 16 を使うため、片方で作ったダンプはもう片方へ復元できます。ダンプは[ステップ8](#8-バックアップと復元)のコマンドで作り、復元は上記の `pg_restore` の行で行い、新しいコンテナには `.env` の `JWT_SECRET` と `VAPID_*` の鍵を `-e` で渡してください。

## 1. Docker をインストールする

`docker compose version` が既に応答する場合は、このステップを飛ばしてください。

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # then log out and back in
docker compose version            # must print v2.x
```

## 2. OpenFamily を取得する

```bash
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily
git checkout "$(git describe --tags --abbrev=0)"   # latest release rather than work in progress
```

## 3. 設定する

```bash
cp .env.example .env
nano .env
```

次の値を変更してください。`JWT_SECRET` がない、32文字未満、またはサンプルのままの場合、サーバーは起動を拒否します。

| 変数 | 入れるもの | 方法 |
|---|---|---|
| `POSTGRES_PASSWORD` | 強いデータベースパスワード | `openssl rand -hex 24` |
| `JWT_SECRET` | 32文字以上のランダムな秘密情報 | `openssl rand -hex 32` |
| `TZ` | サーバーが動くタイムゾーン。例: `Europe/Paris`、`America/Montreal` | 保護者が設定で家族のタイムゾーンを選ぶまでの間、リマインダーとカレンダーに使われます |
| `NODE_ENV` | `production` | |

任意ですが、設定する価値があるもの:

| 変数 | 用途 |
|---|---|
| `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` | プッシュ通知（リマインダー、家族の活動）。鍵は `docker run --rm node:26-alpine npx -y web-push generate-vapid-keys` で生成します。`VAPID_SUBJECT` は `mailto:` の後に自分のメールアドレスを続けたものです。プッシュには HTTPS も要ります（ステップ6）。 |
| `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`MAIL_FROM` | 招待メールとパスワードリセット。なくても、招待はリンクを共有すれば機能します。 |
| `REGISTRATION_ENABLED` | `false` で新規登録を閉じます。招待した人だけがアカウントを作成できます（ステップ5を参照）。 |
| `INTEGRATIONS_BLOCK_PRIVATE_IPS` | `true` にすると、サーバーは連携、AI プロバイダー、Webhook のためにプライベートアドレス（`192.168.x.x`、`10.x`、`localhost`）を呼ばなくなります。自宅では Home Assistant や Ollama が自分のネットワークにあるのでオフのままにし、家族以外の人にも開くサーバーではオンにしてください。 |
| `OIDC_*`、`PASSWORD_LOGIN_ENABLED` | 自分の ID プロバイダー（Authentik、Keycloak など）経由のログイン: [シングルサインオン (SSO)](#シングルサインオン-sso)を見てください。 |

次は、必要だと分かっている場合を除き**空のまま**にしてください: `VITE_API_URL`、`VITE_WS_URL`（Web アプリは自分のアドレスと通信し、`/api` を自ら転送します）、`CORS_ORIGINS`（Web アプリが別のドメインから配信される場合のみ）、`APP_PUBLIC_URL`（プロキシの背後でメール内のリンクのアドレスが間違っている場合、またはシングルサインオンの場合のみ）。

## 4. 起動する

**選択肢A: ビルド済みイメージ**（速く、小さいマシンや Raspberry Pi におすすめ）。`docker-compose.yml` の隣に、チェックアウトしたバージョンで `docker-compose.override.yml` を作成します。

```yaml
services:
  server:
    image: ghcr.io/nexaflowfrance/openfamily-server:2.2.0
  client:
    image: ghcr.io/nexaflowfrance/openfamily-client:2.2.0
```

```bash
docker compose pull server client
docker compose up -d
```

**選択肢B: サーバーでビルド**（数分、メモリ 2 GB）:

```bash
docker compose up -d --build
```

次に確認します。

```bash
docker compose ps                        # the three services are "healthy"
curl -s http://localhost:3000/health     # {"status":"ok",...}
```

OpenFamily は `http://<サーバーのアドレス>:3000` にあります。要るのはポート **3000** だけです。アプリを配信し、API とライブ更新をサーバーへ転送します。Android アプリもこのアドレスに接続します。

> **他のポートをインターネットに公開しないでください。** Compose ファイルはローカルツール向けに API（3001）と PostgreSQL（`POSTGRES_PORT`）も公開しています。インターネットから届くサーバーでは、ファイアウォールで 3000（またはプロキシ経由の 80/443）だけを許可するか、`docker-compose.override.yml` へ次を加えてマシン自体に留めてください（Docker Compose 2.24 以降）:
>
> ```yaml
>   postgres:
>     ports: !override
>       - "127.0.0.1:5432:5432"
> ```
>
> `server:` の下に `127.0.0.1:3001:3001` で同じことをします。

## 5. 家族を作成する

1. OpenFamily を開いてアカウントを作成します。そのアカウントが新しい家族の所有者になります。
2. **家族**で、各メンバー（アカウントあり・なし両方）を追加し、自分のログインが欲しい大人を招待します。
3. 自分のアカウントができたら、新規登録を閉じます。`.env` で `REGISTRATION_ENABLED=false` にし、`docker compose up -d` を実行します。それ以降は誰も勝手にアカウントを作成できませんが、**家族**から招待した人（リンクまたはメール）は作成できます。招待が入場券になります。招待の有効期限は1日から30日で、1つのメールアドレス専用にもできます。

## 6. HTTPS で家の外からアクセスする

HTTPS は、プッシュ通知、スマホへアプリとしてインストールすること、インターネット上でパスワードを守るために要ります。どちらか選んでください。

**Tailscale（ポート開放なし、公開なし）。** サーバーと各スマホに [Tailscale](https://tailscale.com/download) をインストールします。`http://<サーバーの Tailscale 名>:3000` を開くか、サーバーで `tailscale serve --bg 3000` を実行すると HTTPS のアドレスが得られます。

**ドメインとリバースプロキシ。** DNS レコード（`family.example.com`）を自分のサーバーへ向け、ポート 80 と 443 を開き、すべてをポート 3000 へ送ります。証明書を自動で取得する [Caddy](https://caddyserver.com) なら、`Caddyfile` 全体がこれだけです。

```
family.example.com {
    reverse_proxy localhost:3000
}
```

**Nginx Proxy Manager** では、`http://<サーバーの IP>:3000` へのプロキシホストを作成し、**Websockets support** をオンにして、Let's Encrypt 証明書をリクエストします。自分の **nginx** では、WebSocket 用の `Upgrade`/`Connection` ヘッダーと `client_max_body_size 256m` を付けて `/` をポート 3000 へ転送します。

プロキシのために `.env` を変更する必要はありません。アプリは開かれたアドレスが何であれ、そのアドレスで動きます。

## 7. 更新する

先にバックアップしてください（ステップ8）。データベースの変更はサーバーの起動時に自動で実行されます。

**ビルド済みイメージ:** `docker-compose.override.yml` のバージョンを変更してから:

```bash
git fetch --tags && git checkout <new-version>     # keeps docker-compose.yml in step
docker compose pull server client
docker compose up -d
```

**サーバーでビルドした場合:**

```bash
git fetch --tags && git checkout "$(git describe --tags --abbrev=0 origin/main)"
docker compose up -d --build
```

[リリースノート](https://github.com/NexaFlowFrance/OpenFamily/releases)には新しい `.env` 設定があれば記載されます。`.env.example` と比べてください。

## 8. バックアップと復元

すべては PostgreSQL のボリュームの中にあります。毎日のダンプで十分です。

```bash
docker compose exec -T postgres pg_dump -U openfamily -d openfamily -Fc > openfamily-$(date +%F).dump
```

新しいインストールへ復元します（`docker compose up -d` の後、アカウントを作成する前）。

```bash
docker compose exec -T postgres pg_restore -U openfamily -d openfamily --clean --if-exists < openfamily-2026-09-26.dump
docker compose restart server
```

ダンプと一緒に `.env` も保管してください。同じ `JWT_SECRET` がないと、保存された連携パスワードとフォロー中のカレンダーのアドレスが読めません。

各家族は**設定 → データを書き出す**から自分のデータをダウンロードし、別の OpenFamily へ取り込むこともできます。

## シングルサインオン (SSO)

既に運用している OpenID Connect プロバイダーでログインできます: Authentik、Keycloak、Authelia、Pocket ID、Zitadel、Google など。オフにしない限り、パスワードでのログインも引き続き機能します。

1. プロバイダー側で、**機密（confidential）**の OpenID Connect クライアント（認可コードフロー）を次で作成します:
   - リダイレクト URI: `https://family.example.com/api/auth/oidc/callback`（自分のアドレスの後に `/api/auth/oidc/callback`）
   - スコープ `openid email profile`
   - RS256 で署名された ID トークン（通常の既定）
2. `.env` へ追加します:

   | 変数 | 値 |
   |---|---|
   | `APP_PUBLIC_URL` | `https://family.example.com`、リダイレクト URI の始まりのアドレス |
   | `OIDC_ISSUER_URL` | プロバイダーの issuer。例: `https://auth.example.com/application/o/openfamily/`（Authentik）、`https://auth.example.com/realms/home`（Keycloak）、`https://id.example.com`（Pocket ID） |
   | `OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET` | ステップ1で得たもの |
   | `OIDC_PROVIDER_NAME` | ボタンのラベル。例: `Authentik` |

3. `docker compose up -d` を実行してログインページを開きます。**…で続ける**と表示されます。表示されない場合、サーバーのログに何が不足しているかを示す `auth.oidc_disabled` の行があります。

**Android アプリの場合。** 同じボタンが表示されます。押すとスマートフォンのブラウザでプロバイダーが開き、ログインが済むとアプリに戻ります。プロバイダー側で追加の登録は不要で、リダイレクト URI は上記のままです。サーバーとアプリの両方が 2.2.0 より新しい必要があります。

サーバーは HTTPS でプロバイダーへ届く必要があります。クライアントシークレットは `.env` の中だけに置いてください。変更するには、プロバイダー側で新しいものを設定し、`.env` を更新し、`docker compose up -d` を実行してから、古いものを失効させます。

**誰が入れるか。** SSO で初めてログインするとき:
- 同じメールアドレスを使うアカウントが既にある場合、SSO ではそのアカウントを開きません。本人がパスワードでログインし、**設定 → ログイン**で SSO を連携します（1回だけ）。メールアドレスだけではアカウントの所有者を証明できません（パスワード登録ではメールアドレスを確認せず、一部のプロバイダーでは任意のアドレスを設定できるため）。そのため、その後はメールアドレスではなくプロバイダーとの連携でアカウントを識別します。
- そのメールアドレスを使うアカウントがない場合、新しいアカウントが作成されます。ただし、プロバイダーがメールアドレスを確認済みの場合に限ります。また、SSO 登録が開いている（`OIDC_REGISTRATION_ENABLED`。未設定の場合は `REGISTRATION_ENABLED` に従います）か、招待経由の場合に限ります。Keycloak では、管理者が作成したユーザーは「Email verified」がオフで、自分でオンにするまでそのままです。

| 目的 | `PASSWORD_LOGIN_ENABLED` | `REGISTRATION_ENABLED` | `OIDC_REGISTRATION_ENABLED` |
|---|---|---|---|
| パスワードと SSO、誰でも登録可 | `true` | `true` | (unset) |
| パスワードは引き続き機能、新しい人は SSO 経由のみ | `true` | `false` | `true` |
| どちらの方法でも招待のみ | `true` | `false` | (unset) |
| SSO のみ | `false` | `false` | `true` |

招待は常に機能します。`PASSWORD_LOGIN_ENABLED=false` はパスワードでの登録とリセットもオフにします。また、SSO が設定されるまでは無視されるため、タイプミスで締め出されることはありません。パスワードをオフにする前に SSO ログインをテストし、既存のユーザーには先に**設定 → ログイン**で SSO を連携してもらってください。連携がないと、パスワードをオフにした後はログインできません。

**SSO のみのサーバーでプロバイダーが落ちている場合**、`PASSWORD_LOGIN_ENABLED=true` にし、`docker compose up -d` を実行し、自分のアカウントにパスワードを設定します。

```bash
docker compose exec server node server/dist/scripts/authAdmin.js set-password --email you@example.com
```

`set-password` の代わりに `unlink-sso` を使うと、アカウントの SSO 連携を外します。どちらもそのアカウントを全デバイスからログアウトさせます。Windows インストーラーや Proxmox スクリプトの場合は、それらが作成した `.env` ファイルに同じ変数を追加してください。Unraid、CasaOS、Runtipi ではアプリの設定の中にあります。

**知っておくとよいこと。**
- プロバイダー側でログアウトしても OpenFamily からはログアウトされず、プロバイダー側で削除された人も、開いているセッションが期限切れ（7日）になるまで残ります。今すぐ終わらせるには、自分のアカウントでは**設定 → ログイン → 全デバイスからログアウト**を、他の人については**家族**でその人を削除します。パスワードリセットもアカウントを全デバイスからログアウトさせます。
- 家族から誰かを削除したり、家族を別のメンバーへ譲ったりすると、関係者は今や全デバイスからログアウトされます。
- リバースプロキシは、プロバイダーが `/api/auth/oidc/callback` へ送るワンタイムコードを含む完全なアドレスをログに残すことがあります。コードは数秒後には使えなくなりますが、そのパスのログからクエリ文字列を外すこともできます。
- Android アプリは今のところパスワードログインのままです。

## Proxmox

Proxmox の**ホスト**で実行します（コンテナの中ではありません）。

```bash
curl -fsSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/proxmox-lxc-install.sh -o openfamily-lxc.sh
bash openfamily-lxc.sh --help                       # all options
bash openfamily-lxc.sh --id 210 --ip 192.168.1.50/24 --gw 192.168.1.1
```

Docker 入りの Debian コンテナを作成し、秘密情報を生成し、OpenFamily を起動します。後の更新は `pct exec 210 -- openfamily-update` で行います。先にデータベースをバックアップします。

## トラブルシューティング

**まずログを見てください:** `docker compose logs --tail=200 server`。

| 症状 | 原因と直し方 |
|---|---|
| サーバーがループで再起動し、ログに `JWT_SECRET` と出る | ない、短すぎる、またはサンプルのまま: 32文字以上のランダムな値を設定してください。 |
| `password authentication failed for user "openfamily"` | データベースのボリュームが別の `POSTGRES_PASSWORD` で作成されています。古いパスワードに戻すか、新しいインストールの場合に限って、`docker compose down -v` でボリュームを削除してください（データが消えます）。 |
| `port is already allocated` | 別のプログラムが 3000、3001、または PostgreSQL のポートを使っています。`.env` の `POSTGRES_PORT` を変更するか、アプリに別のポートを割り当ててください（例: `client` に `"8080:80"`）。 |
| リマインダーが1〜2時間遅れて届く | `TZ` がありません: `.env` で設定し、`docker compose up -d` を実行してください。 |
| 「登録」が表示されない、または拒否される | `REGISTRATION_ENABLED=false` です: 代わりに**家族**からその人を招待するか、`true` に設定してください。 |
| ログインページに「…で続ける」ボタンがない | SSO がオフです: サーバーのログの `auth.oidc_disabled` の行に、どの変数が不足しているか書かれています（多くの場合は `APP_PUBLIC_URL`）。 |
| SSO が「ログインに失敗しました」で終わる | サーバーのログの `auth.oidc_callback_failed` の行に理由があります。プロバイダーに登録したリダイレクト URI が `APP_PUBLIC_URL` + `/api/auth/oidc/callback` と正確に一致するか確認してください。 |
| プッシュ通知が来ない | HTTPS と3つの `VAPID_*` の値が要り、各デバイスで許可されている必要があります。 |
| ページは読み込まれるがプロキシの背後でライブ更新されない | WebSocket が転送されていません: プロキシで WebSocket のサポートをオンにしてください。 |
| 取り込み時に「413 Request Entity Too Large」 | 自分のプロキシがアップロードを制限しています: 上限を上げてください（nginx では `client_max_body_size 256m`）。 |

それでも解決しない場合は、`docker compose ps` の出力とサーバーのログ（秘密情報は除く）を添えて [issue](https://github.com/NexaFlowFrance/OpenFamily/issues) を開いてください。

## ローカル開発

```bash
docker compose up -d postgres     # the database only
npm run install:all
npm run dev:server                # API on http://localhost:3001
npm run dev:client                # app on http://localhost:5173
```

サーバーはリポジトリのルートから `.env` を読みます。`npm run smoke:api` は動いているスタックを端から端まで確認します（`curl` と `jq` が要ります）。
