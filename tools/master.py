"""
管理者用 CLI ツール。起動中の API サーバーに対して管理コマンドを送信します。

使用例:
  python master.py alert "サーバーメンテナンスのため一時中断します"
  python master.py alert "再起動します。しばらくお待ちください。" --reload
  python master.py newmap map2
  python master.py users
  python master.py leave <user_hash>
"""

import argparse
import json
import sys
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import dotenv_values

_config = dotenv_values(".env")
_API_PORT = int(_config.get("API_PORT") or 41022)
_BASE_URL = f"http://127.0.0.1:{_API_PORT}"


def _post(payload: dict) -> dict:
    body = json.dumps(payload).encode()
    req = Request(
        f"{_BASE_URL}/api/master",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Secret-Key": _config.get("SECRET_KEY", ""),
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except URLError as e:
        print(f"エラー: API サーバーに接続できません ({_BASE_URL})", file=sys.stderr)
        print(f"  詳細: {e.reason}", file=sys.stderr)
        sys.exit(1)


def cmd_alert(args):
    result = _post({"command": "ALERT", "text": args.text, "reload": args.reload})
    if result.get("ok"):
        suffix = "（クライアントはリロードされます）" if args.reload else ""
        print(f"ALERT 送信完了: {args.text!r}{suffix}")
    else:
        print(f"失敗: {result}", file=sys.stderr)
        sys.exit(1)


def cmd_newmap(args):
    result = _post({"command": "NEWMAP", "map": args.map_name})
    if result.get("ok"):
        print(f"NEWMAP 送信完了: {args.map_name!r}")
    else:
        print(f"失敗: {result}", file=sys.stderr)
        sys.exit(1)


def cmd_leave(args):
    result = _post({"command": "LEAVE", "h": args.hash})
    if result.get("ok"):
        print(f"LEAVE 完了: {args.hash!r} をキックしました")
    else:
        print(f"失敗: {result}", file=sys.stderr)
        sys.exit(1)


def cmd_users(args):
    result = _post({"command": "USERS"})
    users = result.get("users", [])
    if not users:
        print("接続中のユーザーはいません")
        return
    print(f"接続中のユーザー ({len(users)} 人):")
    for u in users:
        name = u.get("name") or "(名前未設定)"
        h = u.get("h", "")
        print(f"  {h}  {name}")


def main():
    parser = argparse.ArgumentParser(
        prog="python master.py",
        description="itcobkai 管理者用 CLI ツール",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # alert
    p_alert = sub.add_parser("alert", help="全ユーザーに ALERT を送信する")
    p_alert.add_argument("text", help="送信するメッセージ")
    p_alert.add_argument(
        "--reload",
        action="store_true",
        default=False,
        help="クライアントにページのリロードを促す",
    )
    p_alert.set_defaults(func=cmd_alert)

    # newmap
    p_newmap = sub.add_parser("newmap", help="全ユーザーを新しいマップに移行させる")
    p_newmap.add_argument(
        "map_name", help="マップ名 (data/itcobkai.json に定義されているもの)"
    )
    p_newmap.set_defaults(func=cmd_newmap)

    # users
    p_users = sub.add_parser("users", help="接続中のユーザー一覧を表示する")
    p_users.set_defaults(func=cmd_users)

    # leave
    p_leave = sub.add_parser("leave", help="指定したユーザーをキックする")
    p_leave.add_argument("hash", help="ユーザーハッシュ (users コマンドで確認可)")
    p_leave.set_defaults(func=cmd_leave)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
