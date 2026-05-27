from __future__ import annotations

import difflib
import pickle
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
MODEL_PATH = PROJECT_ROOT / "xgb_tuned_model.pkl"
ENCODER_PATH = PROJECT_ROOT / "label_encoders.pkl"

with open(MODEL_PATH, "rb") as f:
    model = pickle.load(f)

with open(ENCODER_PATH, "rb") as f:
    label_encoders = pickle.load(f)

app = Flask(__name__)
CORS(app)

REQUIRED_FEATURES = list(getattr(model, "feature_names_in_", []))
if not REQUIRED_FEATURES:
    REQUIRED_FEATURES = [
        "study_hours",
        "class_attendance",
        "sleep_hours",
        "sleep_quality",
        "study_method",
        "facility_rating",
    ]

NUMERIC_FEATURES = {"study_hours", "class_attendance", "sleep_hours"}
ALIAS_MAP = {
    "attendance": "class_attendance",
    "class_attendance": "class_attendance",
    "parental_involvement": "facility_rating",
    "study_hours": "study_hours",
    "sleep_hours": "sleep_hours",
    "sleep_quality": "sleep_quality",
    "study_method": "study_method",
    "facility_rating": "facility_rating",
    "internet_access": "internet_access",
}


def _normalize_text(value: Any) -> str:
    return str(value).strip().lower()


def encode_categorical(feature: str, value: Any) -> tuple[int, str | None]:
    encoder = label_encoders.get(feature)
    if encoder is None:
        raise ValueError(f"Encoder missing for categorical feature '{feature}'.")

    classes = [str(c) for c in encoder.classes_]
    normalized_classes = {c.lower(): c for c in classes}
    user_val = _normalize_text(value)

    if user_val in normalized_classes:
        return int(encoder.transform([normalized_classes[user_val]])[0]), None

    close = difflib.get_close_matches(user_val, list(normalized_classes.keys()), n=1, cutoff=0.6)
    if close:
        mapped = normalized_classes[close[0]]
        encoded = int(encoder.transform([mapped])[0])
        return encoded, f"'{value}' not seen during training for {feature}; used closest label '{mapped}'."

    fallback = classes[0]
    encoded = int(encoder.transform([fallback])[0])
    return encoded, f"'{value}' not seen during training for {feature}; used safe default '{fallback}'."


def preprocess_payload(payload: dict[str, Any]) -> tuple[pd.DataFrame, list[str]]:
    warnings: list[str] = []
    normalized: dict[str, Any] = {}

    for key, value in payload.items():
        mapped_key = ALIAS_MAP.get(key, key)
        normalized[mapped_key] = value

    row: dict[str, Any] = {}
    for feature in REQUIRED_FEATURES:
        if feature not in normalized:
            raise ValueError(f"Missing required field: {feature}")

        raw_value = normalized[feature]
        if feature in NUMERIC_FEATURES:
            try:
                row[feature] = float(raw_value)
            except (TypeError, ValueError) as e:
                raise ValueError(f"Field '{feature}' must be numeric.") from e
        else:
            encoded, warning = encode_categorical(feature, raw_value)
            row[feature] = encoded
            if warning:
                warnings.append(warning)

    return pd.DataFrame([row]), warnings


@app.get("/")
def health() -> Any:
    return jsonify(
        {
            "status": "ok",
            "message": "AI Exam Score Predictor API is running.",
            "required_features": REQUIRED_FEATURES,
            "available_encoders": sorted(label_encoders.keys()),
        }
    )


@app.post("/predict")
def predict() -> Any:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be JSON object."}), 400

    try:
        model_input, warnings = preprocess_payload(data)
        prediction = model.predict(model_input)
        predicted_score = float(np.clip(prediction[0], 0, 100))

        confidence = max(55.0, 97.0 - (len(warnings) * 8.0))
        return jsonify(
            {
                "predicted_score": round(predicted_score, 2),
                "confidence": round(confidence, 2),
                "warnings": warnings,
                "model_features_used": REQUIRED_FEATURES,
            }
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:  # defensive fallback
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

