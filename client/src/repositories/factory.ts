import { IDataRepository, ServerConfig } from './interface';
import { ServerRepository } from './server';

/**
 * Factory simplifié - TOUJOURS utilise PostgreSQL via serveur
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

  private static getApiUrl(): string {
    // Always use same-origin API.
    // - Dev: Vite proxy can forward /api
    // - Prod/Docker: Node server serves /api on the same host/port
    return '/api';
  }

  private static getServerConfig(): ServerConfig {
    return {
      apiUrl: this.getApiUrl(),
      authToken: 'default-token',
      familyId: 'family-default',
    };
  }

  private static createRepository(): IDataRepository {
    const config = this.getServerConfig();
    return new ServerRepository(config);
  }
}
