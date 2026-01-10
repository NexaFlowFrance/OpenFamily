import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type StatusResponse =
  | { connected: false }
  | { connected: true; account: { id: string; username: string; updatedAt: string } };

type SyncResponse = {
  ok: boolean;
  result?: { created: number; updated: number; skipped: number; errors: number };
  error?: string;
};

function getToken(): string | null {
  return (
    localStorage.getItem('token') ||
    localStorage.getItem('accessToken') ||
    localStorage.getItem('authToken') ||
    null
  );
}

function getFamilyId(): string | null {
  return localStorage.getItem('familyId') || localStorage.getItem('currentFamilyId') || null;
}

export default function IcloudCalendarSync(): JSX.Element {
  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const headers = useMemo(() => {
    const token = getToken();
    const familyId = getFamilyId();

    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    if (familyId) h['x-family-id'] = familyId;

    return h;
  }, []);

  const loadStatus = async (): Promise<void> => {
    try {
      const res = await fetch('/api/calendar-sync/icloud/status', { headers });
      const data = (await res.json()) as StatusResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`);
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

      const res = await fetch('/api/calendar-sync/icloud/connect', {
        method: 'POST',
        headers,
        body: JSON.stringify({ username, appPassword }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`);

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

      const res = await fetch('/api/calendar-sync/icloud/sync', {
        method: 'POST',
        headers,
      });

      const data = (await res.json()) as SyncResponse;
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`);

      setMessage(
        `Sync terminée — créés: ${data.result?.created ?? 0}, mis à jour: ${
          data.result?.updated ?? 0
        }, ignorés: ${data.result?.skipped ?? 0}, erreurs: ${data.result?.errors ?? 0}`,
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
