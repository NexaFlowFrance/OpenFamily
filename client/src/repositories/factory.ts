import { IDataRepository, StorageMode, ServerConfig } from './interface';
import { LocalStorageRepository } from './localStorage';
import { ServerRepository } from './server';
import { shouldAutoConfigureServer, getApiUrl } from '../lib/serverDetection';

/**
 * Factory pour créer le bon repository selon le mode de stockage
 * En mode serveur auto-détecté : ZERO localStorage
 */
export class RepositoryFactory {
  private static instance: IDataRepository | null = null;

  static getRepository(): IDataRepository {
    if (!this.instance) {
      const mode = this.getStorageMode();
      this.instance = this.createRepository(mode);
    }
    return this.instance;
  }

  static resetRepository(): void {
    this.instance = null;
  }

  private static getStorageMode(): StorageMode {
    // Si l'app est hébergée sur un serveur, toujours mode serveur
    if (shouldAutoConfigureServer()) {
      return 'server';
    }
    
    // Sinon vérifier localStorage
    const stored = localStorage.getItem('openfamily_storage_mode');
    return (stored === 'server' ? 'server' : 'local') as StorageMode;
  }

  private static getServerConfig(): ServerConfig {
    // Si mode auto-détecté, utiliser la config automatique
    if (shouldAutoConfigureServer()) {
      return {
        apiUrl: getApiUrl(),
        authToken: 'default-token',
        familyId: 'family-default',
      };
    }
    
    // Sinon utiliser localStorage
    const apiUrl = localStorage.getItem('openfamily_server_url') || 'http://localhost:3001/api';
    const authToken = localStorage.getItem('openfamily_server_token') || undefined;
    const familyId = localStorage.getItem('openfamily_family_id') || undefined;

    return { apiUrl, authToken, familyId };
  }

  private static createRepository(mode: StorageMode): IDataRepository {
    switch (mode) {
      case 'server':
        const config = this.getServerConfig();
        return new ServerRepository(config);
      case 'local':
      default:
        return new LocalStorageRepository();
    }
  }

  static setStorageMode(mode: StorageMode, serverConfig?: ServerConfig): void {
    // En mode serveur auto-détecté, NE PAS utiliser localStorage du tout
    if (shouldAutoConfigureServer()) {
      // Le mode est déjà serveur automatiquement, rien à sauvegarder
      this.resetRepository();
      return;
    }
    
    // Mode manuel (local ou serveur configuré manuellement)
    localStorage.setItem('openfamily_storage_mode', mode);
    
    if (mode === 'server' && serverConfig) {
      localStorage.setItem('openfamily_server_url', serverConfig.apiUrl);
      if (serverConfig.authToken) {
        localStorage.setItem('openfamily_server_token', serverConfig.authToken);
      }
      if (serverConfig.familyId) {
        localStorage.setItem('openfamily_family_id', serverConfig.familyId);
      }
    }

    // Reset l'instance pour forcer la recréation
    this.resetRepository();
  }
}
