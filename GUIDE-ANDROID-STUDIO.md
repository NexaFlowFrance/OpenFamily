# 📱 Guide Android Studio - OpenFamily

## 🚀 Étape 1 : Ouvrir le projet dans Android Studio

### Option A : Depuis Android Studio
1. **Lancez Android Studio**
2. Cliquez sur **"Open"** (ou "Ouvrir un projet existant")
3. Naviguez vers le dossier **`android`** du projet OpenFamily
4. Sélectionnez le dossier **`android`** 
5. Cliquez sur **"OK"**

### Option B : Depuis l'explorateur Windows
1. Allez dans le dossier **`android`** du projet OpenFamily
2. **Clic droit** sur le fichier `build.gradle`
3. Choisissez **"Ouvrir avec Android Studio"**

---

## ⏳ Étape 2 : Première ouverture (Configuration automatique)

Lors de la première ouverture, Android Studio va :

1. **Indexer le projet** (barre de progression en bas) - Attendez que ça termine
2. **Télécharger les dépendances Gradle** - Peut prendre 2-5 minutes
3. **Synchroniser le projet** (Gradle Sync)

⚠️ **IMPORTANT :** Si vous voyez une erreur concernant Java 21 :
- Ouvrez le terminal dans Android Studio (Alt+F12)
- Exécutez ces commandes PowerShell :

```powershell
$filePath = "capacitor-cordova-android-plugins\..\node_modules\.pnpm\@capacitor+android@7.4.4_@capacitor+core@7.4.4\node_modules\@capacitor\android\capacitor\build.gradle"
$content = Get-Content $filePath -Raw
$newContent = $content -replace 'JavaVersion\.VERSION_21', 'JavaVersion.VERSION_17'
Set-Content -Path $filePath -Value $newContent

$filePath2 = "app\capacitor.build.gradle"
$content2 = Get-Content $filePath2 -Raw
$newContent2 = $content2 -replace 'JavaVersion\.VERSION_21', 'JavaVersion.VERSION_17'
Set-Content -Path $filePath2 -Value $newContent2
```

Puis cliquez sur **"Sync Now"** ou **File → Sync Project with Gradle Files**

---

## 📲 Étape 3 : Configurer un appareil de test

### Option A : Appareil physique (Recommandé)

1. **Activez le mode développeur sur votre téléphone Android :**
   - Allez dans **Paramètres → À propos du téléphone**
   - Tapez 7 fois sur **"Numéro de build"**
   - Retournez aux Paramètres → **Options pour les développeurs**
   - Activez **"Débogage USB"**

2. **Connectez votre téléphone au PC avec un câble USB**

3. **Autorisez le débogage USB** sur le téléphone (popup qui apparaît)

4. Dans Android Studio, le téléphone apparaîtra en haut à côté du bouton ▶️ Run

### Option B : Émulateur Android (Plus lent)

1. Cliquez sur **"Device Manager"** (icône de téléphone en haut à droite)
2. Cliquez sur **"Create Device"**
3. Sélectionnez un modèle (ex: Pixel 7)
4. Téléchargez une image système (recommandé : API 33 - Android 13)
5. Cliquez sur **"Finish"**
6. Lancez l'émulateur avec le bouton ▶️

---

## ▶️ Étape 4 : Lancer l'application

### Méthode 1 : Avec le bouton Run (le plus simple)

1. En haut d'Android Studio, sélectionnez votre appareil dans le menu déroulant
2. Cliquez sur le bouton **▶️ Run 'app'** (ou appuyez sur **Shift+F10**)
3. L'application va se compiler puis s'installer automatiquement
4. Elle se lancera automatiquement sur votre appareil

### Méthode 2 : Avec le terminal Gradle

1. Ouvrez le terminal dans Android Studio (**Alt+F12**)
2. Exécutez :
   ```bash
   .\gradlew installDebug
   ```
3. Lancez manuellement l'app "OpenFamily" sur votre téléphone

---

## 🐛 Étape 5 : Déboguer l'application

### Voir les logs en temps réel

1. Cliquez sur l'onglet **"Logcat"** en bas d'Android Studio
2. Dans le filtre, tapez : `OpenFamily` ou `MainActivity`
3. Vous verrez tous les logs de votre application en temps réel

### Déboguer avec des breakpoints

1. Ouvrez le fichier `app/src/main/java/com/openfamily/app/MainActivity.java`
2. Cliquez dans la marge à gauche d'une ligne pour ajouter un breakpoint (point rouge)
3. Cliquez sur le bouton **🐛 Debug 'app'** au lieu de Run
4. L'exécution s'arrêtera au breakpoint

### Inspecter l'interface (Layout Inspector)

1. Lancez l'app
2. **Tools → Layout Inspector**
3. Sélectionnez votre processus
4. Vous verrez la hiérarchie complète de votre UI

---

## 🔧 Étape 6 : Modifier et recompiler

### Modifier le code web (React)

Si vous modifiez du code dans `client/src/` :

