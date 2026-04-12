from enum import StrEnum, auto
from pydantic import BaseModel, Field
from .state import send_raw_message, active_sessions, handler
from ..utils.schema import MapMeta, Move


class HostCommand(StrEnum):
    ALERT = "ALERT"
    JOINED = "JOINED"
    MOVED = "MOVED"
    UPDATED = "UPDATED"
    LEFT = "LEFT"
    INIT = "INIT"
    NEWMAP = "NEWMAP"
    MUTED = "MUTED"


class GuestCommand(StrEnum):
    MUTE = auto()
    MOVE = auto()
    UPDATE = auto()


# ---------------------------------------------------------------------------
# Command payload models
# ---------------------------------------------------------------------------


class Command(BaseModel):
    """Base class for all HostCommand payload models."""


class AlertCommand(Command):
    command: HostCommand = Field(default=HostCommand.ALERT, init=False)
    text: str
    reload: bool = False


class JoinedCommand(Command):
    command: HostCommand = Field(default=HostCommand.JOINED, init=False)
    user: dict


class MovedCommand(Command):
    command: HostCommand = Field(default=HostCommand.MOVED, init=False)
    moves: list[Move]


class UpdatedCommand(Command):
    command: HostCommand = Field(default=HostCommand.UPDATED, init=False)
    user: dict


class LeftCommand(Command):
    command: HostCommand = Field(default=HostCommand.LEFT, init=False)
    h: str


class InitCommand(Command):
    command: HostCommand = Field(default=HostCommand.INIT, init=False)
    users: list[dict]
    map: MapMeta


class NewmapCommand(Command):
    command: HostCommand = Field(default=HostCommand.NEWMAP, init=False)
    map: MapMeta


class MutedCommand(Command):
    command: HostCommand = Field(default=HostCommand.MUTED, init=False)
    h: str
    mute: bool


# ---------------------------------------------------------------------------
# Message sending helpers
# ---------------------------------------------------------------------------


async def send_message(h: str, payload: Command):
    await send_raw_message(h, payload.model_dump())


async def send_message_all(payload: Command):
    for h in list(active_sessions.keys()):
        await send_message(h, payload)


async def send_message_others(sender_h: str, payload: Command):
    for h in list(active_sessions.keys()):
        if h != sender_h:
            await send_message(h, payload)


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
