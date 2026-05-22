import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Button, Input } from './ui';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { AlertCircle, Loader2 } from 'lucide-react';

/**
 * Shown automatically to invited members on first login: their account was
 * created with a temporary password emailed to them, and `must_change_password`
 * stays true until they set their own. Not dismissible — the family is only
 * usable once the password is changed.
 */
const ForcePasswordChangeDialog: React.FC = () => {
    const { t } = useTranslation();
    const { user, setUserFromServer } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const open = !!user && user.must_change_password === true;

    const handleConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (newPassword.length < 8) {
            setError(t('forcePasswordChange.tooShort'));
            return;
        }
        if (newPassword !== confirmPassword) {
            setError(t('forcePasswordChange.mismatch'));
            return;
        }
        setSubmitting(true);
        try {
            await api.post('/api/auth/change-password', { currentPassword, newPassword });
            // Refresh the cached profile so must_change_password flips to false
            // and this dialog closes.
            const me = await api.get<{ success: boolean; data: { user: any } }>('/api/auth/me');
            if (me.success && me.data?.user) {
                setUserFromServer(me.data.user);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : t('forcePasswordChange.error'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            // Intentionally not dismissible: the member must set a password.
            onOpenChange={() => undefined}
            title={t('forcePasswordChange.title')}
            description={t('forcePasswordChange.description')}
        >
            <form onSubmit={handleConfirm} className="space-y-4">
                <Input
                    label={t('forcePasswordChange.currentLabel')}
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t('forcePasswordChange.currentPlaceholder')}
                    autoComplete="current-password"
                    required
                />
                <Input
                    label={t('forcePasswordChange.newLabel')}
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                />
                <Input
                    label={t('forcePasswordChange.confirmLabel')}
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                />
                {error && (
                    <p className="flex items-center gap-1 text-micro text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </p>
                )}
                <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={submitting}>
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('forcePasswordChange.confirm')}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
};

export default ForcePasswordChangeDialog;
