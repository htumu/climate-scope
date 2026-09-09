import os

from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
from routes.climate_data_routes import climate_data_bp

load_dotenv()

app = Flask(__name__)
cors_origins = os.getenv("CORS_ORIGINS", "*")
CORS(app, origins="*" if cors_origins == "*" else [origin.strip() for origin in cors_origins.split(",") if origin.strip()])

app.register_blueprint(climate_data_bp)

if __name__ == "__main__":
    app.run(debug=True, port=5001)
