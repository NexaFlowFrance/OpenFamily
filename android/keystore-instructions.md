# Instructions pour créer une version signée (production)

## 1. Créer un Keystore (clé de signature)

Pour déployer sur le Play Store, vous devez signer votre APK/AAB avec une clé privée.

### Créer le keystore :
```bash
cd android/app
keytool -genkeypair -v -storetype PKCS12 -keystore openfamily-release.keystore -alias openfamily -keyalg RSA -keysize 2048 -validity 10000
```

**Informations à fournir :**
- Mot de passe du keystore (à retenir !)
- Nom et prénom
- Unité organisationnelle (ex: Dev)
- Organisation (ex: votre entreprise)
- Ville
- État/Province
- Code pays (ex: FR)

⚠️ **IMPORTANT** : Sauvegardez le fichier `.keystore` et le mot de passe en lieu sûr !

## 2. Configurer le fichier key.properties

Créez le fichier `android/key.properties` :
```properties
storePassword=VOTRE_MOT_DE_PASSE_KEYSTORE
keyPassword=VOTRE_MOT_DE_PASSE_CLE
keyAlias=openfamily
storeFile=openfamily-release.keystore
```

⚠️ **NE PAS** commiter ce fichier dans Git !

## 3. Modifier android/app/build.gradle

Ajoutez avant `android {` :
```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Dans `android {`, ajoutez :
```gradle
signingConfigs {
    release {
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
        storePassword keystoreProperties['storePassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

## 4. Générer l'APK signé

```bash
cd android
.\gradlew assembleRelease
```

L'APK signé sera dans : `android/app/build/outputs/apk/release/app-release.apk`

## 5. Générer l'AAB (Android App Bundle) pour le Play Store

```bash
cd android
.\gradlew bundleRelease
```

L'AAB sera dans : `android/app/build/outputs/bundle/release/app-release.aab`

## 6. Upload sur Google Play Console

1. Allez sur https://play.google.com/console
2. Créez une nouvelle application
3. Uploadez le fichier `.aab` 
4. Complétez les informations requises (description, captures d'écran, etc.)

## Notes pour iOS

Pour iOS, il faudra :
1. Un compte Apple Developer (99€/an)
2. Xcode installé sur Mac
3. Configurer les certificats et profils de provisioning
4. Build avec : `npx cap open ios` puis archive dans Xcode
