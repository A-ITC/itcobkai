import dataclasses
from dataclasses import dataclass
from enum import StrEnum, auto
from .rtc import send_raw_message, active_sessions, handler
from ..utils.schema import MapMeta, Move


class HostCommand(StrEnum):
    ALERT = auto()
    MESSAGE = auto()
    JOINED = auto()
    MOVED = auto()
    UPDATED = auto()
    LEFT = auto()
    INIT = auto()
    NEWMAP = auto()
    MUTED = auto()


class GuestCommand(StrEnum):
    MUTE = auto()
    MOVE = auto()
    UPDATE = auto()


# ---------------------------------------------------------------------------
# Command payload dataclasses
# ---------------------------------------------------------------------------


@dataclass
class Command:
    """Base class for all HostCommand payload dataclasses."""


@dataclass
class AlertCommand(Command):
    text: str
    reload: bool = False


@dataclass
class MessageCommand(Command):
    text: str


@dataclass
class JoinedCommand(Command):
    user: dict


@dataclass
class MovedCommand(Command):
    moves: list[Move]


@dataclass
class UpdatedCommand(Command):
    user: dict


@dataclass
class LeftCommand(Command):
    h: str


@dataclass
class InitCommand(Command):
    users: list[dict]
    map: MapMeta


@dataclass
class NewmapCommand(Command):
    map: MapMeta


@dataclass
class MutedCommand(Command):
    h: str
    mute: bool


# ---------------------------------------------------------------------------
# Message sending helpers
# ---------------------------------------------------------------------------


async def send_message(h: str, command: HostCommand, payload: Command):
    await send_raw_message(
        h, {"command": command.value.upper(), **dataclasses.asdict(payload)}
    )


async def send_message_all(command: HostCommand, payload: Command):
    for h in list(active_sessions.keys()):
        await send_message(h, command, payload)


async def send_message_others(sender_h: str, command: HostCommand, payload: Command):
    for h in list(active_sessions.keys()):
        if h != sender_h:
            await send_message(h, command, payload)


# ---------------------------------------------------------------------------
# Handler registration decorators
# ---------------------------------------------------------------------------


def on_message(func):
    handler.on_message = func
    return func


def on_join(func):
    handler.on_join = func
    return func


def on_leave(func):
    handler.on_leave = func
    return func
