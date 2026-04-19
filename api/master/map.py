from json import load
from ..utils.config import MAPS_JSON
from ..utils.schema import MapMeta


class MapRepository:
    def load_map(self, name: str | None = None) -> MapMeta:
        """maps.json からマップを読み込む。name 未指定時は先頭のマップを返す。"""
        with open(MAPS_JSON) as f:
            data = load(f)

        maps = data.get("maps", {})
        if not maps:
            raise RuntimeError(
                "maps.json にマップが定義されていません。アプリを起動できません。"
            )

        if name is None:
            map_name, map_data = next(iter(maps.items()))
        else:
            if name not in maps:
                raise KeyError(f"Map '{name}' not found in maps.json")
            map_name = name
            map_data = maps[name]

        return MapMeta(
            name=map_name,
            top=map_data.get("top", ""),
            bottom=map_data.get("bottom", ""),
            red=map_data["red"],
            black=map_data["black"],
        )


map_repository = MapRepository()
