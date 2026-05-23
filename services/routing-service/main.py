"""
ThreadDash Routing Service — warehouse selection, agent scoring, route computation.
Run: uvicorn main:app --reload --port 8000
"""
import math, os
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ThreadDash Routing Service", version="0.1.0")

WAREHOUSE_RADIUS_KM = float(os.getenv("WAREHOUSE_SELECTION_RADIUS_KM", "10"))
AGENT_RADIUS_KM = float(os.getenv("AGENT_SELECTION_RADIUS_KM", "8"))


class Coords(BaseModel):
    lat: float
    lng: float

class WarehouseCandidate(BaseModel):
    warehouse_id: str
    lat: float
    lng: float
    active_order_count: int
    has_stock: bool

class AgentCandidate(BaseModel):
    agent_id: str
    lat: float
    lng: float
    current_order_count: int
    max_concurrent: int

class WarehouseSelectionRequest(BaseModel):
    delivery_coords: Coords
    warehouses: list[WarehouseCandidate]

class AgentAssignmentRequest(BaseModel):
    warehouse_coords: Coords
    delivery_coords: Coords
    agents: list[AgentCandidate]


def haversine_km(a: Coords, b: Coords) -> float:
    R = 6371.0
    lat1, lon1 = math.radians(a.lat), math.radians(a.lng)
    lat2, lon2 = math.radians(b.lat), math.radians(b.lng)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(h))

def workload_penalty(active_orders: int) -> float:
    return max(0, active_orders - 5) * 5.0


@app.get("/health")
def health():
    return {"status": "ok", "service": "routing-service"}


@app.post("/select-warehouse")
def select_warehouse(req: WarehouseSelectionRequest):
    """Score = road ETA (approx) + workload penalty. Returns best warehouse."""
    candidates = [
        wh for wh in req.warehouses
        if wh.has_stock
        and haversine_km(Coords(lat=wh.lat, lng=wh.lng), req.delivery_coords) <= WAREHOUSE_RADIUS_KM
    ]
    if not candidates:
        return {"error": "no_warehouse_available", "warehouse_id": None}

    best = min(candidates, key=lambda wh: (
        haversine_km(Coords(lat=wh.lat, lng=wh.lng), req.delivery_coords) / 30 * 60
        + workload_penalty(wh.active_order_count)
    ))
    dist = haversine_km(Coords(lat=best.lat, lng=best.lng), req.delivery_coords)
    eta = dist / 30 * 60
    return {
        "warehouse_id": best.warehouse_id,
        "eta_minutes": round(eta, 1),
        "score": round(eta + workload_penalty(best.active_order_count), 2),
    }


@app.post("/assign-agent")
def assign_agent(req: AgentAssignmentRequest):
    """Score = 0.5*eta_warehouse + 0.3*order_count + 0.2*eta_customer."""
    eligible = [
        a for a in req.agents
        if a.current_order_count < a.max_concurrent
        and haversine_km(Coords(lat=a.lat, lng=a.lng), req.warehouse_coords) <= AGENT_RADIUS_KM
    ]
    if not eligible:
        return {"error": "no_agent_available", "candidates": []}

    scored = []
    for a in eligible:
        eta_wh   = haversine_km(Coords(lat=a.lat, lng=a.lng), req.warehouse_coords) / 30 * 60
        eta_cust = haversine_km(req.warehouse_coords, req.delivery_coords) / 30 * 60
        score    = 0.5*eta_wh + 0.3*a.current_order_count + 0.2*eta_cust
        scored.append({
            "agent_id": a.agent_id,
            "eta_to_warehouse_minutes": round(eta_wh, 1),
            "eta_to_customer_minutes": round(eta_cust, 1),
            "score": round(score, 2),
        })
    scored.sort(key=lambda x: x["score"])
    return {"candidates": scored}
