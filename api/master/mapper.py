from random import choice
from logging import getLogger
from dataclasses import replace
from ..utils.schema import MapMeta, Move
from .grid import MapRaw, Position, parse_grid, label_islands
from .connections import (
    Connection,
    LastUpdated,
    calculate_connections,
    connections_to_islands,
)

logger = getLogger(__name__)


class Mapper:
    def __init__(self):
        self.map_raw: MapRaw | None = None
        self.area: list[list[bool]] = []
        self.noentry: list[list[bool]] = []
        self.height: int = 0
        self.width: int = 0
        self.walkable_cells: list[Position] = []
        self.island_ids: list[list[int]] = []
        self.user_positions: dict[str, Position] = {}
        self.last_connections: set[Connection] = set()
        self.last_moves: dict[str, Position] = {}
        self._cached_islands: list[list[str]] = []
        self._meta: MapMeta | None = None

    def __bool__(self) -> bool:
        return self.map_raw is not None

    def init(self, map_raw: MapRaw, meta: MapMeta):
        """マップデータからマッパーを初期化する（NEWMAP 時にも呼び出し可能）"""
        self.map_raw = map_raw

        self.area = parse_grid(map_raw.red)
        self.noentry = parse_grid(map_raw.black)
        self.height = len(self.area)
        self.width = len(self.area[0]) if self.height > 0 else 0

        # 歩行可能エリアの事前計算
        self.walkable_cells = []
        for y in range(self.height):
            for x in range(self.width):
                if not self.noentry[y][x]:
                    self.walkable_cells.append((x, y))

        self.island_ids = label_islands(self.area, self.width, self.height)

        # 状態管理のリセット
        self.user_positions = {}
        self.last_connections = set()
        self.last_moves = {}
        self._cached_islands = []
        self._meta = replace(
            meta,
            width=self.width,
            height=self.height,
            red=map_raw.red,
            black=map_raw.black,
        )

    def reset(self):
        """マッパーを未初期化状態に戻す"""
        self.__init__()

    def get_raw(self) -> MapRaw:
        assert self.map_raw is not None, "Mapper is not initialized"
        return self.map_raw

    def new_user(self, h: str) -> Move:
        if not self.walkable_cells:
            raise ValueError("配置可能なエリアがありません。")

        x, y = choice(self.walkable_cells)
        self.user_positions[h] = (x, y)
        self.last_moves[h] = (x, y)
        return Move(h=h, x=x, y=y)

    def remove_user(self, h: str):
        self.user_positions.pop(h, None)
        self.last_moves.pop(h, None)

    def move(self, h: str, x: int, y: int) -> bool:
        """ユーザーを(x, y)に移動する。位置が実際に変わった場合 True を返す。"""
        if 0 <= x < self.width and 0 <= y < self.height and not self.noentry[y][x]:
            if self.user_positions.get(h) != (x, y):
                self.user_positions[h] = (x, y)
                self.last_moves[h] = (x, y)
                return True
        return False

    def get_map_meta(self) -> MapMeta:
        assert self._meta is not None, "MapMeta is not initialized"
        return self._meta

    def get_current_islands(self) -> list[list[str]]:
        """現在のユーザー位置から島グループを計算して返す。
        接続状態が変化していない場合はキャッシュを返し、計算コストを抑える。
        """
        current_connections = calculate_connections(
            self.user_positions, self.island_ids, self.area
        )
        if current_connections == self.last_connections:
            return self._cached_islands
        self.last_connections = current_connections
        self._cached_islands = connections_to_islands(current_connections)
        return self._cached_islands

    def last_updated(self) -> LastUpdated:
        current_connections = calculate_connections(
            self.user_positions, self.island_ids, self.area
        )

        connects = list(current_connections - self.last_connections)
        disconnects = list(self.last_connections - current_connections)

        self.last_connections = current_connections
        moves = [Move(h=h, x=pos[0], y=pos[1]) for h, pos in self.last_moves.items()]
        self.last_moves.clear()

        return LastUpdated(moves=moves, connects=connects, disconnects=disconnects)


mapper = Mapper()
