// Utilitaires de chiffrement Web Crypto API
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

// Dériver une clé de chiffrement à partir d'un mot de passe
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  const importedKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    importedKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

// Chiffrer des données
export async function encryptData(data: string, password: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      key,
      encoder.encode(data)
    );
    
    // Combiner salt + iv + données chiffrées
    const combined = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);
    
    // Convertir en base64
    return btoa(String.fromCharCode.apply(null, Array.from(combined)));
  } catch (error) {
    console.error('Erreur de chiffrement:', error);
    throw new Error('Échec du chiffrement');
  }
}

// Déchiffrer des données
export async function decryptData(encryptedData: string, password: string): Promise<string> {
  try {
    // Décoder depuis base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Extraire salt, iv et données chiffrées
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);
    
    const key = await deriveKey(password, salt);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('Erreur de déchiffrement:', error);
    throw new Error('Mot de passe incorrect ou données corrompues');
  }
}

// Vérifier si les données sont chiffrées
export function isEncrypted(data: string): boolean {
  try {
    // Les données chiffrées sont en base64 et ont une longueur minimale
    return data.length > 50 && /^[A-Za-z0-9+/=]+$/.test(data);
  } catch {
    return false;
  }
}

// Chiffrer toutes les données du localStorage
export async function encryptAllLocalStorage(password: string): Promise<void> {
  const keys = [
    'openfamily_shopping',
    'openfamily_tasks',
    'openfamily_appointments',
    'openfamily_members',
    'openfamily_recipes',
    'openfamily_meals',
    'openfamily_budgets',
  ];
  
  for (const key of keys) {
    const data = localStorage.getItem(key);
    if (data && !isEncrypted(data)) {
      const encrypted = await encryptData(data, password);
      localStorage.setItem(key, encrypted);
    }
  }
  
  // Marquer que le chiffrement est activé
  localStorage.setItem('openfamily_encrypted', 'true');
}

// Déchiffrer toutes les données du localStorage
export async function decryptAllLocalStorage(password: string): Promise<void> {
  const keys = [
    'openfamily_shopping',
    'openfamily_tasks',
    'openfamily_appointments',
    'openfamily_members',
    'openfamily_recipes',
    'openfamily_meals',
    'openfamily_budgets',
  ];
  
  for (const key of keys) {
    const data = localStorage.getItem(key);
    if (data && isEncrypted(data)) {
      const decrypted = await decryptData(data, password);
      localStorage.setItem(key, decrypted);
    }
  }
  
  // Marquer que le chiffrement est désactivé
  localStorage.removeItem('openfamily_encrypted');
}

export function isEncryptionEnabled(): boolean {
  return localStorage.getItem('openfamily_encrypted') === 'true';
}
