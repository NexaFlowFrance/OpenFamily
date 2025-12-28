# Architecture Serveur OpenFamily

## Vue d'ensemble

OpenFamily supporte deux modes de fonctionnement :

1. **Mode Local** : Toutes les données sont stockées localement dans le navigateur (localStorage). Aucun serveur requis.
2. **Mode Serveur** : Les données sont synchronisées avec un serveur auto-hébergé via une API REST. Idéal pour partager les données entre plusieurs membres de la famille.

## Architecture Backend

### Stack Technique

- **Serveur** : Node.js avec Express
- **Base de données** : PostgreSQL 16
- **ORM** : Requêtes SQL natives avec `pg`
- **TypeScript** : Pour la sécurité du typage
- **Docker** : Déploiement conteneurisé

### Structure API

L'API REST suit les conventions RESTful standard :

```
GET    /api/health                 - Health check
GET    /api/{resource}             - Liste toutes les ressources
POST   /api/{resource}             - Crée une nouvelle ressource
PUT    /api/{resource}/:id         - Met à jour une ressource
DELETE /api/{resource}/:id         - Supprime une ressource
```

### Ressources disponibles

- `/api/shopping-items` - Articles de courses
- `/api/tasks` - Tâches
- `/api/appointments` - Rendez-vous
- `/api/members` - Membres de la famille
- `/api/recipes` - Recettes
- `/api/meals` - Repas planifiés
- `/api/budgets` - Budgets

### Authentification

L'API utilise une authentification par token Bearer :

```
Authorization: Bearer YOUR_TOKEN_HERE
```

### Headers requis

- `Authorization: Bearer {token}` - Token d'authentification
- `X-Family-Id: {familyId}` - Identifiant de la famille

### Base de données

#### Schema PostgreSQL

Le schema complet est disponible dans `server/schema.sql`. Voici la structure principale :

- **families** - Table des familles
- **family_members** - Membres de chaque famille
- **shopping_items** - Articles de courses
- **tasks** - Tâches familiales
- **appointments** - Rendez-vous
- **recipes** - Recettes
- **meals** - Planification des repas
- **budgets** - Gestion budgétaire

Toutes les tables utilisent des clés étrangères pour garantir l'intégrité référentielle.

## Pattern Repository

### Principe

Le client utilise le pattern Repository pour abstraire l'accès aux données :

```typescript
interface IDataRepository {
  // Shopping
  getShoppingItems(): Promise<ShoppingItem[]>;
  addShoppingItem(item: ShoppingItem): Promise<void>;
  // ... autres méthodes
}
```

### Implémentations

1. **LocalStorageRepository** : Stockage dans le navigateur
2. **ServerRepository** : Communication avec l'API REST

### Factory

Le `RepositoryFactory` sélectionne automatiquement la bonne implémentation selon la configuration :

```typescript
const repository = RepositoryFactory.getRepository();
await repository.getShoppingItems();
```

## Configuration du client

Lors de l'onboarding, l'utilisateur choisit son mode de stockage :

### Mode Local
- Aucune configuration requise
- Les données restent sur l'appareil

### Mode Serveur
- **URL du serveur** : `https://mon-serveur.com/api`
- **Token d'authentification** (optionnel) : Pour sécuriser l'accès
- **ID de famille** (optionnel) : Pour isoler les données par famille

Ces paramètres sont stockés dans le localStorage du navigateur.

## Flux de données

### Mode Local
```
Client ↔ LocalStorage
```

### Mode Serveur
```
Client ↔ API REST ↔ PostgreSQL
```

### Synchronisation

Le mode serveur n'utilise pas de synchronisation bidirectionnelle en temps réel. Les données sont lues/écrites directement depuis/vers le serveur à chaque opération.

## Sécurité

### Serveur

- Authentification par token Bearer
- Validation des données entrantes
- Isolation des données par famille (via X-Family-Id)
- CORS configuré pour autoriser les origines spécifiques
- Protection contre les injections SQL (requêtes paramétrées)

### Client

- Configuration stockée localement (localStorage)
- Token jamais exposé dans l'URL
- HTTPS recommandé en production

## Performance

### Indexes

Des index sont créés sur :
- Les clés étrangères (family_id)
- Les champs de date (date, month)
- Les champs fréquemment filtrés

### Pool de connexions

Le serveur utilise un pool de connexions PostgreSQL :
- **Max** : 20 connexions
- **Timeout idle** : 30 secondes
- **Timeout connexion** : 2 secondes

## Évolutivité

### Scalabilité horizontale

Pour gérer plus d'utilisateurs :
- Déployer plusieurs instances du serveur
- Utiliser un load balancer (nginx, traefik)
- Partager la même base de données PostgreSQL

### Haute disponibilité

- Réplication PostgreSQL (primary/replica)
- Backups automatiques
- Monitoring avec healthcheck endpoint

## Limitations actuelles

1. **Pas de synchronisation temps réel** : Les données ne sont pas pushées automatiquement
2. **Authentification basique** : Le système d'authentification est minimal
3. **Pas de gestion des conflits** : En cas d'édition simultanée, dernière écriture gagne
4. **Pas de cache côté serveur** : Toutes les requêtes vont directement à la base de données

## Évolutions futures

- [ ] WebSocket pour synchronisation temps réel
- [ ] Système d'authentification complet (OAuth2, JWT)
- [ ] Gestion des conflits d'édition
- [ ] Cache Redis pour améliorer les performances
- [ ] Migration de données local → serveur
- [ ] Export/import de données
- [ ] API GraphQL en complément de REST
- [ ] Système de notifications push
