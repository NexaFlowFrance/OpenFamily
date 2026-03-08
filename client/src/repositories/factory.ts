import { IDataRepository, ServerConfig } from './interface';
import { ServerRepository } from './server';

const STORAGE_KEY = 'openfamily_session';

/**
 * Factory simplifié - TOUJOURS utilise PostgreSQL via serveur
 */
export class RepositoryFactory {
  private static instance: IDataRepository | null = null;

  static getRepository(): IDataRepository {
    // Always create a fresh repository to pick up the latest auth token
    return this.createRepository();
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
    // Read auth token from localStorage session
    let authToken = 'default-token';
    let familyId = 'family-default';

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored);
        if (session.token) {
          authToken = session.token;
        }
        if (session.member?.familyId) {
          familyId = session.member.familyId;
        }
      }
    } catch {
      // Fallback to defaults
    }

    return {
      apiUrl: this.getApiUrl(),
      authToken,
      familyId,
    };
  }

  private static createRepository(): IDataRepository {
    const config = this.getServerConfig();
    return new ServerRepository(config);
  }
}
