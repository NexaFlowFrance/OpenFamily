/**
 * Configuration synchronization utility
 * En mode serveur : TOUT dans PostgreSQL, ZERO localStorage
 * En mode local : localStorage uniquement pour les données, pas la config
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
 * En mode serveur : UNIQUEMENT vérification base de données, JAMAIS localStorage
 * En mode local : localStorage uniquement
 */
export async function isOnboardingCompleted(): Promise<boolean> {
  // Si l'app est hébergée sur un serveur, vérifier UNIQUEMENT la base de données
  if (shouldAutoConfigureServer()) {
    const apiUrl = getApiUrl();
    const serverAvailable = await checkServerAvailability(apiUrl);
    
    if (serverAvailable) {
      // Utiliser des identifiants par défaut pour la famille
      const familyId = 'family-default';
      const authToken = 'default-token';
      
      const serverConfig = await fetchServerConfig(apiUrl, authToken, familyId);
      // Retourner directement le résultat du serveur, PAS de localStorage
      return serverConfig ? serverConfig.onboarding_completed : false;
    }
    // Si serveur pas disponible, considérer comme non complété
    return false;
  }

  // Mode local uniquement : vérifier localStorage
  const onboardingCompleted = localStorage.getItem('openfamily_onboarding_completed');
  return onboardingCompleted === 'true';
}

/**
 * Marque l'onboarding comme complété
 * En mode serveur : UNIQUEMENT dans PostgreSQL
 * En mode local : UNIQUEMENT dans localStorage
 */
export async function markOnboardingCompleted(
  theme: 'light' | 'dark',
  language: string
): Promise<void> {
  // Si mode serveur auto-détecté, sauvegarder UNIQUEMENT en base
  if (shouldAutoConfigureServer()) {
    const apiUrl = getApiUrl();
    const familyId = 'family-default';
    const authToken = 'default-token';
    
    await saveServerConfig(apiUrl, authToken, familyId, {
      onboarding_completed: true,
      storage_mode: 'server',
      theme,
      language,
    });
    return;
  }

  // Mode local : sauvegarder dans localStorage
  localStorage.setItem('openfamily_onboarding_completed', 'true');
}
