"""
管理者用 CLI ツール。起動中の API サーバーに対して管理コマンドを送信します。

使用例:
  python master.py alert "サーバーメンテナンスのため一時中断します"
  python master.py alert "再起動します。しばらくお待ちください。" --reload
  python master.py newmap map2
  python master.py users
  python master.py leave <user_hash>
  python master.py volume <user_hash> <0-2>
"""

import argparse
import json
import sys
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import dotenv_values

_config = dotenv_values(".env")
_API_PORT = int(_config.get("API_PORT") or 41022)
_BASE_URL = f"http://127.0.0.1:{_API_PORT}"


def _isnum(value: str) -> bool:
    try:
        float(value)
        return True
    except ValueError:
        return False


def _dp(value: str) -> int:
    value = value.lower().split("e", 1)[0]
    return len(value.split(".", 1)[1]) if "." in value else -1


def _char_width(value: str) -> int:
    if unicodedata.combining(value):
        return 0
    if unicodedata.category(value) == "Cf":
        return 0
    return 2 if unicodedata.east_asian_width(value) in {"F", "W"} else 1


def _text_width(value: str) -> int:
    return sum(_char_width(char) for char in value)


def _ljust_width(value: str, width: int) -> str:
    return value + " " * max(0, width - _text_width(value))


def _rjust_width(value: str, width: int) -> str:
    return " " * max(0, width - _text_width(value)) + value


def print_table(table: list[list[str]], headers: list[str]) -> str:
    cols = list(zip(*table)) if table else [[] for _ in headers]
    outcols = []
    widths = []
    nums = []

    for header, col in zip(headers, cols):
        col = list(col)
        num = all(_isnum(value) for value in col)
        nums.append(num)

        if num:
            digits = max([-1] + [_dp(value) for value in col])
            col = [value + " " * (digits - _dp(value)) for value in col]
            width = max([_text_width(header) + 2] + [_text_width(value) for value in col])
            col = [_rjust_width(value, width) for value in col]
        else:
            col = [value.strip() for value in col]
            width = max([_text_width(header) + 2] + [_text_width(value) for value in col])
            col = [_ljust_width(value, width) for value in col]

        widths.append(width)
        outcols.append(col)

    headers = [
        _rjust_width(header, width) if num else _ljust_width(header, width)
        for header, width, num in zip(headers, widths, nums)
    ]

    def row(values: list[str] | tuple[str, ...]) -> str:
        return "|" + "|".join(f" {value} " for value in values) + "|"

    print(
        "\n".join(
            [
                row(headers),
                "|" + "+".join("-" * (width + 2) for width in widths) + "|",
                *map(row, zip(*outcols)),
                "",
            ]
        )
    )


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
    except HTTPError as e:
        try:
            return json.loads(e.read())
        except json.JSONDecodeError:
            print(f"失敗: HTTP {e.code}", file=sys.stderr)
            sys.exit(1)
    except URLError as e:
        print(f"エラー: API サーバーに接続できません ({_BASE_URL})", file=sys.stderr)
        print(f"  詳細: {e.reason}", file=sys.stderr)
        sys.exit(1)


def _parse_volume(raw: str) -> float:
    try:
        volume = float(raw)
    except ValueError as e:
        raise argparse.ArgumentTypeError(
            "音量は 0 から 2 の数値で指定してください"
        ) from e
    if not 0.0 <= volume <= 2.0:
        raise argparse.ArgumentTypeError(
            "音量は 0 から 2 の範囲で指定してください (0%-200%)"
        )
    return volume


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
    table = []
    for u in users:
        table.append(
            [
                u.get("h", ""),
                u.get("name") or "(名前未設定)",
                f"{float(u.get('volume', 1.0)):.2f}",
            ]
        )
    print_table(table, ["hash", "name", "volume"])


def cmd_volume(args):
    result = _post({"command": "VOLUME", "h": args.hash, "volume": args.volume})
    if result.get("ok"):
        print(f"VOLUME 設定完了: {args.hash!r} -> {args.volume:.2f}")
    else:
        print(f"失敗: {result}", file=sys.stderr)
        sys.exit(1)


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

    # volume
    p_volume = sub.add_parser(
        "volume", help="指定したユーザーの音量を 0%-200% の範囲で設定する"
    )
    p_volume.add_argument("hash", help="ユーザーハッシュ (users コマンドで確認可)")
    p_volume.add_argument("volume", type=_parse_volume, help="音量 (0-2, 0%-200%)")
    p_volume.set_defaults(func=cmd_volume)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
