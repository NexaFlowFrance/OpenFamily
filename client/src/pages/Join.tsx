import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { intlLocale } from '../i18n/format';

interface InviteInfo {
    ownerName: string;
    expiresAt: string;
}

const Join: React.FC = () => {
    const { t } = useTranslation(['auth', 'common']);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { joinFamily, user } = useAuth();

    const inviteToken = searchParams.get('invite');

    const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [joined, setJoined] = useState(false);

    useEffect(() => {
        if (!inviteToken) {
            setError(t('auth:invite.missing'));
            setLoading(false);
            return;
        }

        api.get<{ success: boolean; data: InviteInfo }>(`/api/invites/info/${inviteToken}`)
            .then((res) => {
                if (res.success && res.data) {
                    setInviteInfo(res.data);
                } else {
                    setError(t('auth:invite.invalid'));
                }
            })
            .catch(() => setError(t('auth:invite.cannotVerify')))
            .finally(() => setLoading(false));
    }, [inviteToken, t]);

    const handleJoin = async () => {
        if (!inviteToken) return;
        setJoining(true);
        setError(null);
        try {
            await joinFamily(inviteToken);
            setJoined(true);
            setTimeout(() => navigate('/'), 2000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('auth:invite.joinError'));
        } finally {
            setJoining(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-nexus-background p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-nexus-blue/10 blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-nexus-blue-light/10 blur-[100px]" />
            </div>

            <Card className="w-full max-w-md relative z-10" hover={false}>
                <CardHeader className="text-center pb-6 pt-8">
                    <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-nexus-blue/10 flex items-center justify-center">
                        <Users className="w-7 h-7 text-nexus-blue" />
                    </div>
                    <CardTitle className="text-2xl text-nexus-blue">{t('auth:invite.title')}</CardTitle>
                    {user && (
                        <p className="text-sm text-muted-foreground mt-1">{t('auth:invite.loggedInAs')} <strong>{user.name}</strong></p>
                    )}
                </CardHeader>

                <CardContent className="px-8 pb-8 space-y-6">
                    {loading && (
                        <div className="flex flex-col items-center gap-3 py-4">
                            <Loader2 className="w-6 h-6 text-nexus-blue animate-spin" />
                            <p className="text-sm text-muted-foreground">{t('auth:invite.checking')}</p>
                        </div>
                    )}

                    {!loading && error && (
                        <div className="flex items-start gap-3 p-4 rounded-nexus bg-destructive/10 border border-destructive/20">
                            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    )}

                    {!loading && joined && (
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                            <CheckCircle className="w-10 h-10 text-green-500" />
                            <p className="text-sm font-medium text-foreground">
                                {t('auth:invite.joined', { name: inviteInfo?.ownerName })}
                            </p>
                            <p className="text-xs text-muted-foreground">{t('auth:invite.redirecting')}</p>
                        </div>
                    )}

                    {!loading && !error && !joined && inviteInfo && (
                        <>
                            <div className="p-4 rounded-nexus bg-card border border-border text-center">
                                <p className="text-sm text-muted-foreground mb-1">{t('auth:invite.invitationFrom')}</p>
                                <p className="text-xl font-semibold text-foreground">{inviteInfo.ownerName}</p>
                                <p className="text-xs text-muted-foreground mt-2">
                                    {t('auth:invite.expiresOn', {
                                        date: new Date(inviteInfo.expiresAt).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' }),
                                    })}
                                </p>
                            </div>

                            <p className="text-sm text-muted-foreground text-center">
                                {t('auth:invite.shareWarning', { name: inviteInfo.ownerName })}
                            </p>

                            <div className="flex gap-3">
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={() => navigate('/')}
                                    disabled={joining}
                                >
                                    {t('common:actions.cancel')}
                                </Button>
                                <Button
                                    className="flex-1"
                                    onClick={handleJoin}
                                    disabled={joining}
                                >
                                    {joining ? (
                                        <span className="flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {t('auth:invite.joining')}
                                        </span>
                                    ) : (
                                        t('auth:invite.join')
                                    )}
                                </Button>
                            </div>
                        </>
                    )}

                    {!loading && !error && !joined && !inviteInfo && (
                        <div className="text-center py-4">
                            <p className="text-sm text-muted-foreground">{t('auth:invite.notFound')}</p>
                            <Button variant="secondary" className="mt-4" onClick={() => navigate('/')}>
                                {t('common:actions.back')}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Join;
