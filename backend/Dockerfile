# Debian Bullseye 기반의 Python 3.10 이미지를 사용합니다.
FROM python:3.10-bullseye

# 컨테이너 내의 작업 디렉터리 설정
WORKDIR /app

# OpenCV 및 Dlib (face_recognition)에 필요한 시스템 라이브러리 설치
# dlib 컴파일을 위해 build-essential과 cmake가 필요합니다.
# opencv-python-headless를 위해 libgl1이 필요합니다.
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# requirements.txt 파일을 먼저 복사 (Docker 캐시 활용)
COPY requirements.txt .

# Python 종속성 설치
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 전체와 모델 파일(.pt)을 컨테이너에 복사
COPY . .

# Cloud Run은 $PORT 환경 변수(보통 8080)를 주입합니다.
EXPOSE 8080

# 컨테이너 실행 시 FastAPI 서버 시작 명령어
# $PORT 변수를 사용하도록 설정
# 개발용 --reload 플래그는 제거합니다.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "${PORT:-8080}"]