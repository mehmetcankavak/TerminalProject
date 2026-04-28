#!/bin/bash
cd "$(dirname "$0")"
PYTHONPATH=src .venv/bin/python3 -m cryptoterminal.web.runner
