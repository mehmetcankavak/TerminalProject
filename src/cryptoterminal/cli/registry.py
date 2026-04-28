from __future__ import annotations

from typing import Any, Callable, Coroutine

from .parser import ParsedCommand

Handler = Callable[..., Coroutine[Any, Any, None]]


class CommandRegistry:
    def __init__(self) -> None:
        self._commands: dict[str, Handler] = {}
        self._help: dict[str, str] = {}

    def register(self, name: str, handler: Handler, usage: str = "") -> None:
        self._commands[name.lower()] = handler
        if usage:
            self._help[name.lower()] = usage

    def get(self, name: str) -> Handler | None:
        return self._commands.get(name.lower())

    def all_commands(self) -> dict[str, str]:
        return {k: self._help.get(k, "") for k in sorted(self._commands.keys())}

    async def execute(self, parsed: ParsedCommand, cmd_panel) -> None:
        handler = self.get(parsed.command)
        if handler is None:
            cmd_panel.log_error(
                f"Unknown command: '{parsed.command}'. Type 'help' for commands."
            )
            return
        try:
            await handler(parsed, cmd_panel)
        except Exception as e:
            cmd_panel.log_error(f"Command error: {e}")
