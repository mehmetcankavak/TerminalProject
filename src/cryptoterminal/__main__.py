import asyncio

from .app import CryptoTerminal


def main() -> None:
    terminal = CryptoTerminal()
    asyncio.run(terminal.start())


if __name__ == "__main__":
    main()
