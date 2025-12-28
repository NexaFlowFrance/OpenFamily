# 🤝 Guide de Contribution - OpenFamily

Merci de votre intérêt pour contribuer à OpenFamily ! Ce document vous guidera dans le processus de contribution.

## 📋 Table des matières

- [Code de Conduite](#-code-de-conduite)
- [Comment puis-je contribuer ?](#-comment-puis-je-contribuer)
- [Signaler un bug](#-signaler-un-bug)
- [Proposer une fonctionnalité](#-proposer-une-fonctionnalité)
- [Soumettre une Pull Request](#-soumettre-une-pull-request)
- [Standards de code](#-standards-de-code)
- [Configuration de l'environnement](#️-configuration-de-lenvironnement)
- [Structure du projet](#-structure-du-projet)

## 📜 Code de Conduite

En participant à ce projet, vous acceptez de respecter notre [Code de Conduite](CODE_OF_CONDUCT.md).

## 💡 Comment puis-je contribuer ?

Il existe plusieurs façons de contribuer à OpenFamily :

### 🐛 Signaler un bug

Si vous trouvez un bug :

1. Vérifiez d'abord que le bug n'a pas déjà été signalé dans les [Issues](https://github.com/NexaFlowFrance/OpenFamily/issues)
2. Si ce n'est pas le cas, créez une nouvelle issue en utilisant le template "Bug Report"
3. Décrivez le bug de manière claire et détaillée
4. Incluez les étapes pour reproduire le problème
5. Ajoutez des captures d'écran si pertinent

### ✨ Proposer une fonctionnalité

Pour proposer une nouvelle fonctionnalité :

1. Vérifiez que la fonctionnalité n'a pas déjà été proposée
2. Créez une issue en utilisant le template "Feature Request"
3. Expliquez pourquoi cette fonctionnalité serait utile
4. Décrivez comment elle devrait fonctionner

### 🔄 Soumettre une Pull Request

#### Avant de commencer

1. **Fork le repository**
2. **Clonez votre fork** :
   ```bash
   git clone https://github.com/VOTRE-USERNAME/OpenFamily.git
   cd OpenFamily
   ```
3. **Créez une branche** :
   ```bash
   git checkout -b feature/ma-nouvelle-fonctionnalite
   ```
   ou
   ```bash
   git checkout -b fix/correction-du-bug
   ```

#### Pendant le développement

1. **Installez les dépendances** :
   ```bash
   pnpm install
   ```

2. **Lancez le serveur de développement** :
   ```bash
   pnpm dev
   ```

3. **Faites vos modifications** en respectant les [standards de code](#-standards-de-code)

4. **Testez vos changements** :
   - Testez sur plusieurs navigateurs (Chrome, Firefox, Safari)
   - Testez sur mobile si pertinent
   - Vérifiez que les fonctionnalités existantes fonctionnent toujours

5. **Committez vos changements** :
   ```bash
   git add .
   git commit -m "feat: description claire du changement"
   ```

#### Conventions de commit

Utilisez les préfixes suivants :
- `feat:` Nouvelle fonctionnalité
- `fix:` Correction de bug
- `docs:` Documentation uniquement
- `style:` Formatage, point-virgules manquants, etc
- `refactor:` Refactoring du code
- `perf:` Amélioration des performances
- `test:` Ajout ou correction de tests
- `chore:` Tâches de maintenance

Exemple :
```bash
git commit -m "feat: add dark mode toggle in settings"
git commit -m "fix: resolve shopping list sorting issue"
```

#### Soumettre la PR

1. **Poussez votre branche** :
   ```bash
   git push origin feature/ma-nouvelle-fonctionnalite
   ```

2. **Créez une Pull Request** sur GitHub
3. **Remplissez le template** de PR avec toutes les informations nécessaires
4. **Attendez la review** - nous nous efforçons de répondre rapidement !

## 🎨 Standards de code

### TypeScript

- Utilisez TypeScript strict mode
- Définissez des types explicites pour les props et les états
- Évitez `any` autant que possible

### React

- Utilisez des composants fonctionnels avec hooks
- Préférez `const` pour les variables qui ne changent pas
- Déstructurez les props et les objets quand c'est pertinent

### Formatage

- Le projet utilise Prettier pour le formatage automatique
- L'indentation est de 2 espaces
- Utilisez des guillemets simples pour les strings
- Ajoutez une virgule finale dans les objets et tableaux multi-lignes

### Nommage

- **Composants** : PascalCase (`ShoppingList.tsx`)
- **Fonctions** : camelCase (`handleAddItem`)
- **Constantes** : UPPER_SNAKE_CASE (`MAX_ITEMS`)
- **Fichiers** : kebab-case pour les utils (`date-utils.ts`)

### Imports

Organisez vos imports dans cet ordre :
1. Imports React et librairies externes
2. Imports de composants
3. Imports de hooks et utils
4. Imports de types
5. Imports de styles

```typescript
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useStorage } from '@/hooks/useStorage';
import type { Task } from '@/types';
import './styles.css';
```

## 🛠️ Configuration de l'environnement

### Prérequis

- Node.js 18+ (recommandé : 20+)
- pnpm 8+ (`npm install -g pnpm`)

### Installation

```bash
# Cloner le repository
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily

# Installer les dépendances
pnpm install

# Lancer en développement
pnpm dev
```

### Scripts disponibles

- `pnpm dev` - Lance le serveur de développement
- `pnpm build` - Build pour la production
- `pnpm preview` - Prévisualise le build de production
- `pnpm lint` - Vérifie le code (si configuré)
- `pnpm cap:android` - Build pour Android
- `pnpm cap:ios` - Build pour iOS

## 📁 Structure du projet

```
OpenFamily/
├── client/               # Code frontend
│   ├── src/
│   │   ├── components/  # Composants React
│   │   │   └── ui/      # Composants UI réutilisables
│   │   ├── contexts/    # Contextes React
│   │   ├── hooks/       # Hooks personnalisés
│   │   ├── lib/         # Bibliothèques utilitaires
│   │   ├── pages/       # Pages de l'application
│   │   └── types/       # Définitions TypeScript
│   └── public/          # Assets statiques
├── server/              # Code backend (minimal)
├── shared/              # Code partagé
├── android/             # Configuration Android (Capacitor)
└── resources/           # Resources (icônes, splash screens)
```

## 🧪 Tests

Actuellement, le projet n'a pas de suite de tests automatisés. Les contributions pour ajouter des tests sont les bienvenues !

Pour tester manuellement :
1. Testez toutes les fonctionnalités affectées
2. Vérifiez sur Chrome, Firefox et Safari
3. Testez sur mobile (responsive design)
4. Vérifiez que l'application fonctionne hors ligne

## 📝 Documentation

Si votre contribution ajoute ou modifie des fonctionnalités :
- Mettez à jour le README.md si nécessaire
- Ajoutez des commentaires pour les parties complexes du code
- Documentez les nouvelles fonctions et composants

## 🔍 Review Process

1. Une fois votre PR soumise, elle sera examinée par les mainteneurs
2. Des changements peuvent être demandés
3. Une fois approuvée, votre PR sera mergée
4. Vos contributions seront créditées dans le CHANGELOG

## 🎉 Remerciements

Merci de contribuer à OpenFamily ! Chaque contribution, petite ou grande, est appréciée et aide à améliorer l'application pour tous les utilisateurs.

## 📧 Questions ?

Si vous avez des questions, n'hésitez pas à :
- Ouvrir une [Discussion](https://github.com/NexaFlowFrance/OpenFamily/discussions)
- Nous contacter à contact@nexaflow.fr

---

**Happy Coding! 🚀**
