from .grid import Position
from dataclasses import dataclass
from ..utils.schema import Move


type Connection = tuple[str, str]


@dataclass
class LastUpdated:
    moves: list[Move]
    connects: list[Connection]
    disconnects: list[Connection]


def _build_adjacency(
    user_positions: dict[str, Position],
    island_ids: list[list[int]],
    area: list[list[bool]],
) -> dict[str, list[str]]:
    """ユーザー位置・島ID・エリアグリッドから隣接リストを構築する"""
    user_list = list(user_positions.items())
    adj: dict[str, list[str]] = {u_id: [] for u_id, _ in user_list}

    for i in range(len(user_list)):
        for j in range(i + 1, len(user_list)):
            u1, p1 = user_list[i]
            u2, p2 = user_list[j]

            island1 = island_ids[p1[1]][p1[0]]
            island2 = island_ids[p2[1]][p2[0]]

            is_connected = False
            if island1 > 0 and island1 == island2:
                # 1. 同じ島にいる → 距離不問で接続
                is_connected = True
            elif not area[p1[1]][p1[0]] and not area[p2[1]][p2[0]]:
                # 2. 両方が島の外 → チェビシェフ距離1で接続
                if abs(p1[0] - p2[0]) <= 1 and abs(p1[1] - p2[1]) <= 1:
                    is_connected = True
            # 3. 片方が島の中、片方が島の外 → 接続しない

            if is_connected:
                adj[u1].append(u2)
                adj[u2].append(u1)

    return adj


def calculate_connections(
    user_positions: dict[str, Position],
    island_ids: list[list[int]],
    area: list[list[bool]],
) -> list[list[str]]:
    """ユーザー位置・島ID・エリアグリッドから現在の接続グループを計算する"""
    user_list = list(user_positions.items())
    adj = _build_adjacency(user_positions, island_ids, area)

    visited: set[str] = set()
    islands: list[list[str]] = []

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

        if len(component) > 1:
            islands.append(component)

    return islands


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
