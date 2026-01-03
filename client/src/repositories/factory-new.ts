import { IDataRepository, ServerConfig } from './interface';
import { ServerRepository } from './server';

/**
 * Factory pour créer le repository serveur PostgreSQL uniquement
 * Suppression complète du support localStorage
 */
export class RepositoryFactory {
  private static instance: IDataRepository | null = null;

  static getRepository(): IDataRepository {
    if (!this.instance) {
      this.instance = this.createRepository();
    }
    return this.instance;
  }

  static resetRepository(): void {
    this.instance = null;
  }

  private static getServerConfig(): ServerConfig {
    return {
      apiUrl: '/api',
      authToken: 'default-token',
      familyId: 'family-default',
    };
  }

  private static createRepository(): IDataRepository {
    const config = this.getServerConfig();
    return new ServerRepository(config);
  }
}