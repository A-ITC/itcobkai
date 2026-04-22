from .connections import (
    calculate_connections,
)
from .grid import Position, PreparedMap


class ConnectionService:
    def __init__(self):
        self.reset()

    def initialize(self, prepared: PreparedMap):
        self.area = prepared.area
        self.island_ids = prepared.island_ids
        self._cached_islands: list[list[str]] = []

    def reset(self):
        self.area: list[list[bool]] = []
        self.island_ids: list[list[int]] = []
        self._cached_islands: list[list[str]] = []

    def get_current_islands(
        self, user_positions: dict[str, Position]
    ) -> list[list[str]]:
        current_islands = calculate_connections(
            user_positions, self.island_ids, self.area
        )
        if current_islands == self._cached_islands:
            return self._cached_islands

        self._cached_islands = current_islands
        return self._cached_islands


connection_service = ConnectionService()
