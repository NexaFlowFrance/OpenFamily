# Sécuriser l'accès (résumé & exemples)

Objectif: l'app sera hébergée sur un serveur domestique et doit être accessible seulement par deux iPhones.

Important: filtrer par adresse MAC ne fonctionne que sur le même réseau local (L2). Si vous exposez un service sur Internet, les adresses MAC ne sont pas visibles par les routeurs distants et ne peuvent pas être utilisées pour filtrer l'accès.

Options recommandées classées par sécurité et praticité:

1) VPN (recommandé)
- Installer WireGuard sur le serveur et sur les iPhones (app WireGuard). Créez une paire de clés par iPhone et attribuez une IP privée (ex: 10.7.0.2 et 10.7.0.3).
- Autorisez uniquement le trafic VPN vers les ports du service. Exemple: UFW (ou iptables) autorise uniquement les IP WireGuard.

Exemple rapide (Ubuntu + UFW):

```bash
# installer wireguard via paquet
sudo apt update && sudo apt install wireguard

# activer UFW et par défaut refuser
sudo ufw default deny incoming
sudo ufw default allow outgoing

# autoriser seulement l'interface WireGuard (supposons wg0) et localhost
sudo ufw allow in on wg0

# (optionnel) bloquer accès direct à Docker en liant les ports sur localhost
# et autoriser seulement via wg0
```

2) Bind du service sur localhost + SSH tunnel ou reverse proxy local
- Configurez `docker-compose.yml` pour binder les ports sur `127.0.0.1` (ex: `127.0.0.1:80:80`).
- Sur les iPhones, créez un tunnel SSH (via un jump host) ou utilisez un VPN pour accéder à `localhost` du serveur.

3) mTLS (mutual TLS) via Nginx
- Configurez Nginx comme reverse proxy devant `web` et `api`, activez TLS et demandez un certificat client (mTLS).
- Générer un CA local, signer les certificats des iPhones (ou utiliser profiles/Certificat iOS) et configurer Nginx pour n'autoriser que ces certificats.

Exemple minimal de configuration Nginx pour mTLS (concept):

```nginx
server {
  listen 443 ssl;
  ssl_certificate /etc/ssl/certs/server.crt;
  ssl_certificate_key /etc/ssl/private/server.key;
  ssl_client_certificate /etc/ssl/certs/ca.crt;
  ssl_verify_client on;

  location / {
    proxy_pass http://api:3000;
  }
}
```

Notes pratiques et alternatives:
- Si vous connaissez les IP publiques des iPhones (rare pour mobile), vous pouvez restreindre l'accès par IP: `ufw allow from 1.2.3.4 to any port 80`.
- MAC filtering: uniquement utile si tout le trafic reste sur le réseau local (ex: routeur domestique). Sur votre routeur Wi‑Fi vous pouvez autoriser uniquement les MAC listés (whitelist) — ceci ne protège pas si le service est exposé sur Internet.
- Si vous voulez une solution simple et sécurisée: installez WireGuard, créez deux peers (iPhones), et configurez `ufw` pour autoriser uniquement le réseau WireGuard.

Exemple de règle iptables (autoriser seulement 10.7.0.2 et 10.7.0.3 vers port 80):

```bash
iptables -I INPUT -p tcp -s 10.7.0.2 --dport 80 -j ACCEPT
iptables -I INPUT -p tcp -s 10.7.0.3 --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j DROP
```

Checklist déploiement sécurisé:
- [ ] Désactiver mappage de port public si possible (bind sur localhost)
- [ ] Mettre en place WireGuard ou VPN sécurisé
- [ ] Appliquer règles firewall UFW/iptables pour n'autoriser que le VPN
- [ ] Optionnel: activer mTLS devant l'API pour double-authentification
