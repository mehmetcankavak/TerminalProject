from __future__ import annotations

import json
from pathlib import Path

_ALIAS_FILE = Path("config/aliases.json")

_data: dict = {"aliases": {}, "bindings": {}}
_loaded = False


def _load() -> None:
    global _data, _loaded
    if _loaded:
        return
    if _ALIAS_FILE.exists():
        try:
            _data = json.loads(_ALIAS_FILE.read_text())
        except Exception:
            _data = {"aliases": {}, "bindings": {}}
    _loaded = True


def _save() -> None:
    _ALIAS_FILE.parent.mkdir(parents=True, exist_ok=True)
    _ALIAS_FILE.write_text(json.dumps(_data, indent=2))


# Built-in kısa komutlar — kullanıcı aliases.json'ı override edemez
_BUILTINS: dict[str, str] = {
    "l":  "long",
    "s":  "short",
    "c":  "close",
    "cl": "close",
    "h":  "hedge",
    "b":  "buy",
    "sl": "sl",   # zaten komut, alias değil ama tutarlılık için
    "tp": "tp",
}


class AliasManager:
    @staticmethod
    def expand(text: str) -> str:
        _load()
        first = text.strip().split()[0].lower()
        # Önce user alias'larına bak, yoksa built-in kısaltmalara bak
        alias_cmd = _data["aliases"].get(first) or _BUILTINS.get(first)
        if alias_cmd:
            rest = text.strip()[len(first):].strip()
            return alias_cmd + (" " + rest if rest else "")
        return text

    @staticmethod
    def set_alias(name: str, command: str) -> None:
        _load()
        _data["aliases"][name.lower()] = command
        _save()

    @staticmethod
    def remove_alias(name: str) -> bool:
        _load()
        if name.lower() in _data["aliases"]:
            del _data["aliases"][name.lower()]
            _save()
            return True
        return False

    @staticmethod
    def list_aliases() -> dict[str, str]:
        _load()
        return dict(_data["aliases"])

    @staticmethod
    def set_binding(key: str, command: str) -> None:
        _load()
        _data["bindings"][key.lower()] = command
        _save()

    @staticmethod
    def remove_binding(key: str) -> bool:
        _load()
        if key.lower() in _data["bindings"]:
            del _data["bindings"][key.lower()]
            _save()
            return True
        return False

    @staticmethod
    def list_bindings() -> dict[str, str]:
        _load()
        return dict(_data["bindings"])

    @staticmethod
    def get_binding(key: str) -> str | None:
        _load()
        return _data["bindings"].get(key.lower())
