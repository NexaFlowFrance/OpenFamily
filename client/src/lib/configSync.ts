/**
 * Configuration synchronization utility
 * Gère la synchronisation de la configuration entre localStorage et le serveur
 */

import { shouldAutoConfigureServer, getApiUrl, checkServerAvailability } from './serverDetection';

export interface FamilyConfiguration {
  family_id?: string;
  onboarding_completed: boolean;
  storage_mode: 'local' | 'server';
  theme: 'light' | 'dark';
  language: string;
}

/**
 * Récupère la configuration depuis le serveur
 */
export async function fetchServerConfig(
  apiUrl: string,
  authToken: string,
  familyId: string
): Promise<FamilyConfiguration | null> {
  try {
    const response = await fetch(`${apiUrl}/family/config`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Family-Id': familyId,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch server config:', response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching server config:', error);
    return null;
  }
}

/**
 * Sauvegarde la configuration sur le serveur
 */
export async function saveServerConfig(
  apiUrl: string,
  authToken: string,
  familyId: string,
  config: FamilyConfiguration
): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/family/config`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Family-Id': familyId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: `config-${familyId}`,
        ...config,
      }),
    });

    if (!response.ok) {
      console.error('Failed to save server config:', response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error saving server config:', error);
    return false;
  }
}

/**
 * Vérifie si l'onboarding a été complété
 * En mode serveur auto-détecté, vérifie TOUJOURS le serveur en priorité
 */
export async function isOnboardingCompleted(): Promise<boolean> {
  // Si l'app est hébergée sur un serveur, vérifier le serveur en PRIORITÉ
  if (shouldAutoConfigureServer()) {
    const apiUrl = getApiUrl();
    const serverAvailable = await checkServerAvailability(apiUrl);
    
    if (serverAvailable) {
      // Utiliser des identifiants par défaut pour la famille
      const familyId = 'family-default';
      const authToken = 'default-token';
      
      const serverConfig = await fetchServerConfig(apiUrl, authToken, familyId);
      if (serverConfig && serverConfig.onboarding_completed) {
        // Mettre à jour le localStorage pour éviter les requêtes futures
        localStorage.setItem('openfamily_onboarding_completed', 'true');
        localStorage.setItem('openfamily_storage_mode', 'server');
        localStorage.setItem('openfamily_server_url', apiUrl);
        localStorage.setItem('openfamily_server_token', authToken);
        localStorage.setItem('openfamily_family_id', familyId);
        return true;
      }
      // Si pas de config serveur, l'onboarding n'est pas complété
      return false;
    }
  }

  // Mode local ou serveur non disponible : vérifier localStorage
  const onboardingCompleted = localStorage.getItem('openfamily_onboarding_completed');
  const storageMode = localStorage.getItem('openfamily_storage_mode');

  // Si le mode serveur est configuré manuellement, vérifier le serveur
  if (storageMode === 'server') {
    const serverUrl = localStorage.getItem('openfamily_server_url');
    const authToken = localStorage.getItem('openfamily_server_token');
    const familyId = localStorage.getItem('openfamily_family_id');

    if (serverUrl && authToken && familyId) {
      const serverConfig = await fetchServerConfig(serverUrl, authToken, familyId);
      if (serverConfig) {
        return serverConfig.onboarding_completed;
      }
    }
  }

  // Fallback sur le localStorage
  return onboardingCompleted === 'true' || storageMode !== null;
}

/**
 * Marque l'onboarding comme complété
 * Sauvegarde à la fois localement et sur le serveur si configuré
 */
export async function markOnboardingCompleted(
  theme: 'light' | 'dark',
  language: string
): Promise<void> {
  // Toujours sauvegarder localement
  localStorage.setItem('openfamily_onboarding_completed', 'true');

  // Si en mode serveur, sauvegarder aussi sur le serveur
  const storageMode = localStorage.getItem('openfamily_storage_mode');
  if (storageMode === 'server') {
    const serverUrl = localStorage.getItem('openfamily_server_url');
    const authToken = localStorage.getItem('openfamily_server_token');
    const familyId = localStorage.getItem('openfamily_family_id');

    if (serverUrl && authToken && familyId) {
      await saveServerConfig(serverUrl, authToken, familyId, {
        onboarding_completed: true,
        storage_mode: 'server',
        theme,
        language,
      });
    }
  }
}
