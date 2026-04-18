from dataclasses import dataclass, replace
from ..utils.schema import MapMeta


type Position = tuple[int, int]


@dataclass
class PreparedMap:
    meta: MapMeta
    area: list[list[bool]]
    noentry: list[list[bool]]
    walkable_cells: list[Position]
    island_ids: list[list[int]]
    width: int
    height: int


def prepare_map(meta: MapMeta) -> PreparedMap:
    """MapMeta からマップの実行時データを構築する"""
    area = [[char == "1" for char in row] for row in meta.red.split(",")]
    noentry = [[char == "1" for char in row] for row in meta.black.split(",")]
    height = len(area)
    width = len(area[0]) if height > 0 else 0

    if any(len(row) != width for row in area) or any(
        len(row) != width for row in noentry
    ):
        raise ValueError("マップデータが不正です: 行ごとの幅が一致していません")

    if len(noentry) != height:
        raise ValueError(
            "マップデータが不正です: red と black の高さが一致していません"
        )

    walkable_cells: list[Position] = []
    for y in range(height):
        for x in range(width):
            if not noentry[y][x]:
                walkable_cells.append((x, y))

    if height == 0 or width == 0 or not walkable_cells:
        raise ValueError(
            f"マップデータが不正です: height={height}, width={width}, walkable={len(walkable_cells)}"
        )

    return PreparedMap(
        meta=replace(meta, width=width, height=height),
        area=area,
        noentry=noentry,
        walkable_cells=walkable_cells,
        island_ids=label_islands(area, width, height),
        width=width,
        height=height,
    )


def label_islands(area: list[list[bool]], width: int, height: int) -> list[list[int]]:
    """フラッドフィルで赤レイヤーの連結成分（島）にIDを付与する"""
    island_ids = [[0 for _ in range(width)] for _ in range(height)]
    island_count = 0
    visited = [[False for _ in range(width)] for _ in range(height)]

    for y in range(height):
        for x in range(width):
            if area[y][x] and not visited[y][x]:
                island_count += 1
                stack = [(x, y)]
                visited[y][x] = True

                while stack:
                    cx, cy = stack.pop()
                    island_ids[cy][cx] = island_count

                    for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                        nx, ny = cx + dx, cy + dy
                        if (
                            0 <= nx < width
                            and 0 <= ny < height
                            and area[ny][nx]
                            and not visited[ny][nx]
                        ):
                            visited[ny][nx] = True
                            stack.append((nx, ny))

    return island_ids
