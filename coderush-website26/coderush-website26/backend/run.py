"""WSGI runner with gevent + background simulation ticker."""
from __future__ import annotations
import os
from gevent import monkey
monkey.patch_all()

from app import create_app, spawn_simulation_loop  # noqa: E402


def main():
    port = int(os.environ.get("PORT", "5000"))
    app, socketio, sim = create_app()
    spawn_simulation_loop(app, sim, socketio)
    socketio.run(app, host="0.0.0.0", port=port, use_reloader=False, log_output=True)


if __name__ == "__main__":
    main()