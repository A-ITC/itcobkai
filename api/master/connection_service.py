from .connections import (
    Connection,
    calculate_connections,
    connections_to_islands,
)
from .grid import Position, PreparedMap


class ConnectionService:
    def __init__(self):
        self.reset()

    def initialize(self, prepared: PreparedMap):
        self.area = prepared.area
        self.island_ids = prepared.island_ids
        self.last_connections: set[Connection] = set()
        self._cached_islands: list[list[str]] = []

    def reset(self):
        self.area: list[list[bool]] = []
        self.island_ids: list[list[int]] = []
        self.last_connections: set[Connection] = set()
        self._cached_islands: list[list[str]] = []

    def get_current_islands(
        self, user_positions: dict[str, Position]
    ) -> list[list[str]]:
        current_connections = calculate_connections(
            user_positions, self.island_ids, self.area
        )
        if current_connections == self.last_connections:
            return self._cached_islands

        self.last_connections = current_connections
        self._cached_islands = connections_to_islands(current_connections)
        return self._cached_islands


connection_service = ConnectionService()
