import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { Server } from 'lucide-react';
import { pingServer, setServerUrl } from '../lib/serverConfig';

/**
 * First-run screen for the native app: the user enters the address of their own
 * self-hosted OpenFamily server. Shown only on native (Capacitor) when no server
 * URL has been configured yet.
 */
const ServerSetup: React.FC<{ onConfigured: () => void }> = ({ onConfigured }) => {
    const { t } = useTranslation('server');
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const clean = url.trim();
        if (!/^https?:\/\//i.test(clean)) {
            setError(t('errors.invalid'));
            return;
        }
        setLoading(true);
        try {
            const reachable = await pingServer(clean);
            if (!reachable) {
                setError(t('errors.unreachable'));
                return;
            }
            await setServerUrl(clean);
            onConfigured();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
            <LanguageSwitcher className="absolute top-4 right-4" />
            <Card className="w-full max-w-md" hover={false}>
                <CardHeader className="text-center pb-6 pt-8">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                        <Server className="h-7 w-7" />
                    </div>
                    <CardTitle className="font-serif text-display mb-2">{t('title')}</CardTitle>
                    <p className="text-muted-foreground text-caption">{t('subtitle')}</p>
                </CardHeader>
                <CardContent className="space-y-5 px-8 pb-8">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            label={t('urlLabel')}
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder={t('placeholder')}
                            required
                        />
                        {error && (
                            <div className="rounded-input bg-destructive/10 border border-destructive/20 p-3">
                                <p className="text-label-sm text-destructive font-medium text-center">{error}</p>
                            </div>
                        )}
                        <Button type="submit" disabled={loading} className="w-full h-12 text-body-sm font-semibold" size="lg">
                            {loading ? t('connecting') : t('connect')}
                        </Button>
                    </form>
                    <p className="text-micro text-muted-foreground text-center">{t('hint')}</p>
                </CardContent>
            </Card>
        </div>
    );
};

export default ServerSetup;
