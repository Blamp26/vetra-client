# Vetra Nginx Deployment

Use Nginx as the only public entrypoint. Keep Vite and Phoenix/Bandit ports private.

## Frontend build

From the client repo:

```bash
cd /mnt/games/vetra/repos/vetra-client
npm ci
npm run build
```

For same-origin production behind Nginx, do not set `VITE_API_URL` or `VITE_SOCKET_URL` at build time. The frontend will default to:

- API: `${window.location.origin}/api/v1`
- Socket on HTTP: `ws://${window.location.host}/socket`
- Socket on HTTPS: `wss://${window.location.host}/socket`

Local development can still use `.env.local`:

```env
VITE_API_URL=http://192.168.88.26:4000/api/v1
VITE_SOCKET_URL=ws://192.168.88.26:4000/socket
```

## Nginx server block

Create `/etc/nginx/sites-available/vetra`:

```nginx
server {
    listen 80;
    server_name 146.120.249.160;

    root /mnt/games/vetra/repos/vetra-client/dist;
    index index.html;

    location /api/v1/ {
        proxy_pass http://127.0.0.1:4000/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket {
        proxy_pass http://127.0.0.1:4000/socket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/vetra /etc/nginx/sites-enabled/vetra
sudo nginx -t
sudo systemctl reload nginx
```

## Backend environment

Run the Phoenix backend on the same machine, not exposed publicly. For the current production config, use port `4000`:

```env
PHX_HOST=146.120.249.160
PORT=4000
VETRA_ALLOWED_ORIGINS=http://146.120.249.160
```

When HTTPS is enabled later, add the HTTPS origin too:

```env
VETRA_ALLOWED_ORIGINS=http://146.120.249.160,https://146.120.249.160
```

Use firewall rules so only ports `80` and later `443` are public. Backend port `4000` should only be reachable locally or on a private interface.
