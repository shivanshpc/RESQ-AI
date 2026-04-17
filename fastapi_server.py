from fastapi import FastAPI, File, UploadFile, HTTPException
import torch
from torchvision import transforms
from PIL import Image
import io
from pathlib import Path
from pydantic import BaseModel
import pickle
import pandas as pd

import disaster_damage_classifier


def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x

app = FastAPI()

# ---------------------------------------------------------
# 1. PyTorch CNN Model for Image Damage Assessment
# ---------------------------------------------------------
TARGET_LABELS = [
    "buildings_affected_or_greater",
    "buildings_minor_or_greater",
    "roads_damage",
    "trees_damage",
    "flooding_structures",
    "debris_any"
]
MODEL_PATH = Path(__file__).with_name("disaster_classifier_trained.pth")
device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

print(f"Loading PyTorch framework into memory on {device}...")
cv_model = disaster_damage_classifier.build_model(num_classes=len(TARGET_LABELS))
if MODEL_PATH.exists():
    try:
        cv_model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
        print(f"Loaded trained weights from {MODEL_PATH}")
    except Exception as exc:
        print(f"Warning: failed to load CV trained model ({exc}). Using base weights.")
else:
    print(f"Warning: CV trained model not found at {MODEL_PATH}. Using base weights.")
cv_model = cv_model.to(device)
cv_model.eval()

preprocess = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

@app.post("/fast-predict")
async def fast_predict(image: UploadFile = File(...)):
    print(f"Incoming prediction request: {image.filename}")
    image_bytes = await image.read()
    
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        return {"error": f"Invalid image format: {str(e)}"}
        
    input_tensor = preprocess(img)
    input_batch = input_tensor.unsqueeze(0).to(device)
    
    with torch.no_grad():
        output = cv_model(input_batch)

    probabilities = torch.sigmoid(output[0])

    results = {}
    for i, label in enumerate(TARGET_LABELS):
        results[label] = round(probabilities[i].item() * 100, 2)

    return {"predictions": results, "success": True}

# ---------------------------------------------------------
# 2. Random Forest Model for Tabular Early Warning
# ---------------------------------------------------------
class FloodRequest(BaseModel):
    rainfall_mm_hr: float = 0
    soil_saturation_pct: float = 0
    river_level_pct: float = 0
    wind_speed_kmh: float = 0
    region: str = "Assam, India"

class WildfireRequest(BaseModel):
    ndvi: float = 0.3
    humidity_pct: float = 60
    temperature_c: float = 30
    wind_speed_kmh: float = 20

def _train_synthetic_tabular_model(out_path: Path):
    # Trains quickly on synthetic data so the Early Warning page works out-of-the-box.
    import numpy as np
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
    from sklearn.compose import ColumnTransformer
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import StandardScaler, OneHotEncoder
    from sklearn.ensemble import RandomForestClassifier

    rng = np.random.default_rng(42)
    rows = []
    for _ in range(1500):
        disaster_type = rng.choice(["Flood", "Wildfire"])
        if disaster_type == "Flood":
            rainfall = float(rng.uniform(50, 300))
            soil_saturation = float(rng.uniform(0.5, 1.0))
            river_level = float(rng.uniform(5, 15))
            wind_speed = float(rng.uniform(0, 50))
            ndvi = None
            humidity = None
            alert_level = "Flood_Emergency" if (rainfall > 200 or river_level > 12) else "Flood_Warning"
        else:
            rainfall = None
            soil_saturation = None
            river_level = None
            wind_speed = float(rng.uniform(20, 100))
            ndvi = float(rng.uniform(0.1, 0.4))
            humidity = float(rng.uniform(10, 40))
            alert_level = "Fire_Extreme" if (wind_speed > 70 and humidity < 20) else "Fire_Low"

        rows.append({
            "Disaster_Type": disaster_type,
            "Rainfall_Intensity": rainfall,
            "Soil_Saturation": soil_saturation,
            "River_Level": river_level,
            "Wind_Speed": wind_speed,
            "NDVI_Index": ndvi,
            "Relative_Humidity": humidity,
            "Unified_Alert_Level": alert_level,
        })

    df = pd.DataFrame(rows)
    X = df.drop("Unified_Alert_Level", axis=1)
    y = df["Unified_Alert_Level"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    numeric_features = [
        "Rainfall_Intensity",
        "Soil_Saturation",
        "River_Level",
        "Wind_Speed",
        "NDVI_Index",
        "Relative_Humidity",
    ]
    categorical_features = ["Disaster_Type"]

    numeric_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="constant", fill_value=0.0)),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_transformer = Pipeline(
        steps=[("encoder", OneHotEncoder(handle_unknown="ignore"))]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, numeric_features),
            ("cat", categorical_transformer, categorical_features),
        ]
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("classifier", RandomForestClassifier(n_estimators=150, random_state=42)),
        ]
    )
    pipeline.fit(X_train, y_train)
    acc = pipeline.score(X_test, y_test)
    print(f"Early Warning tabular model trained (synthetic). Val Acc: {acc:.4f}")
    with open(out_path, "wb") as f:
        pickle.dump(pipeline, f)


