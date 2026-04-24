---
description: "Use when editing SolidJS frontend code, UI components, state orchestration, schema mirroring, or files under src/. Covers frontend structure and styling conventions."
name: "Frontend Guidelines"
applyTo: "src/**/*.ts,src/**/*.tsx,src/**/*.css"
---

# Frontend Guidelines

## 主要ファイル

| ファイル                            | 役割                                                                                        |
| :---------------------------------- | :------------------------------------------------------------------------------------------ |
| `src/index.tsx`                     | HashRouter で `/`, `/login`, `/setup`, `*` を配線                                           |
| `src/pages/Main.tsx`                | `Manager` の生成、`/init`、canvas / audio ref、タブや主要 UI の統合                         |
| `src/pages/Setup.tsx`               | 初回登録フォーム。name 設定済みなら `/` にリダイレクト                                      |
| `src/main/Manager.ts`               | `UserStore`、`HostMessageDispatcher`、`RtcSession`、`Controller` を配線するオーケストレータ |
| `src/main/HostMessageDispatcher.ts` | `HostCommand` ごとの処理、`UserStore` 更新、`Controller` 反映                               |
| `src/main/UserStore.ts`             | クライアント側ユーザー状態の authoritative store                                            |
| `src/main/RtcSession.ts`            | `RTCClient` を包むアプリ境界                                                                |
| `src/main/Connections.ts`           | Python 側 `connections.py` と対称の接続ロジック                                             |
| `src/common/RTC.ts`                 | LiveKit ルームとデータチャネルを扱う `RTCClient`                                            |
| `src/common/Schema.ts`              | `User`、`Map`、`HostCommand`、`GuestCommand` などの共有型                                   |
| `src/views/VoicePanel.tsx`          | 接続状態、退席、ユーザーリスト、島表示の UI                                                 |
| `src/views/ProfileForm.tsx`         | プロフィール編集 UI                                                                         |

## 実装規約

- フロントエンドは SolidJS です。React hooks は使わず、`createSignal`、`createMemo`、`createEffect` を使ってください。
- DOM を必要とする副作用には `onMount` を使ってください。
- コンポーネントファイルは JSX を含む PascalCase、マネージャーやユーティリティも既存構成に合わせて PascalCase を維持します。
- 画面コンポーネントの責務分割は `Main.tsx` の構成を基準に判断し、`VoicePanel` や `ProfileForm` のような再利用単位は分離を維持します。
- インデントはスペース 2 つ、ダブルクォート、末尾カンマなし、最大行幅 120 を守ります。
- `src/main/Connections.ts` の接続ロジックを変えるときは、Python 側の `api/master/connections.py` と同期してください。
- `src/common/Schema.ts` の enum や型を変えるときは、Python 側ミラー実装とテストも一緒に更新してください。
