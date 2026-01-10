import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useApp } from '@/contexts/AppContext';

type StatusResponse =
  | { connected: false }
  | { connected: true; account: { id: string; username: string; updatedAt: string } };

type SyncResponse = {
  ok: true;
  result: { created: number; updated: number; skipped: number; errors: number };
};

export default function IcloudCalendarSync(): JSX.Element {
  const app = useApp();

  // Dans ton projet, le repository (ServerRepository) est très probablement exposé
  // via le contexte App. Selon l’implémentation, le champ peut s’appeler repository ou dataRepository.
  const repository = (app as any).repository ?? (app as any).dataRepository;

  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = async (): Promise<void> => {
    try {
      setMessage(null);

      if (!repository?.getIcloudCalendarStatus) {
        setMessage(
          "Repository non trouvé. Vérifie que AppContext expose repository/dataRepository et que ServerRepository contient bien les méthodes iCloud.",
        );
        return;
      }

      const data = (await repository.getIcloudCalendarStatus()) as StatusResponse;
      setStatus(data);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  };

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async (): Promise<void> => {
    try {
      setLoading(true);
      setMessage(null);

      await repository.connectIcloudCalendar({ username, appPassword });

      setMessage('Compte iCloud enregistré. Vous pouvez lancer une synchronisation.');
      setAppPassword('');
      await loadStatus();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (): Promise<void> => {
    try {
      setSyncLoading(true);
      setMessage(null);

      const data = (await repository.syncIcloudCalendar()) as SyncResponse;

      setMessage(
        `Sync terminée — créés: ${data.result.created}, mis à jour: ${data.result.updated}, ignorés: ${data.result.skipped}, erreurs: ${data.result.errors}`,
      );

      await loadStatus();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-medium">Synchronisation iCloud Calendar</div>
        <div className="text-xs text-muted-foreground">
          OpenFamily importe vos événements iCloud via CalDAV (lecture seule pour le MVP).
        </div>
      </div>

      {status?.connected ? (
        <div className="text-xs">
          Connecté : <span className="font-medium">{status.account.username}</span>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Aucun compte iCloud connecté.</div>
      )}

      <div className="grid gap-2">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Apple ID (email)"
          type="email"
        />
        <Input
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          placeholder="Mot de passe spécifique à l’app"
          type="password"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleConnect} disabled={loading || !username || !appPassword}>
          {loading ? 'Connexion...' : 'Enregistrer'}
        </Button>

        <Button variant="secondary" onClick={handleSync} disabled={syncLoading || !status?.connected}>
          {syncLoading ? 'Synchronisation...' : 'Synchroniser maintenant'}
        </Button>
      </div>

      {message ? <div className="text-xs">{message}</div> : null}

      <div className="text-xs text-muted-foreground">
        Astuce : générez un mot de passe spécifique à l’app dans votre compte Apple, puis utilisez-le ici.
      </div>
    </Card>
  );
}
