FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY training ./training

# Phase 9 (docs/ml-training.md): train the model here, from the synthetic data generator (fixed
# seed, so the same model every time). The library versions that train it are the ones that load
# it, and no model file needs to be stored in Git. Takes about two minutes.
RUN python -m training.train

# Run as an ordinary user, not root (BT-23): if the service were ever broken into, it could not
# change the container.
RUN useradd --system --no-create-home --uid 10001 mlservice
USER mlservice

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
