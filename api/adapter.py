from enum import StrEnum, auto
from .rtc import send_raw_message, active_sessions, handler


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


async def send_message(h: str, command: HostCommand, payload: dict):
    await send_raw_message(h, {"command": command.value.upper(), **payload})


async def send_message_all(command: HostCommand, payload: dict):
    for h in list(active_sessions.keys()):
        await send_message(h, command, payload)


async def send_message_others(sender_h: str, command: HostCommand, payload: dict):
    for h in list(active_sessions.keys()):
        if h != sender_h:
            await send_message(h, command, payload)


def on_message(func):
    handler["on_message"] = func
    return func


def on_join(func):
    handler["on_join"] = func
    return func


def on_leave(func):
    handler["on_leave"] = func
    return func
