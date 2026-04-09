from json import load
from random import choice
from logging import getLogger
from dataclasses import dataclass, replace
from ..utils.schema import MapMeta, Move
from ..utils.config import MAPS_JSON

logger = getLogger(__name__)


@dataclass
class MapRaw:
    red: str  # area (islands)
    black: str  # noentry


type Position = tuple[int, int]
type Connection = tuple[str, str]


@dataclass
class LastUpdated:
    moves: list[Move]
    connects: list[Connection]
    disconnects: list[Connection]


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
        self._meta: MapMeta | None = None

    def load_map(self, map_raw: MapRaw, meta: MapMeta):
        with open(MAPS_JSON) as f:
            data = load(f)
        maps = data.get("maps", {})
        if maps:
            map_name, map_data = next(iter(maps.items()))
            meta = MapMeta(
                name=map_name,
                top=map_data.get("top", ""),
                bottom=map_data.get("bottom", ""),
            )
            self.init(MapRaw(red=map_data["red"], black=map_data["black"]), meta)
            logger.info(f"map initialized: {map_name}")

    def __bool__(self) -> bool:
        return self.map_raw is not None

    def init(self, map_raw: MapRaw, meta: MapMeta):
        """マップデータからマッパーを初期化する（NEWMAP 時にも呼び出し可能）"""
        self.map_raw = map_raw

        # グリッドのパース
        def parse_grid(raw: str) -> list[list[bool]]:
            return [[char == "1" for char in row] for row in raw.split(",")]

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

        # 島のラベリング
        self.island_ids = [[0 for _ in range(self.width)] for _ in range(self.height)]
        self._label_islands()

        # 状態管理のリセット
        self.user_positions = {}
        self.last_connections = set()
        self.last_moves = {}
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

    def _label_islands(self):
        island_count = 0
        visited = [[False for _ in range(self.width)] for _ in range(self.height)]

        for y in range(self.height):
            for x in range(self.width):
                if self.area[y][x] and not visited[y][x]:
                    island_count += 1
                    stack = [(x, y)]
                    visited[y][x] = True

                    while stack:
                        cx, cy = stack.pop()
                        self.island_ids[cy][cx] = island_count

                        for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                            nx, ny = cx + dx, cy + dy
                            if (
                                0 <= nx < self.width
                                and 0 <= ny < self.height
                                and self.area[ny][nx]
                                and not visited[ny][nx]
                            ):
                                visited[ny][nx] = True
                                stack.append((nx, ny))

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

    def move(self, h: str, x: int, y: int):
        if 0 <= x < self.width and 0 <= y < self.height and not self.noentry[y][x]:
            self.user_positions[h] = (x, y)
            self.last_moves[h] = (x, y)

    def get_map_meta(self) -> MapMeta:
        assert self._meta is not None, "MapMeta is not initialized"
        return self._meta

    def last_updated(self) -> LastUpdated:
        current_connections = self._calculate_current_connections()

        connects = list(current_connections - self.last_connections)
        disconnects = list(self.last_connections - current_connections)

        self.last_connections = current_connections
        moves = [Move(h=h, x=pos[0], y=pos[1]) for h, pos in self.last_moves.items()]
        self.last_moves.clear()

        return LastUpdated(moves=moves, connects=connects, disconnects=disconnects)

    def _calculate_current_connections(self) -> set[Connection]:
        user_list = list(self.user_positions.items())
        adj: dict[str, list[str]] = {u_id: [] for u_id, _ in user_list}

        # 1. 直接的な接続の抽出
        for i in range(len(user_list)):
            for j in range(i + 1, len(user_list)):
                u1, p1 = user_list[i]
                u2, p2 = user_list[j]

                island1 = self.island_ids[p1[1]][p1[0]]
                island2 = self.island_ids[p2[1]][p2[0]]

                is_connected = False
                if island1 > 0 and island1 == island2:
                    is_connected = True
                elif not self.area[p1[1]][p1[0]] or not self.area[p2[1]][p2[0]]:
                    if abs(p1[0] - p2[0]) <= 1 and abs(p1[1] - p2[1]) <= 1:
                        is_connected = True

                if is_connected:
                    adj[u1].append(u2)
                    adj[u2].append(u1)

        # 2. 連結成分の抽出
        connections: set[Connection] = set()
        visited: set[str] = set()

        for start_id, _ in user_list:
            if start_id in visited:
                continue

            component: list[str] = []
            stack = [start_id]
            visited.add(start_id)

            while stack:
                u = stack.pop()
                component.append(u)
                for neighbor in adj[u]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        stack.append(neighbor)

            # ペア生成
            for i in range(len(component)):
                for j in range(i + 1, len(component)):
                    u_a, u_b = component[i], component[j]
                    pair = (u_a, u_b) if u_a < u_b else (u_b, u_a)
                    connections.add(pair)

        return connections


mapper = Mapper()


def connections_to_islands(connections: "set[Connection]") -> list[list[str]]:
    """接続ペアの集合から島グループ（連結成分）を計算する"""
    adj: dict[str, set[str]] = {}
    for u_a, u_b in connections:
        adj.setdefault(u_a, set()).add(u_b)
        adj.setdefault(u_b, set()).add(u_a)

    visited: set[str] = set()
    islands: list[list[str]] = []
    for user in adj:
        if user in visited:
            continue
        component: list[str] = []
        stack = [user]
        visited.add(user)
        while stack:
            u = stack.pop()
            component.append(u)
            for neighbor in adj[u]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        islands.append(component)
    return islands
