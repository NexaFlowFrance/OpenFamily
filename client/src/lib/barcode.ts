import { BarcodeScanner } from '@capacitor-community/barcode-scanner';

export const checkBarcodePermission = async (): Promise<boolean> => {
  try {
    const status = await BarcodeScanner.checkPermission({ force: false });
    
    if (status.granted) {
      return true;
    }
    
    if (status.denied) {
      // Permission refusée définitivement
      return false;
    }
    
    // Demander la permission
    const permission = await BarcodeScanner.checkPermission({ force: true });
    return permission.granted ?? false;
  } catch (error) {
    console.error('Erreur vérification permission:', error);
    return false;
  }
};

export const startBarcodeScanner = async (): Promise<string | null> => {
  try {
    // Vérifier et demander la permission
    const hasPermission = await checkBarcodePermission();
    if (!hasPermission) {
      alert('Permission caméra refusée. Veuillez l\'activer dans les paramètres.');
      return null;
    }

    // Préparer le scanner (masquer le body)
    document.body.classList.add('scanner-active');
    await BarcodeScanner.prepare();

    // Démarrer le scan
    const result = await BarcodeScanner.startScan();
    
    // Arrêter et nettoyer
    document.body.classList.remove('scanner-active');
    
    if (result.hasContent) {
      return result.content;
    }
    
    return null;
  } catch (error) {
    console.error('Erreur scan code-barres:', error);
    document.body.classList.remove('scanner-active');
    return null;
  }
};

export const stopBarcodeScanner = async (): Promise<void> => {
  try {
    await BarcodeScanner.stopScan();
    document.body.classList.remove('scanner-active');
  } catch (error) {
    console.error('Erreur arrêt scanner:', error);
  }
};
