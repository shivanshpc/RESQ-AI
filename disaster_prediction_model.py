import pandas as pd
import numpy as np
import json
import pickle
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.ensemble import RandomForestClassifier

# 1. Generate Synthetic Dataset
def generate_synthetic_data(num_samples=1000):
    """
    Generates a synthetic dataset for Flood and Wildfire disaster predictions.
    Saves the data to a CSV and returns a pandas DataFrame.
    """
    np.random.seed(42)
    
    data = []
    for _ in range(num_samples):
        disaster_type = np.random.choice(["Flood", "Wildfire"])
        
        if disaster_type == "Flood":
            rainfall = np.random.uniform(50, 300)
            soil_saturation = np.random.uniform(0.5, 1.0)
            river_level = np.random.uniform(5, 15)
            
            wind_speed = np.random.uniform(0, 50)
            ndvi = np.nan
            humidity = np.nan
            
            # Target logic for flood
            if rainfall > 200 or river_level > 12:
                alert_level = "Flood_Emergency"
            else:
                alert_level = "Flood_Warning"
                
        else: # Wildfire
            rainfall = np.nan
            soil_saturation = np.nan
            river_level = np.nan
            
            wind_speed = np.random.uniform(20, 100)
            ndvi = np.random.uniform(0.1, 0.4) # Low NDVI implies dry vegetation
            humidity = np.random.uniform(10, 40) # Low humidity
            
            # Target logic for wildfire
            if wind_speed > 70 and humidity < 20:
                alert_level = "Fire_Extreme"
            else:
                alert_level = "Fire_Low"
                
        data.append({
            "Disaster_Type": disaster_type,
            "Rainfall_Intensity": rainfall,
            "Soil_Saturation": soil_saturation,
            "River_Level": river_level,
            "Wind_Speed": wind_speed,
            "NDVI_Index": ndvi,
            "Relative_Humidity": humidity,
            "Unified_Alert_Level": alert_level
        })
        
    df = pd.DataFrame(data)
    csv_filename = "synthetic_disaster_data.csv"
    df.to_csv(csv_filename, index=False)
    print(f"Synthetic dataset saved to '{csv_filename}'")
    return df

# 2. Preprocessing & 3. Model Training
def train_and_save_model(df, model_filename="disaster_model.pkl"):
    """
    Trains a unified RandomForest model on the dataset.
    A full preprocessing pipeline handles NaN imputation and scaling, 
    and One-Hot-Encoding for categorical features.
    """
    # Separate Features and Target
    X = df.drop("Unified_Alert_Level", axis=1)
    y = df["Unified_Alert_Level"]
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Define features
    numeric_features = [
        "Rainfall_Intensity", "Soil_Saturation", "River_Level", 
        "Wind_Speed", "NDVI_Index", "Relative_Humidity"
    ]
    categorical_features = ["Disaster_Type"]
    
    # Create preprocessing pipelines
    # NaNs correspond to features not relevant to the active disaster type
    # We impute them with 0.0 so the model can process them consistently
    numeric_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="constant", fill_value=0.0)), 
        ("scaler", StandardScaler())
    ])
    
    categorical_transformer = Pipeline(steps=[
        ("encoder", OneHotEncoder(handle_unknown="ignore"))
    ])
    
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, numeric_features),
            ("cat", categorical_transformer, categorical_features)
        ])
    
    # Full predictive pipeline
    pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("classifier", RandomForestClassifier(n_estimators=100, random_state=42))
    ])
    
    # Train the pipeline
    pipeline.fit(X_train, y_train)
    accuracy = pipeline.score(X_test, y_test)
    print(f"Model successfully trained. Validation Accuracy: {accuracy:.4f}")
    
    # Serialize and save model pipeline
    with open(model_filename, "wb") as f:
        pickle.dump(pipeline, f)
    print(f"Model pipeline saved to '{model_filename}'")

# 4. Model Inference with JSON-like payloads
def run_inference_example(model_filename="disaster_model.pkl"):
    """
    Loads the trained model pipeline and makes predictions against
    new JSON-like dictionary payloads.
    """
    # Load model
    with open(model_filename, "rb") as f:
        loaded_model = pickle.load(f)
    print(f"\nModel '{model_filename}' loaded successfully for inference.")
    
    # Example JSON-like payloads
    flood_payload = {
        "Disaster_Type": "Flood",
        "Rainfall_Intensity": 220.5,
        "Soil_Saturation": 0.95,
        "River_Level": 14.2,
        "Wind_Speed": 15.0,
        "NDVI_Index": None,         # Can be None or NaN (handled by imputer)
        "Relative_Humidity": None   # Can be None or NaN
    }
    
    wildfire_payload = {
        "Disaster_Type": "Wildfire",
        "Rainfall_Intensity": None,
        "Soil_Saturation": None,
        "River_Level": None,
        "Wind_Speed": 85.0,
        "NDVI_Index": 0.15,
        "Relative_Humidity": 15.0
    }
    
    # Convert dictionary payloads to pandas DataFrame for scikit-learn
    inference_df = pd.DataFrame([flood_payload, wildfire_payload])
    
    # Run predictions
    predictions = loaded_model.predict(inference_df)
    
    print("\n--- Example Inference Results ---")
    print(f"Payload 1 (Flood Scenario):\n{json.dumps(flood_payload, indent=2)}")
    print(f"-> Prediction: {predictions[0]}")
    print("-" * 40)
    print(f"Payload 2 (Wildfire Scenario):\n{json.dumps(wildfire_payload, indent=2)}")
    print(f"-> Prediction: {predictions[1]}")


if __name__ == "__main__":
    print("--- Step 1: Generating Synthetic Data ---")
    df = generate_synthetic_data(num_samples=1000)
    
    print("\n--- Step 2 & 3: Preprocessing and Training Model ---")
    train_and_save_model(df)
    
    print("\n--- Step 4: Outputting Example Inference Workflow ---")
    run_inference_example()
