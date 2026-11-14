
FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    libgomp1 \
    libexpat1 \
    libexpat1-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN pip install --no-cache-dir \
    geopandas \
    osmnx \
    rasterio \
    pyproj

COPY backend ./backend
COPY geospatial ./geospatial
COPY simulation ./simulation
COPY data ./data
COPY ml ./ml

RUN mkdir -p /app/build /app/data/processed/api_runs

RUN g++ -std=c++17 -O3 -fopenmp \
    -I /app/simulation/core \
    /app/simulation/core/main_cli.cpp \
    /app/simulation/core/ShallowWaterSolver.cpp \
    -o /app/build/swe_solver_oneway

ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=8000
ENV SOLVER_PATH=/app/build/swe_solver_oneway

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
