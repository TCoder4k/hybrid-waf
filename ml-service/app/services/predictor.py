from pathlib import Path

import joblib

MODEL_DIR = Path(__file__).parent.parent.parent / "model"


class Predictor:
    """Loads the trained TF-IDF vectorizer + Logistic Regression classifier
    once and serves predictions. See training/train.py for how these
    artifacts were produced."""

    def __init__(self) -> None:
        self.vectorizer = joblib.load(MODEL_DIR / "vectorizer.joblib")
        self.classifier = joblib.load(MODEL_DIR / "classifier.joblib")

    def predict(self, text: str) -> tuple[str, float]:
        features = self.vectorizer.transform([text])
        classification = str(self.classifier.predict(features)[0])
        probabilities = self.classifier.predict_proba(features)[0]
        confidence = float(max(probabilities))
        return classification, confidence
