import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

WAREHOUSE_HSR = {
    "warehouse_id": "wh-hsr",
    "lat": 12.9116,
    "lng": 77.6389,
    "active_order_count": 0,
    "has_stock": True,
}
WAREHOUSE_INDIRANAGAR = {
    "warehouse_id": "wh-indiranagar",
    "lat": 12.9784,
    "lng": 77.6408,
    "active_order_count": 0,
    "has_stock": True,
}
CUSTOMER_KORAMANGALA = {"lat": 12.9352, "lng": 77.6245}


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_select_warehouse_returns_nearest():
    # HSR (12.9116, 77.6389) is closer to Koramangala than Indiranagar (12.9784, 77.6408)
    res = client.post(
        "/select-warehouse",
        json={
            "delivery_coords": CUSTOMER_KORAMANGALA,
            "warehouses": [WAREHOUSE_HSR, WAREHOUSE_INDIRANAGAR],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["warehouse_id"] == "wh-hsr"
    assert body["eta_minutes"] > 0
    assert body["score"] > 0


def test_select_warehouse_no_stock_excluded():
    res = client.post(
        "/select-warehouse",
        json={
            "delivery_coords": CUSTOMER_KORAMANGALA,
            "warehouses": [
                {**WAREHOUSE_HSR, "has_stock": False},
                {**WAREHOUSE_INDIRANAGAR, "has_stock": False},
            ],
        },
    )
    assert res.status_code == 200
    assert res.json()["warehouse_id"] is None
    assert res.json()["error"] == "no_warehouse_available"


def test_select_warehouse_outside_radius_excluded():
    far_warehouse = {
        "warehouse_id": "wh-far",
        "lat": 13.3528,
        "lng": 77.1018,
        "active_order_count": 0,
        "has_stock": True,
    }
    res = client.post(
        "/select-warehouse",
        json={
            "delivery_coords": CUSTOMER_KORAMANGALA,
            "warehouses": [far_warehouse],
        },
    )
    assert res.status_code == 200
    assert res.json()["warehouse_id"] is None


def test_assign_agent_returns_scored_candidates():
    WAREHOUSE_COORDS = {"lat": 12.9116, "lng": 77.6389}
    CUSTOMER_COORDS = {"lat": 12.9352, "lng": 77.6245}
    res = client.post(
        "/assign-agent",
        json={
            "warehouse_coords": WAREHOUSE_COORDS,
            "delivery_coords": CUSTOMER_COORDS,
            "agents": [
                {
                    "agent_id": "agent-1",
                    "lat": 12.9200,
                    "lng": 77.6300,
                    "current_order_count": 0,
                    "max_concurrent": 3,
                },
                {
                    "agent_id": "agent-2",
                    "lat": 12.9350,
                    "lng": 77.6400,
                    "current_order_count": 0,
                    "max_concurrent": 3,
                },
            ],
        },
    )
    assert res.status_code == 200
    candidates = res.json()["candidates"]
    assert len(candidates) == 2
    # Results must be sorted by ascending score
    assert candidates[0]["score"] <= candidates[1]["score"]


def test_assign_agent_no_eligible_agents():
    res = client.post(
        "/assign-agent",
        json={
            "warehouse_coords": {"lat": 12.9116, "lng": 77.6389},
            "delivery_coords": {"lat": 12.9352, "lng": 77.6245},
            "agents": [
                {
                    "agent_id": "agent-far",
                    "lat": 13.3528,
                    "lng": 77.1018,
                    "current_order_count": 0,
                    "max_concurrent": 3,
                }
            ],
        },
    )
    assert res.status_code == 200
    assert res.json()["error"] == "no_agent_available"
