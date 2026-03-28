from enum import StrEnum, auto
from .user import UserStore
from .rtc import send_raw_message, active_sessions, handler

us = UserStore()


class HostCommand(StrEnum):
    ALERT = auto()
    MESSAGE = auto()
    JOIN = auto()
    MOVE = auto()
    UPDATE = auto()
    LEAVE = auto()
    INIT = auto()
    NEWMAP = auto()
    MUTE = auto()


class GuestCommand(StrEnum):
    MUTE = auto()
    MOVE = auto()
    UPDATE = auto()


async def send_message(h: str, command: HostCommand, payload: dict):
    await send_raw_message(h, {"command": command.value.upper(), **payload})


async def send_message_all(command: HostCommand, payload: dict):
    for h in list(active_sessions.keys()):
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
