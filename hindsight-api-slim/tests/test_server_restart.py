import asyncio
import signal
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from hindsight_api.api import create_app
from hindsight_api.restart import RestartController


@pytest.mark.asyncio
async def test_restart_controller_signals_only_its_own_process():
    controller = RestartController(enabled=True, delay_seconds=0)

    with (
        patch("hindsight_api.restart.os.getpid", return_value=4321),
        patch("hindsight_api.restart.os.kill") as kill,
    ):
        assert controller.schedule_restart() is True
        assert controller.schedule_restart() is False
        await asyncio.sleep(0)
        await asyncio.sleep(0)

    kill.assert_called_once_with(4321, signal.SIGTERM)


@pytest.mark.asyncio
async def test_restart_endpoint_returns_before_scheduling_shutdown():
    memory = MagicMock()
    memory._authenticate_tenant = AsyncMock(return_value="public")
    app = create_app(memory, initialize_memory=False)
    controller = app.state.restart_controller
    controller.enabled = True

    with patch.object(controller, "schedule_restart", return_value=True) as schedule_restart:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/v1/default/admin/restart")

    assert response.status_code == 202
    assert response.json() == {
        "accepted": True,
        "instance_id": controller.instance_id,
        "delay_seconds": controller.delay_seconds,
    }
    schedule_restart.assert_called_once_with()
    memory._authenticate_tenant.assert_awaited_once()


@pytest.mark.asyncio
async def test_restart_capability_and_instance_id_are_exposed_but_endpoint_is_hidden_by_default():
    memory = MagicMock()
    app = create_app(memory, initialize_memory=False)
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        version_response = await client.get("/version")
        restart_response = await client.post("/v1/default/admin/restart")

    assert version_response.status_code == 200
    version = version_response.json()
    assert version["instance_id"] == app.state.restart_controller.instance_id
    assert version["features"]["server_restart"] is False
    assert restart_response.status_code == 404
    assert "disabled" in restart_response.json()["detail"].lower()
