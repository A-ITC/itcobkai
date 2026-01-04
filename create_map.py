"""
Tiled形式のTMXマップを解析・レンダリングし、S3にアップロードするスクリプト
上下レイヤーをそれぞれ合成してPNG画像として保存し、そのハッシュ値をdata.jsonに記録します。
赤・黒フラグレイヤーは2値マスクとしてdata.jsonに保存します。

上下レイヤーの命名規則例:
- 上層: t_、top、上
- 下層: b_、bottom、下

赤・黒フラグレイヤーの命名規則例:
- 赤: 赤、red
- 黒: 黒、black
"""

import cv2
import numpy as np
import gzip
import zlib
from os import environ, makedirs
from sys import argv
from json import dump, dumps, loads
from boto3 import client
from dotenv import load_dotenv
from struct import unpack
from base64 import b64decode
from hashlib import sha256
from pathlib import Path
from xml.etree import ElementTree
from dataclasses import dataclass

load_dotenv()

FLIPPED_HORIZONTALLY_FLAG = 0x80000000
FLIPPED_VERTICALLY_FLAG = 0x40000000
FLIPPED_DIAGONALLY_FLAG = 0x20000000
U32_MASK = 0xFFFFFFFF
GID_MASK = 0x1FFFFFFF  # 下位29ビットのみ（正のマスク）


@dataclass(frozen=True)
class TileFlags:
    """タイルの反転フラグ"""

    h_flip: bool
    v_flip: bool
    d_flip: bool


class GID:
    """GID（Global ID）を扱うクラス"""

    def __init__(self, raw_gid: int):
        # 常に 32bit として扱う（符号問題を回避）
        self.raw = int(raw_gid) & U32_MASK
        self.id = self.raw & GID_MASK
        self.flags = TileFlags(
            h_flip=bool(self.raw & FLIPPED_HORIZONTALLY_FLAG),
            v_flip=bool(self.raw & FLIPPED_VERTICALLY_FLAG),
            d_flip=bool(self.raw & FLIPPED_DIAGONALLY_FLAG),
        )

    def is_empty(self) -> bool:
        """空タイル（GID=0）かどうか"""
        return self.id == 0

    @staticmethod
    def decode_data(
        text: str, encoding: str | None, compression: str | None
    ) -> list[int]:
        """TMXのdataノードからGIDリストをデコード"""
        if not text or not text.strip():
            return []

        if encoding == "base64":
            data = b64decode(text.strip())
            if compression == "gzip":
                data = gzip.decompress(data)
            elif compression == "zlib":
                data = zlib.decompress(data)
            unpacked = unpack(f"<{len(data) // 4}I", data)
            return [int(v) & U32_MASK for v in unpacked]

        if encoding == "csv":
            return [int(i) & U32_MASK for i in text.split(",") if i.strip()]

        return []


