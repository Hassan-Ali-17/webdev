"""WSGI runner with eventlet + background simulation ticker."""

from __future__ import annotations

import os

import eventlet

eventlet.monkey_patch()

from app import create_app, spawn_simulation_loop  # noqa: E402


def main():
    port = int(os.environ.get("PORT", "5000"))
    app, socketio, sim = create_app()
    spawn_simulation_loop(app, sim, socketio)
    socketio.run(app, host="0.0.0.0", port=port, use_reloader=False, log_output=True)


if __name__ == "__main__":
    main()
