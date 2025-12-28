import { IDataRepository, StorageMode, ServerConfig } from './interface';
import { LocalStorageRepository } from './localStorage';
import { ServerRepository } from './server';

/**
 * Factory pour créer le bon repository selon le mode de stockage
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
    const stored = localStorage.getItem('openfamily_storage_mode');
    return (stored === 'server' ? 'server' : 'local') as StorageMode;
  }

  private static getServerConfig(): ServerConfig {
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
