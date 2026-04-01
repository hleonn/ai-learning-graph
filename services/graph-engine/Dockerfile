FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Instalar torch CPU-only primero (mucho más ligero que la versión completa)
RUN pip install --no-cache-dir \
    torch==2.1.0+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Instalar el resto de dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]