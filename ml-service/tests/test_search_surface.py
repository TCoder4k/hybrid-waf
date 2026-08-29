from app.api.schemas import PredictRequest
from app.services.search_surface import build_search_surface


def test_includes_query_param_values():
    request = PredictRequest(
        method="GET", endpoint="/api/hello", queryParams={"id": "42"}
    )
    surface = build_search_surface(request)
    assert surface == "42"


def test_includes_body_values_when_present():
    request = PredictRequest(
        method="POST",
        endpoint="/api/hello",
        body={"comment": "<script>alert(1)</script>"},
    )
    surface = build_search_surface(request)
    assert "<script>alert(1)</script>" in surface


def test_does_not_include_endpoint_or_json_structure():
    # The endpoint and JSON punctuation (`{`, `}`, `":"`) never appear in
    # the training data — see search_surface.py's docstring.
    request = PredictRequest(
        method="GET", endpoint="/api/hello", queryParams={"id": "42"}
    )
    surface = build_search_surface(request)
    assert "/api/hello" not in surface
    assert "{" not in surface

def test_handles_missing_body_without_error():
    request = PredictRequest(method="GET", endpoint="/api/hello")
    surface = build_search_surface(request)
    assert surface == ""
