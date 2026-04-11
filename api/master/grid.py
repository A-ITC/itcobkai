from dataclasses import dataclass


@dataclass
class MapRaw:
    red: str  # area (islands)
    black: str  # noentry


type Position = tuple[int, int]


def parse_grid(raw: str) -> list[list[bool]]:
    """CSV形式の文字列をboolグリッドに変換する"""
    return [[char == "1" for char in row] for row in raw.split(",")]


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