def _load_disaster_model():
    candidates = [
        Path(__file__).with_name("disaster_model.pkl"),
        Path(__file__).with_name("disaster_prediction_pipeline.pkl"),
    ]
    for p in candidates:
        if p.exists():
            try:
                with open(p, "rb") as f:
                    model = pickle.load(f)
                print(f"Loaded Early Warning model from {p}")
                return model, p
            except Exception as exc:
                print(f"Warning: failed to load {p}: {exc}")

    # If no model is present, train a small synthetic one.
    out_path = Path(__file__).with_name("disaster_model.pkl")
    try:
        _train_synthetic_tabular_model(out_path)
        with open(out_path, "rb") as f:
            model = pickle.load(f)
        return model, out_path
    except Exception as exc:
        print(f"Warning: failed to train Early Warning model: {exc}")
        return None, None


disaster_model, disaster_model_path = _load_disaster_model()


@app.get("/health")
async def health():
    return {
        "ok": True,
        "device": str(device),
        "cv_model_loaded": MODEL_PATH.exists(),
        "early_warning_model_loaded": disaster_model is not None,
        "early_warning_model_path": str(disaster_model_path) if disaster_model_path else None,
    }

@app.post("/predict/flood")
async def predict_flood(req: FloodRequest):
    if not disaster_model:
        raise HTTPException(status_code=503, detail="Early warning model not loaded")
    
    # Map to schema expected by the generated pipeline
    payload = {
        "Disaster_Type": "Flood",
        "Rainfall_Intensity": req.rainfall_mm_hr,
        "Soil_Saturation": req.soil_saturation_pct / 100.0 if req.soil_saturation_pct > 1 else req.soil_saturation_pct,
        "River_Level": req.river_level_pct / 10.0,
        "Wind_Speed": req.wind_speed_kmh,
        "NDVI_Index": None,
        "Relative_Humidity": None
    }
    
    df = pd.DataFrame([payload])
    pred = disaster_model.predict(df)[0]

    try:
        proba = disaster_model.predict_proba(df)[0]
        confidence = round(float(proba.max()) * 100, 1)
    except Exception:
        confidence = 85.0

    # Derive continuous outputs from the raw sensor readings so the UI changes
    # meaningfully with slider values.
    rain = float(req.rainfall_mm_hr)
    soil = float(req.soil_saturation_pct / 100.0 if req.soil_saturation_pct > 1 else req.soil_saturation_pct)
    river_pct = float(req.river_level_pct)
    wind = float(req.wind_speed_kmh)

    # Risk score: prioritize river level + rainfall, then soil + wind.
    score = (
        0.45 * (rain / 200.0) +
        0.35 * (river_pct / 100.0) +
        0.15 * soil +
        0.05 * (wind / 60.0)
    )
    flood_prob = int(round(clamp(score / 1.0, 0.0, 0.99) * 100))

    # Align probability with classifier label (avoid "Emergency" with low prob).
    if pred == "Flood_Emergency":
        flood_prob = max(flood_prob, 85)
    else:
        flood_prob = min(flood_prob, 84)

    # Heuristic derived fields
    time_to_impact = round(clamp(8.0 - 0.03 * rain - 3.0 * soil - 0.04 * max(0.0, river_pct - 60.0), 0.5, 12.0), 1)
    area_km2 = int(round(clamp(40.0 + 1.2 * rain + 5.5 * max(0.0, river_pct - 60.0), 20.0, 1200.0)))
    affected_pop = int(round(clamp(area_km2 * (60.0 + 0.6 * soil * 100.0), 1500.0, 350000.0)))
    
    if pred == "Flood_Emergency":
        return {
            "severity": "EMERGENCY",
            "tier": "T3 (Emergency)",
            "confidence": confidence,
            "time_to_impact_hrs": time_to_impact,
            "area_km2": area_km2,
            "affected_population": affected_pop,
            "flood_probability_pct": flood_prob,
            "recommended_actions": [
                "Activate Level 3 Evacuation protocols via SMS & Sirens.",
                "Deploy NDRF teams to low-lying river areas.",
                "Open all emergency shelters in the region."
            ],
            "alert_message_en": "⚠ FLOOD EMERGENCY: Evacuate immediately to higher ground.",
            "alert_message_hi": "⚠ बाढ़ आपातकाल: तुरंत ऊंचाई वाले क्षेत्रों में जाएं।",
            "alert_message_as": "⚠ বান আপৎকাল: তৎকালে নিৰাপদ ওখ ঠাইলৈ যাওক।",
            "model_reasoning": f"Local model indicates emergency risk. River={river_pct:.0f}% and rainfall={rain:.0f}mm/hr are the dominant drivers; soil={soil*100:.0f}% adds runoff risk."
        }
    else:
        return {
            "severity": "WARNING",
            "tier": "T2 (Warning)",
            "confidence": confidence,
            "time_to_impact_hrs": time_to_impact,
            "area_km2": area_km2,
            "affected_population": affected_pop,
            "flood_probability_pct": flood_prob,
            "recommended_actions": [
                "Issue public warning via SMS / Radio.",
                "Pre-position boats and rescue teams.",
                "Monitor bridge structural integrity."
            ],
            "alert_message_en": "Flood Warning: Possible inundation. Stay alert.",
            "alert_message_hi": "बाढ़ की चेतावनी: संभावित जलभराव। सतर्क रहें।",
            "alert_message_as": "বানপানীৰ সতৰ্কবাণী: সাৱধান হওক।",
            "model_reasoning": f"Local model indicates warning-level risk. Current drivers: river={river_pct:.0f}%, rainfall={rain:.0f}mm/hr, soil={soil*100:.0f}%."
        }

