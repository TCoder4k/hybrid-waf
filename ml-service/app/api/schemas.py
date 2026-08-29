from typing import Any, Dict, Optional

from pydantic import BaseModel


# Matches the request contract in docs/architecture.md §7 exactly — only
# the fields relevant to feature extraction, not the full NormalizedRequest
# (sourceIp/headers are intentionally omitted).
class PredictRequest(BaseModel):
    method: str
    endpoint: str
    queryParams: Dict[str, str] = {}
    pathParams: Dict[str, str] = {}
    body: Optional[Any] = None


class PredictResponse(BaseModel):
    classification: str
    confidence: float