1. Ouvrez un terminal PowerShell dans le dossier racine du projet
2. Exécutez :
   ```bash
   npm run build
   npx cap sync android
   ```
3. Dans Android Studio, cliquez sur **Run** à nouveau

### Modifier le code Android natif

Si vous modifiez `MainActivity.java` ou des fichiers Android :
- Android Studio détectera automatiquement les changements
- Cliquez simplement sur **Run** pour recompiler

---

## 📊 Étape 7 : Générer un APK depuis Android Studio

### APK Debug (pour tester)

1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Attendez la compilation
3. Cliquez sur **"locate"** dans la notification
4. L'APK sera dans : `app/build/outputs/apk/debug/app-debug.apk`

### AAB Release (pour le Play Store)

1. **Build → Generate Signed Bundle / APK**
2. Sélectionnez **"Android App Bundle"**
3. Cliquez sur **"Next"**
4. **Si vous n'avez pas de keystore :**
   - Cliquez sur **"Create new..."**
   - **Key store path** : Cliquez sur 📁 et choisissez où créer le fichier
     - Exemple : `C:\Users\quent\Desktop\openfamily-release.jks`
     - ⚠️ Le fichier n'existe pas encore, c'est NORMAL ! Tapez le nom et Android Studio le créera
   - **Password** : Créez un mot de passe fort (notez-le !)
   - **Confirm** : Retapez le même mot de passe
   - **Alias** : `openfamily` (ou autre nom)
   - **Alias password** : Même mot de passe (ou différent, à noter aussi)
   - **Validity (years)** : 25 (ou plus)
   - **First and Last Name** : Votre nom
   - **Organizational Unit** : `Development`
   - **Organization** : Votre entreprise ou nom
   - **City or Locality** : Votre ville
   - **State or Province** : Votre région
   - **Country Code (XX)** : `FR` (pour France)
   - Cliquez sur **"OK"**
   - **⚠️ IMPORTANT : Sauvegardez le fichier .jks ET tous les mots de passe dans un endroit sûr !**
5. Une fois le keystore créé, il sera automatiquement sélectionné
6. Sélectionnez **"release"** comme build variant
7. Cliquez sur **"Finish"**
8. L'AAB sera dans : `app/build/outputs/bundle/release/app-release.aab`

**💡 Astuce :** Si vous avez déjà un keystore, cliquez sur "Choose existing..." et sélectionnez votre fichier .jks

---

## 🎯 Raccourcis clavier utiles

| Raccourci | Action |
|-----------|--------|
| **Shift+F10** | Lancer l'app (Run) |
| **Shift+F9** | Déboguer l'app (Debug) |
| **Ctrl+F9** | Compiler sans lancer |
| **Alt+F12** | Ouvrir/fermer le terminal |
| **Alt+6** | Ouvrir Logcat |
| **Ctrl+Shift+A** | Rechercher une action |
| **Double Shift** | Recherche globale |

---

## ❗ Problèmes fréquents

### "SDK location not found"
**Solution :** 
1. **File → Project Structure → SDK Location**
2. Vérifiez que le chemin est : `C:\Android`

### "Gradle sync failed"
**Solution :**
1. **File → Invalidate Caches → Invalidate and Restart**
2. Réouvrez le projet

### "Installed Build Tools revision X.X.X is corrupted"
**Solution :**
1. **Tools → SDK Manager → SDK Tools**
2. Décochez puis recochez **"Android SDK Build-Tools"**
3. Cliquez sur **"Apply"**

### L'app ne s'installe pas sur mon téléphone
**Solution :**
1. Vérifiez que le débogage USB est activé
2. Essayez de révoquer les autorisations USB puis reconnectez
3. Sur certains téléphones : **Paramètres → Options développeur → Installer via USB** (activez-le)

---

## 🎨 Tester les modifications en direct

### Hot Reload (pour le code web)

Pour un développement plus rapide avec rechargement automatique :

1. Dans le terminal du projet racine :
   ```bash
   npm run dev
   ```
2. L'app web s'ouvrira dans le navigateur
3. Modifiez le code → Sauvegardez → Le navigateur se recharge automatiquement
4. Une fois satisfait, buildez pour Android avec `npm run build` et `npx cap sync`

---

## 📱 Tester sur plusieurs appareils

1. Connectez plusieurs téléphones via USB
2. En haut d'Android Studio, dans le menu déroulant, vous verrez tous les appareils
3. Sélectionnez l'appareil désiré et cliquez sur Run
4. Répétez pour chaque appareil

---

## ✅ Checklist avant déploiement

- [ ] L'app fonctionne correctement en mode Debug
- [ ] Aucune erreur dans Logcat
- [ ] Le logo s'affiche correctement
- [ ] Le mode fullscreen fonctionne
- [ ] Testé sur au moins 2 appareils différents
- [ ] AAB de release signé généré
- [ ] Captures d'écran préparées pour le Play Store

---

🎉 **Votre projet est maintenant prêt à être développé et testé dans Android Studio !**

Pour toute question, consultez la documentation officielle : https://developer.android.com/studio
