/**
 * Détection et configuration automatique du serveur
 */

/**
 * Détecte si l'application est hébergée sur un serveur (pas en local)
 */
export function isHostedOnServer(): boolean {
  const hostname = window.location.hostname;
  // Considéré comme "serveur" si ce n'est pas localhost/127.0.0.1
  return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '';
}

/**
 * Obtient l'URL de l'API basée sur l'origine actuelle
 */
export function getApiUrl(): string {
  const { protocol, hostname, port } = window.location;
  
  // Si hébergé sur serveur, utiliser la même origine
  if (isHostedOnServer()) {
    // Port par défaut pour l'API (3001)
    const apiPort = port ? parseInt(port) + 1 : 3001;
    return `${protocol}//${hostname}:${apiPort}/api`;
  }
  
  // Sinon, utiliser localhost
  return 'http://localhost:3001/api';
}

/**
 * Vérifie si le serveur est accessible
 */
export async function checkServerAvailability(apiUrl?: string): Promise<boolean> {
  const url = apiUrl || getApiUrl();
  
  try {
    const response = await fetch(`${url.replace('/api', '')}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    return response.ok;
  } catch (error) {
    console.error('Server not available:', error);
    return false;
  }
}

/**
 * Initialise automatiquement le mode serveur si l'app est hébergée
 */
export function shouldAutoConfigureServer(): boolean {
  return isHostedOnServer();
}
