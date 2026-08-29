from fastapi import APIRouter

from app.api.schemas import PredictRequest, PredictResponse
from app.services.predictor import Predictor
from app.services.search_surface import build_search_surface

router = APIRouter()

# Loaded once at import time — a single trained model shared across
# requests, no per-request retraining/reloading.
_predictor = Predictor()


@router.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest) -> PredictResponse:
    text = build_search_surface(payload)
    classification, confidence = _predictor.predict(text)
    return PredictResponse(classification=classification, confidence=confidence)
