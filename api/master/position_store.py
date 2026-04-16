from random import choice
from .grid import Position, PreparedMap
from ..utils.schema import MapMeta, Move


class PositionStore:
    def __init__(self):
        self.reset()

    def initialize(self, prepared: PreparedMap):
        self.width = prepared.width
        self.height = prepared.height
        self.noentry = prepared.noentry
        self.walkable_cells = list(prepared.walkable_cells)
        self.user_positions: dict[str, Position] = {}
        self.last_moves: dict[str, Position] = {}
        self._map_meta = prepared.meta

    def reset(self):
        self.width: int = 0
        self.height: int = 0
        self.noentry: list[list[bool]] = []
        self.walkable_cells: list[Position] = []
        self.user_positions: dict[str, Position] = {}
        self.last_moves: dict[str, Position] = {}
        self._map_meta: MapMeta | None = None

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
        if 0 <= x < self.width and 0 <= y < self.height and not self.noentry[y][x]:
            if self.user_positions.get(h) != (x, y):
                self.user_positions[h] = (x, y)
                self.last_moves[h] = (x, y)
                return True
        return False

    def get_map_meta(self) -> MapMeta:
        if self._map_meta is None:
            raise RuntimeError("map is not initialized")
        return self._map_meta

    def get_position(self, h: str) -> Position | None:
        return self.user_positions.get(h)

    def get_all_positions(self) -> dict[str, Position]:
        return dict(self.user_positions)

    def list_user_ids(self) -> list[str]:
        return list(self.user_positions.keys())


position_store = PositionStore()
