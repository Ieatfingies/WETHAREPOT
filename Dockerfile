# ==============================================================================
# WETHAREPOT — Unified Production Dockerfile
# Multi-stage build: compiles C++ SWE solver, installs Python backend,
# and serves the high-performance FastAPI digital twin service.
# ==============================================================================

FROM python:3.12-slim-bookworm AS base

# System dependencies for geospatial, C++ SWE compilation, and runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    g++ \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency requirements
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend and data processing source code
COPY backend /app/backend
COPY data /app/data
COPY simulation /app/simulation
COPY geospatial /app/geospatial

# Build C++ SWE solver if CMakeLists.txt exists
RUN if [ -f "/app/simulation/solver/CMakeLists.txt" ]; then \
        mkdir -p /app/build && cd /app/build && \
        cmake -DCMAKE_BUILD_TYPE=Release /app/simulation/solver && \
        cmake --build . --config Release; \
    fi

# Create runtime directories for data persistence and run archives
RUN mkdir -p /app/data/processed/api_runs

# Set environment defaults
ENV PYTHONUNBUFFERED=1 \
    PORT=8000 \
    HOST=0.0.0.0

EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Start FastAPI application
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
