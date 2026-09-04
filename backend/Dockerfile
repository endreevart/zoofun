FROM python:3.13-slim

ARG UV_VERSION=0.11.14
ARG INSTALL_DEV=true

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PATH="/app/.venv/bin:${PATH}"

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg wget ca-certificates \
    && wget -q -O /usr/local/share/ca-certificates/russian_trusted_root_ca.crt \
       https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt \
    && wget -q -O /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt \
       https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "uv==${UV_VERSION}"

COPY pyproject.toml uv.lock README.md ./

RUN if [ "$INSTALL_DEV" = "true" ]; then \
      uv sync --frozen --extra dev --no-install-project; \
    else \
      uv sync --frozen --no-dev --no-install-project; \
    fi

# Append Russian Trusted CA (Минцифры) to certifi bundle so httpx trusts T-Bank
RUN CERTIFI=$(.venv/bin/python -c "import certifi; print(certifi.where())") && \
    echo "" >> "$CERTIFI" && \
    cat /usr/local/share/ca-certificates/russian_trusted_root_ca.crt >> "$CERTIFI" && \
    echo "" >> "$CERTIFI" && \
    cat /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt >> "$CERTIFI"

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
