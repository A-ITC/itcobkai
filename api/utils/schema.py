from dataclasses import dataclass


@dataclass
class Move:
    h: str
    x: int
    y: int


@dataclass
class MapMeta:
    """フロントに渡すためのマップ情報"""

    name: str
    top: str
    bottom: str
    width: int = 0
    height: int = 0
    red: str = ""
    black: str = ""
