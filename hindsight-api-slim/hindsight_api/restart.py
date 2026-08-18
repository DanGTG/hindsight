"""Opt-in, process-scoped restart support for supervised Hindsight servers."""

import asyncio
import logging
import os
import signal
from uuid import uuid4

logger = logging.getLogger(__name__)


class RestartController:
    """Schedule one graceful termination after the HTTP response has drained."""

    def __init__(self, *, enabled: bool, delay_seconds: float) -> None:
        self.enabled = enabled
        self.delay_seconds = delay_seconds
        self.instance_id = str(uuid4())
        self._restart_task: asyncio.Task[None] | None = None

    @property
    def restart_pending(self) -> bool:
        return self._restart_task is not None and not self._restart_task.done()

    def schedule_restart(self) -> bool:
        """Schedule SIGTERM for this process, returning false if already scheduled."""
        if self.restart_pending:
            return False

        self._restart_task = asyncio.create_task(self._terminate_after_delay())
        return True

    async def _terminate_after_delay(self) -> None:
        await asyncio.sleep(self.delay_seconds)
        logger.warning("Restart requested: gracefully terminating Hindsight process %s", os.getpid())
        os.kill(os.getpid(), signal.SIGTERM)