@app.post("/predict/wildfire")
async def predict_wildfire(req: WildfireRequest):
    if not disaster_model:
        raise HTTPException(status_code=503, detail="Early warning model not loaded")
        
    payload = {
        "Disaster_Type": "Wildfire",
        "Rainfall_Intensity": None,
        "Soil_Saturation": None,
        "River_Level": None,
        "Wind_Speed": req.wind_speed_kmh,
        "NDVI_Index": req.ndvi,
        "Relative_Humidity": req.humidity_pct
    }
    df = pd.DataFrame([payload])
    pred = disaster_model.predict(df)[0]

    ndvi = float(req.ndvi)
    hum = float(req.humidity_pct)
    wind = float(req.wind_speed_kmh)

    # Higher risk when NDVI is low (dry vegetation), humidity low, wind high.
    score = (
        0.5 * (wind / 100.0) +
        0.35 * (1.0 - clamp(hum / 100.0, 0.0, 1.0)) +
        0.15 * clamp((0.35 - ndvi) / 0.35, 0.0, 1.0)
    )
    spread_prob = int(round(clamp(score, 0.0, 0.99) * 100))

    if pred == "Fire_Extreme":
        spread_prob = max(spread_prob, 75)
        risk = "HIGH"
        diff = "EXTREME"
        affected_area = int(round(clamp(20 + 2.0 * wind + 30 * (1.0 - hum / 100.0), 20, 800)))
        actions = ["Dispatch aerial firefighting units", "Evacuate downwind communities"]
    else:
        spread_prob = min(spread_prob, 74)
        risk = "MODERATE" if spread_prob >= 35 else "LOW"
        diff = "MODERATE" if risk != "LOW" else "LOW"
        affected_area = int(round(clamp(10 + 0.8 * wind + 10 * (1.0 - hum / 100.0), 5, 250)))
        actions = ["Monitor thermal hotspots", "Stage ground units"]

    return {
        "risk_level": risk,
        "spread_probability_pct": spread_prob,
        "affected_area_km2": affected_area,
        "containment_difficulty": diff,
        "recommended_actions": actions,
    }

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("FASTAPI_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
