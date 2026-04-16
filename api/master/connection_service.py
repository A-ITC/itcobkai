from .connections import (
    Connection,
    LastUpdated,
    calculate_connections,
    connections_to_islands,
)
from .grid import Position, PreparedMap
from ..utils.schema import Move


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

    def last_updated(
        self,
        user_positions: dict[str, Position],
        last_moves: dict[str, Position],
    ) -> LastUpdated:
        current_connections = calculate_connections(
            user_positions, self.island_ids, self.area
        )

        connects = list(current_connections - self.last_connections)
        disconnects = list(self.last_connections - current_connections)

        self.last_connections = current_connections
        moves = [Move(h=h, x=pos[0], y=pos[1]) for h, pos in last_moves.items()]
        last_moves.clear()

        return LastUpdated(moves=moves, connects=connects, disconnects=disconnects)


connection_service = ConnectionService()
