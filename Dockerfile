FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium

COPY . .

# Use gunicorn for production serving, allowing cloud providers to pass dynamic PORT
CMD gunicorn -b 0.0.0.0:${PORT:-5000} --timeout 120 --workers 2 app:app
