from pathlib import Path
from datetime import date
import joblib
import pickle
import pandas as pd

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODEL_DIR / "honey_production_model.pkl"
FEATURES_PATH = MODEL_DIR / "features.pkl"

model = joblib.load(MODEL_PATH)
with open(FEATURES_PATH, "rb") as f:
    FEATURES = pickle.load(f)


def predict_honey_production(environmental_temperature, relative_humidity,
                              hive_temperature, hive_humidity, wind_speed,
                              total_hive_weight, prediction_date=None):
    d = prediction_date or date.today()
    row = {
        "Environmental Temperature (°C)": float(environmental_temperature),
        "Relative Humidity (%)": float(relative_humidity),
        "Hive Temperature (°C)": float(hive_temperature),
        "Hive Humidity (%)": float(hive_humidity),
        "Wind Speed (km/h)": float(wind_speed),
        "Total Weight (Hive + Bees + Honey) (kg)": float(total_hive_weight),
        "month": int(d.month),
        "day_of_year": int(d.timetuple().tm_yday),
    }
    frame = pd.DataFrame([row], columns=FEATURES)
    prediction = float(model.predict(frame)[0])
    return max(0.0, prediction)


def model_info():
    return {
        "model": "RandomForestRegressor",
        "features": list(FEATURES),
        "modelPath": str(MODEL_PATH.name),
    }
