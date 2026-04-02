import random
from dataclasses import dataclass


@dataclass
class Move:
    h: str
    x: int
    y: int


@dataclass
class MapRaw:
    red: str  # area (islands)
    black: str  # noentry


# 型エイリアスの定義 (Python 3.12+)
type Position = tuple[int, int]
type Connection = tuple[str, str]


class Mapper:
    def __init__(self, map_raw: MapRaw):
        self.map_raw = map_raw

        # グリッドのパース
        def parse_grid(raw: str) -> list[list[bool]]:
            return [[char == "1" for char in row] for row in raw.split(",")]

        self.area = parse_grid(map_raw.red)
        self.noentry = parse_grid(map_raw.black)
        self.height = len(self.area)
        self.width = len(self.area[0]) if self.height > 0 else 0

        # 歩行可能エリアの事前計算
        self.walkable_cells: list[Position] = []
        for y in range(self.height):
            for x in range(self.width):
                if not self.noentry[y][x]:
                    self.walkable_cells.append((x, y))

        # 島のラベリング
        self.island_ids = [[0 for _ in range(self.width)] for _ in range(self.height)]
        self._label_islands()

        # 状態管理
        self.user_positions: dict[str, Position] = {}
        self.last_connections: set[Connection] = set()
        self.last_moves: dict[str, Position] = {}
        self._meta: dict = {}

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
        return self.map_raw

    def new_user(self, h: str) -> Move:
        if not self.walkable_cells:
            raise ValueError("配置可能なエリアがありません。")

        x, y = random.choice(self.walkable_cells)
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

    def get_map_meta(self) -> dict:
        return {**self._meta, "width": self.width, "height": self.height, "red": self.map_raw.red, "black": self.map_raw.black}

    def last_updated(self):
        current_connections = self._calculate_current_connections()

        connects = list(current_connections - self.last_connections)
        disconnects = list(self.last_connections - current_connections)

        self.last_connections = current_connections
        moves = [Move(h=h, x=pos[0], y=pos[1]) for h, pos in self.last_moves.items()]
        self.last_moves.clear()

        return {"moves": moves, "connects": connects, "disconnects": disconnects}

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


# マッパーのグローバルインスタンス（init_mapper で初期化）
mapper: Mapper | None = None


def init_mapper(map_raw: MapRaw, meta: dict):
    """マップデータからマッパーを初期化する（NEWMAP 時にも呼び出し可能）"""
    global mapper
    m = Mapper(map_raw)
    m._meta = meta
    mapper = m


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