class Tileset:
    """タイルセット（画像アトラス）"""

    def __init__(self, node: ElementTree.Element, tmx_dir: Path):
        self.firstgid = int(node.get("firstgid", 0))
        source_tsx = node.get("source")

        if source_tsx:
            tsx_path = (tmx_dir / source_tsx).resolve()
            node = ElementTree.parse(tsx_path).getroot()
            self.base_path = tsx_path.parent
        else:
            self.base_path = tmx_dir

        self.tilewidth = int(node.get("tilewidth"))
        self.tileheight = int(node.get("tileheight"))
        self.spacing = int(node.get("spacing", 0))
        self.margin = int(node.get("margin", 0))
        self.columns = int(node.get("columns", 0))

        img_node = node.find("image")
        if img_node is None:
            raise ValueError("Tileset image not found.")

        img_path = (self.base_path / img_node.get("source")).resolve()
        self.atlas = self._load_image(img_path)

        # タイル数を計算して範囲チェックに使う
        atlas_h, atlas_w = self.atlas.shape[:2]
        if self.columns <= 0:
            self.columns = max(1, atlas_w // self.tilewidth)
        rows = max(
            1,
            (atlas_h - self.margin + self.spacing) // (self.tileheight + self.spacing),
        )
        self.tile_count = self.columns * rows

    def _load_image(self, path: Path) -> np.ndarray:
        """画像ファイルをBGRAで読み込む"""
        img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
        if img is None:
            raise FileNotFoundError(f"Image not found: {path}")
        if img.ndim == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
        if img.shape[2] == 3:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
        return img

    def contains_gid(self, gid: int) -> bool:
        """このタイルセットが指定GIDを含むか"""
        local = int(gid) - self.firstgid
        return 0 <= local < self.tile_count

    def get_tile(self, local_id: int, flags: TileFlags) -> np.ndarray:
        """ローカルIDとフラグから、変換済みタイル画像を取得"""
        if local_id < 0 or local_id >= self.tile_count:
            raise IndexError(
                f"local_id out of range: {local_id} (tile_count={self.tile_count})"
            )
        col = local_id % self.columns
        row = local_id // self.columns
        x = self.margin + col * (self.tilewidth + self.spacing)
        y = self.margin + row * (self.tileheight + self.spacing)

        tile = self.atlas[y : y + self.tileheight, x : x + self.tilewidth].copy()
        return self._apply_transformations(tile, flags)

    @staticmethod
    def _apply_transformations(tile: np.ndarray, flags: TileFlags) -> np.ndarray:
        """タイルに反転変換を適用"""
        if flags.d_flip:
            tile = cv2.flip(cv2.transpose(tile), 1)
        if flags.h_flip:
            tile = cv2.flip(tile, 1)
        if flags.v_flip:
            tile = cv2.flip(tile, 0)
        return tile


class Layer:
    """タイルレイヤー"""

    def __init__(self, node: ElementTree.Element):
        self.name = node.get("name", "")
        self.visible = node.get("visible", "1") == "1"
        self.width = int(node.get("width", 0))
        self.height = int(node.get("height", 0))

        data_node = node.find("data")
        if data_node is not None:
            gids = GID.decode_data(
                data_node.text, data_node.get("encoding"), data_node.get("compression")
            )
            # 期待される要素数と合わない場合は不足分を 0 で埋め、過剰なら切り詰める
            expected = self.width * self.height
            if len(gids) < expected:
                gids = gids + [0] * (expected - len(gids))
            elif len(gids) > expected:
                gids = gids[:expected]
            self.data = np.array(gids, dtype=np.uint32).reshape(
                (self.height, self.width)
            )
        else:
            self.data = np.zeros((self.height, self.width), dtype=np.uint32)

    def get_binary_mask(self) -> list[list[int]]:
        """GID > 0 のマスク（0/1）を取得"""
        mask = (self.data > 0).astype(int).tolist()
        return ",".join(["".join(str(xx) for xx in x) for x in mask])


class Tiled:
    """Tiled マップ全体"""

    def __init__(self, filepath: str):
        self.path = Path(filepath)
        tree = ElementTree.parse(self.path)
        root = tree.getroot()

        self.width = int(root.get("width"))
        self.height = int(root.get("height"))
        self.tilewidth = int(root.get("tilewidth"))
        self.tileheight = int(root.get("tileheight"))
        self.background_color = root.get("backgroundcolor")

        self.tilesets = [
            Tileset(ts, self.path.parent) for ts in root.findall(".//tileset")
        ]
        # GIDの降順でソートして検索を効率化
        self.tilesets.sort(key=lambda x: x.firstgid, reverse=True)

        self.layers = [Layer(n) for n in root if n.tag == "layer"]
        self._tile_cache: dict[int, np.ndarray] = {}

    def get_tile_image(self, raw_gid: int) -> np.ndarray | None:
        """GIDから対応するタイル画像を取得（キャッシュあり）"""
        gid = GID(raw_gid)
        if gid.is_empty():
            return None
        if raw_gid in self._tile_cache:
            return self._tile_cache[raw_gid]

        ts = next((t for t in self.tilesets if t.contains_gid(gid.id)), None)
        if not ts:
            return None

        tile = ts.get_tile(gid.id - ts.firstgid, gid.flags)
        self._tile_cache[raw_gid] = tile
        return tile

    def find_layers_by_prefix(self, *prefixes: str) -> list[Layer]:
        """名前の先頭が指定のプレフィックスに一致する可視レイヤーを取得"""
        results = []
        for layer in self.layers:
            if not layer.visible:
                continue
            name_lower = layer.name.lower()
            if any(name_lower.startswith(p) for p in prefixes):
                results.append(layer)
        return results

    def find_layer_by_keyword(self, *keywords: str) -> Layer | None:
        """名前に指定のキーワードを含むレイヤーを取得"""
        for layer in self.layers:
            name_lower = layer.name.lower()
            if any(kw in name_lower for kw in keywords):
                return layer
        return None


class Renderer:
    """マップレンダラー"""

    @staticmethod
    def render(tmx: Tiled, layers: list[Layer]) -> np.ndarray:
        """指定レイヤーをレンダリング"""
        canvas_h = tmx.height * tmx.tileheight
        canvas_w = tmx.width * tmx.tilewidth

        surface = Renderer._create_background(canvas_h, canvas_w, tmx.background_color)

        for layer in layers:
            if not layer.visible:
                continue
            Renderer._render_layer(surface, layer, tmx)

        return surface

    @staticmethod
    def _create_background(height: int, width: int, bg_color: str | None) -> np.ndarray:
        """背景キャンバスを作成"""
        surface = np.zeros((height, width, 4), dtype=np.uint8)
        if bg_color:
            c = bg_color.lstrip("#")
            bg = [int(c[4:6], 16), int(c[2:4], 16), int(c[0:2], 16), 255]
            surface[:] = bg
        return surface

    @staticmethod
    def _render_layer(canvas: np.ndarray, layer: Layer, tmx: Tiled):
        """レイヤーをキャンバスに描画"""
        for y in range(layer.height):
            for x in range(layer.width):
                raw_gid = layer.data[y, x]
                tile = tmx.get_tile_image(raw_gid)
                if tile is None:
                    continue

                py, px = y * tmx.tileheight, x * tmx.tilewidth
                Renderer._overlay(canvas, tile, py, px)

    @staticmethod
    def _overlay(canvas: np.ndarray, tile: np.ndarray, y: int, x: int):
        """タイルをアルファブレンディングで合成"""
        h, w = tile.shape[:2]
        roi = canvas[y : y + h, x : x + w]

        if tile.shape[2] == 4:
            alpha = tile[:, :, 3:4].astype(np.float32) / 255.0
            blended = (roi[:, :, :3] * (1 - alpha) + tile[:, :, :3] * alpha).astype(
                np.uint8
            )
            canvas[y : y + h, x : x + w, :3] = blended
            canvas[y : y + h, x : x + w, 3] = np.maximum(roi[:, :, 3], tile[:, :, 3])
        else:
            canvas[y : y + h, x : x + w, :3] = tile[:, :, :3]
            canvas[y : y + h, x : x + w, 3] = 255


if __name__ == "__main__":
    if len(argv) > 1:
        TMX_FILE = argv[1]
    else:
        msg = "TMXファイルを指定してください"
        raise ValueError(msg)

    S3_BUCKET = environ.get("VITE_S3_BUCKET")
    DATA_JSON = environ.get("DATA_JSON")

    s3 = client("s3")
    makedirs("data/map", exist_ok=True)

    try:
        response = s3.get_object(Bucket=S3_BUCKET, Key=DATA_JSON)
        data = loads(response["Body"].read().decode("utf-8"))
    except s3.exceptions.NoSuchKey:
        data = {"_map": {}}

    tmx = Tiled(TMX_FILE)
    result = {"red": "", "black": ""}

    # フラグレイヤーの抽出
    if red_layer := tmx.find_layer_by_keyword("赤", "red"):
        result["red"] = red_layer.get_binary_mask()
    if black_layer := tmx.find_layer_by_keyword("黒", "black"):
        result["black"] = black_layer.get_binary_mask()

    # レンダリング対象のレイヤー振り分け
    layer_groups = {
        "top": tmx.find_layers_by_prefix("t_", "top", "上"),
        "bottom": tmx.find_layers_by_prefix("b_", "bottom", "下"),
    }
    for key, target_layers in layer_groups.items():
        if not target_layers:
            continue
        img = Renderer.render(tmx, target_layers)
        h = sha256(img).hexdigest()
        result[key] = h
        if not (png := Path(f"data/map/{h}.png")).exists():
            _, buf = cv2.imencode(".png", img)
            s3.put_object(
                Bucket=S3_BUCKET,
                Key=png.as_posix(),
                Body=buf.tobytes(),
                ContentType="image/png",
            )
            with png.open("wb") as f:
                f.write(buf.tobytes())

    data["_map"][Path(TMX_FILE).stem] = result
    with Path("data/data.json").open("w", encoding="utf-8") as f:
        dump(data, f, indent=2, ensure_ascii=False)

    s3.put_object(
        Bucket=S3_BUCKET,
        Key=DATA_JSON,
        Body=dumps(data, ensure_ascii=False, indent=4),
        ContentType="application/json",
    )
