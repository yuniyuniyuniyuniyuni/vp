# --- 1단계: 빌더(Builder) ---
# 여기서는 패키지를 '빌드'만 합니다. (Python 3.11 사용)
FROM python:3.11-bullseye AS builder

# 빌드에 필요한 시스템 도구 설치
WORKDIR /app
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# requirements.txt를 먼저 복사하여 pip install 캐시 활용
COPY requirements.txt .

# pip 업그레이드 및 모든 패키지 설치
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt


# --- 2단계: 최종 이미지 (Final) ---
# 훨씬 가벼운 'slim' 이미지를 기반으로 합니다.
FROM python:3.11-slim-bullseye

WORKDIR /app

# '빌더' 단계와 달리, '실행'에 필요한 libgl1만 설치합니다.
# build-essential, cmake 등은 포함되지 않아 이미지가 가벼워집니다.
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \ 
    libsm6 \      
    libxext6 \     
    libxrender1 \  
    && rm -rf /var/lib/apt/lists/*

# 1단계(builder)에서 설치했던 Python 패키지들을 그대로 복사해옵니다.
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# 이제 애플리케이션 코드와 모델 파일(.pt)만 복사합니다.
COPY . .

EXPOSE 8080
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}