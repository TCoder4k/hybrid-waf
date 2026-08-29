from app.api.schemas import PredictRequest


def build_search_surface(request: PredictRequest) -> str:
    """Extracts raw parameter/body VALUES for the vectorizer — not a JSON
    dump of the request structure, and not the endpoint.

    This must match the training data's distribution (dataset/dataset.csv
    rows are bare payload/phrase strings, e.g. "1 OR 1=1", with no endpoint
    prefix or JSON punctuation). Wrapping the input in JSON structure here
    would introduce characters (`{`, `}`, `":"`) and a constant endpoint
    prefix the model never saw during training, causing spurious
    misclassifications on totally benign input — this is exactly what
    happened before this function was written this way (see
    tests/test_predict.py's benign-request case).

    Deliberately different from the rule engine's search-surface.util.ts on
    the backend, which does include endpoint/JSON structure — regex
    substring matching doesn't care about surrounding punctuation, but a
    statistical model trained on bare values does.
    """
    values: list[str] = []
    values.extend(request.queryParams.values())
    values.extend(request.pathParams.values())

    if request.body is not None:
        if isinstance(request.body, dict):
            values.extend(str(v) for v in request.body.values())
        else:
            values.append(str(request.body))

    return " ".join(values)
