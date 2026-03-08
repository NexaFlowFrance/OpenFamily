/**
 * Configuration synchronization utility
 * TOUJOURS utilise PostgreSQL via serveur
 */

import { logger } from './logger';

const SESSION_STORAGE_KEY = 'openfamily_session';

export interface FamilyConfiguration {
  family_id?: string;
  onboarding_completed: boolean;
  storage_mode: 'server';
  theme: 'light' | 'dark';
  language: string;
}

/**
 * Obtient l'URL de l'API
 */
function getApiUrl(): string {
  return '/api';
}

/**
 * Get auth credentials from stored session
 */
function getAuthCredentials(): { authToken: string; familyId: string } {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const session = JSON.parse(stored);
      return {
        authToken: session.token || 'default-token',
        familyId: session.member?.familyId || 'family-default',
      };
    }
  } catch {
    // fallback
  }
  return { authToken: 'default-token', familyId: 'family-default' };
}

/**
 * Vérifie si le serveur est accessible
 */
async function checkServerAvailability(): Promise<boolean> {
  const apiUrl = getApiUrl();
  
  try {
    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    return response.ok;
  } catch (error) {
    logger.error('Server not available:', error);
    return false;
  }
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
      logger.error('Failed to fetch server config:', response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.error('Error fetching server config:', error);
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
      logger.error('Failed to save server config:', response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error saving server config:', error);
    return false;
  }
}

/**
 * Vérifie si l'onboarding a été complété
 * TOUJOURS vérifier dans PostgreSQL
 */
export async function isOnboardingCompleted(): Promise<boolean> {
  const apiUrl = getApiUrl();
  const serverAvailable = await checkServerAvailability();
  
  if (serverAvailable) {
    const { authToken, familyId } = getAuthCredentials();
    
    const serverConfig = await fetchServerConfig(apiUrl, authToken, familyId);
    return serverConfig ? serverConfig.onboarding_completed : false;
  }
  
  // Si serveur pas disponible, considérer comme non complété
  return false;
}

/**
 * Marque l'onboarding comme complété
 * TOUJOURS sauvegarder dans PostgreSQL
 */
export async function markOnboardingCompleted(
  theme: 'light' | 'dark',
  language: string
): Promise<void> {
  const apiUrl = getApiUrl();
  const { authToken, familyId } = getAuthCredentials();
  
  await saveServerConfig(apiUrl, authToken, familyId, {
    onboarding_completed: true,
    storage_mode: 'server',
    theme,
    language,
  });
}
