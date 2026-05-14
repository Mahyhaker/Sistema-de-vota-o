# Deploy em AWS EC2 com Docker

## 1. Preparar o ambiente local

Crie o arquivo `.env` a partir de `.env.example` e troque os valores sensiveis:

```bash
cp .env.example .env
```

Para testar localmente:

```bash
docker compose up --build
```

A aplicacao deve responder em:

```text
http://localhost:8000
http://localhost:8000/api/health
```

## 2. Preparar a EC2

Use uma instancia Ubuntu. No security group, libere:

- `22/tcp` para SSH, preferencialmente apenas seu IP.
- `80/tcp` para HTTP.
- `443/tcp` para HTTPS.
- `8000/tcp` apenas se for testar sem Nginx.

Instale Docker e o plugin Compose:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker ubuntu
```

Saia e entre de novo no SSH para aplicar o grupo `docker`.

## 3. Subir a aplicacao

No servidor, envie ou clone o projeto, crie o `.env` e ajuste:

```text
DEBUG=false
DJANGO_SECRET_KEY=<uma-chave-longa-e-aleatoria>
ALLOWED_HOSTS=<seu-dominio-ou-ip>
CSRF_TRUSTED_ORIGINS=https://<seu-dominio>
CORS_ALLOWED_ORIGINS=https://<seu-dominio>
ADMIN_PASSWORD=<senha-forte>
SESSION_COOKIE_SECURE=true
CSRF_COOKIE_SECURE=true
SECURE_SSL_REDIRECT=true
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=true
```

Suba os containers:

```bash
docker compose up -d --build
```

Veja logs:

```bash
docker compose logs -f web
```

## 4. Nginx e HTTPS

Em producao, deixe o container escutando internamente em `8000` e coloque Nginx na frente.

Exemplo de bloco Nginx:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Depois configure HTTPS com Certbot:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```

## 5. Backup

O banco Postgres fica no volume Docker `postgres_data`. Para backup:

```bash
docker compose exec db pg_dump -U voting voting > backup.sql
```

Para restaurar:

```bash
docker compose exec -T db psql -U voting voting < backup.sql
```
