import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Plus, Edit2, Trash2, User, Phone, Heart, AlertTriangle, Users, Link2, Copy, LogOut, Crown, UserX, Check, UserPlus, Send, Clock, X } from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Select, Textarea, Badge } from '../components/ui';
import { DEFAULT_FAMILY_COLOR, FAMILY_COLOR_PRESETS } from '../design/colorPresets';

const COLOR_KEYS = ['coral', 'orange', 'yellow', 'green', 'cyan', 'blue', 'indigo', 'pink'];

interface FamilyMember {
    id: string;
    name: string;
    role: string;
    color: string;
    birthdate?: string;
    allergies?: string[];
    medications?: string[];
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    notes?: string;
    linked_user_id?: string | null;
}

interface SharedAccount {
    id: string;
    name: string;
    email: string;
    is_owner: boolean;
    role?: string;
}

interface JoinRequest {
    id: string;
    requester_id: string;
    requester_name: string;
    requester_email: string;
    created_at: string;
}

interface MyJoinRequest {
    id: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    owner_name: string;
    owner_email: string;
}

const Family: React.FC = () => {
    const { t } = useTranslation(['family', 'common']);
    const ROLES = [
        { value: 'Parent', label: t('family:roles.Parent') },
        { value: 'Enfant', label: t('family:roles.Enfant') },
        { value: 'Etudiant', label: t('family:roles.Etudiant') },
        { value: 'Autre', label: t('family:roles.Autre') },
    ];
    const roleLabel = (v: string) => t(`family:roles.${v}`, { defaultValue: v });
    const ACCOUNT_ROLES = [
        { value: 'parent', label: t('family:shared.roleParent') },
        { value: 'enfant', label: t('family:shared.roleChild') },
    ];
    const colorOptions = FAMILY_COLOR_PRESETS.map((c, i) => ({
        value: c.value,
        label: t(`family:colors.${COLOR_KEYS[i]}`, { defaultValue: c.label }),
    }));
    const { user, leaveFamily, refreshToken } = useAuth();
    const [members, setMembers] = useState<FamilyMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
    const [error, setError] = useState('');

    // Shared accounts state
    const [sharedAccounts, setSharedAccounts] = useState<SharedAccount[]>([]);
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [inviteLinkLoading, setInviteLinkLoading] = useState(false);
    const [inviteRole, setInviteRole] = useState<'parent' | 'enfant'>('parent');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteNotice, setInviteNotice] = useState<{ kind: 'sent' | 'link'; email?: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const [leavingFamily, setLeavingFamily] = useState(false);

    // Join requests state
    const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
    const [myRequest, setMyRequest] = useState<MyJoinRequest | null>(null);
    const [joinEmail, setJoinEmail] = useState('');
    const [joinError, setJoinError] = useState('');
    const [joinSubmitting, setJoinSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        role: 'Parent',
        color: DEFAULT_FAMILY_COLOR,
        birthdate: '',
        allergies: '',
        medications: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        notes: '',
        linked_user_id: '',
    });

    const isOwner = sharedAccounts.find((a) => a.id === user?.id)?.is_owner ?? true;

    useEffect(() => {
        loadMembers();
        loadSharedAccounts();
        loadJoinData();
    }, []);
    useWebSocketUpdates('family', () => {
        void loadMembers();
        void loadSharedAccounts();
        void loadJoinData();
    });

    const loadMembers = async () => {
        try {
            const response = await api.get<{ success: boolean; data: FamilyMember[] }>('/api/family');
            if (response.success) {
                setMembers(response.data);
            }
        } catch (error) {
            console.error('Failed to load family members:', error);
            setError(error instanceof Error ? error.message : t('family:errors.load'));
        } finally {
            setLoading(false);
        }
    };

    const loadSharedAccounts = async () => {
        try {
            const response = await api.get<{ success: boolean; data: SharedAccount[] }>('/api/invites/members');
            if (response.success) {
                setSharedAccounts(response.data);
            }
        } catch {
            // Silently ignore: non-blocking
        }
    };

    const loadJoinData = async () => {
        // Owner: pending requests addressed to me (403 for non-owners, ignore)
        try {
            const reqRes = await api.get<{ success: boolean; data: JoinRequest[] }>('/api/invites/requests');
            if (reqRes.success) setJoinRequests(reqRes.data);
        } catch {
            setJoinRequests([]);
        }
        // Requester: status of my own outgoing request
        try {
            const mineRes = await api.get<{ success: boolean; data: MyJoinRequest | null }>('/api/invites/requests/mine');
            if (mineRes.success) {
                if (mineRes.data?.status === 'approved') {
                    // Access granted: refresh the token so data queries use the new family scope
                    await refreshToken();
                    await loadSharedAccounts();
                    await loadMembers();
                    setMyRequest(null);
                } else {
                    setMyRequest(mineRes.data);
                }
            }
        } catch {
            setMyRequest(null);
        }
    };

    const handleSendJoinRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setJoinError('');
        if (!joinEmail.trim()) {
            setJoinError(t('family:join.emailRequired'));
            return;
        }
        setJoinSubmitting(true);
        try {
            await api.post('/api/invites/requests', { ownerEmail: joinEmail.trim() });
            setJoinEmail('');
            await loadJoinData();
        } catch (err) {
            setJoinError(err instanceof Error ? err.message : t('family:errors.sendRequest'));
        } finally {
            setJoinSubmitting(false);
        }
    };

    const handleCancelJoinRequest = async () => {
        try {
            await api.delete('/api/invites/requests/mine');
            setMyRequest(null);
        } catch {
            setError(t('family:errors.cancelRequest'));
        }
    };

    const handleApproveRequest = async (id: string) => {
        try {
            await api.post(`/api/invites/requests/${id}/approve`, {});
            await loadJoinData();
            await loadSharedAccounts();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('family:errors.approve'));
        }
    };

    const handleRejectRequest = async (id: string) => {
        try {
            await api.post(`/api/invites/requests/${id}/reject`, {});
            await loadJoinData();
        } catch {
            setError(t('family:errors.reject'));
        }
    };

    const handleGenerateInvite = async () => {
        setInviteLinkLoading(true);
        setInviteNotice(null);
        setError('');
        const email = inviteEmail.trim();
        try {
            // invite_url comes from the server: inside the Android shell
            // window.location.origin is http://localhost, which would produce a
            // link that is dead for everyone else.
            const response = await api.post<{
                success: boolean;
                data: { token: string; invite_url: string; email_sent: boolean | null };
            }>('/api/invites', { role: inviteRole, ...(email ? { inviteeEmail: email } : {}) });

            if (response.success && response.data) {
                setInviteLink(response.data.invite_url);
                if (response.data.email_sent === true) {
                    setInviteNotice({ kind: 'sent', email });
                    setInviteEmail('');
                } else if (response.data.email_sent === false) {
                    // Sending failed (or no mail relay configured): the link itself
                    // is valid, so tell the owner to share it manually.
                    setInviteNotice({ kind: 'link' });
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : t('family:errors.invite'));
        } finally {
            setInviteLinkLoading(false);
        }
    };

    const handleCopyInvite = () => {
        if (!inviteLink) return;
        navigator.clipboard.writeText(inviteLink).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleChangeMemberRole = async (userId: string, role: 'parent' | 'enfant') => {
        try {
            await api.put(`/api/invites/members/${userId}/role`, { role });
            await loadSharedAccounts();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('family:errors.role'));
        }
    };

    const handleKickMember = async (userId: string) => {
        if (!confirm(t('family:confirm.kick'))) return;
        try {
            await api.delete(`/api/invites/members/${userId}`);
            await loadSharedAccounts();
        } catch {
            setError(t('family:errors.kick'));
        }
    };

    const handleTransferOwnership = async (account: SharedAccount) => {
        if (!confirm(t('family:confirm.transfer', { name: account.name }))) return;
        try {
            const res = await api.post<{ success: boolean; data?: { token: string; user: any } }>(
                '/api/invites/transfer-ownership',
                { newOwnerId: account.id }
            );
            if (res.success) {
                // Our token now reflects member status; sync it.
                await refreshToken();
                await loadSharedAccounts();
                await loadMembers();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : t('family:errors.transfer'));
        }
    };

    const handleLeaveFamily = async () => {
        if (!confirm(t('family:confirm.leave'))) return;
        setLeavingFamily(true);
        try {
            await leaveFamily();
            setSharedAccounts([]);
        } catch {
            setError(t('family:errors.leave'));
        } finally {
            setLeavingFamily(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const payload = {
                ...formData,
                allergies: formData.allergies ? formData.allergies.split(',').map((a) => a.trim()).filter((a) => a) : [],
                medications: formData.medications ? formData.medications.split(',').map((m) => m.trim()).filter((m) => m) : [],
                birthdate: formData.birthdate || null,
                emergency_contact_name: formData.emergency_contact_name || null,
                emergency_contact_phone: formData.emergency_contact_phone || null,
                notes: formData.notes || null,
            };

            if (editingMember) {
                await api.put(`/api/family/${editingMember.id}`, payload);
                // Account link is a separate, owner-only endpoint - only call it on change.
                if (isOwner && (formData.linked_user_id || '') !== (editingMember.linked_user_id || '')) {
                    await api.put(`/api/family/${editingMember.id}/link`, {
                        user_id: formData.linked_user_id || null,
                    });
                }
            } else {
                await api.post('/api/family', payload);
            }
            setDialogOpen(false);
            resetForm();
            loadMembers();
        } catch (error) {
            console.error('Failed to save family member:', error);
            setError(error instanceof Error ? error.message : t('family:errors.save'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('family:confirm.delete'))) return;
        try {
            await api.delete(`/api/family/${id}`);
            loadMembers();
        } catch (error) {
            console.error('Failed to delete family member:', error);
            setError(error instanceof Error ? error.message : t('family:errors.delete'));
        }
    };

    const handleEdit = (member: FamilyMember) => {
        setEditingMember(member);
        setFormData({
            name: member.name,
            role: member.role,
            color: member.color,
            birthdate: member.birthdate ? member.birthdate.split('T')[0] : '',
            allergies: member.allergies?.join(', ') || '',
            medications: member.medications?.join(', ') || '',
            emergency_contact_name: member.emergency_contact_name || '',
            emergency_contact_phone: member.emergency_contact_phone || '',
            notes: member.notes || '',
            linked_user_id: member.linked_user_id || '',
        });
        setDialogOpen(true);
    };

    const resetForm = () => {
        setEditingMember(null);
        setFormData({
            name: '',
            role: 'Parent',
            color: DEFAULT_FAMILY_COLOR,
            birthdate: '',
            allergies: '',
            medications: '',
            emergency_contact_name: '',
            emergency_contact_phone: '',
            notes: '',
            linked_user_id: '',
        });
    };

    const calculateAge = (birthdate: string) => {
        const today = new Date();
        const birth = new Date(birthdate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="text-muted-foreground font-medium animate-pulse">{t('family:loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {error ? (
                <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                    {error}
                </div>
            ) : null}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-h1 mb-1">{t('family:title')}</h1>
                    <p className="text-muted-foreground text-body">{t('family:subtitle')}</p>
                </div>
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('family:addMember')}
                </Button>
            </div>

            {members.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <User className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <p className="text-muted-foreground">{t('family:empty')}</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {members.map((member) => (
                        <Card key={member.id} className="hover:shadow-lg transition-shadow">
                            <CardContent className="p-6">
                                <div className="flex items-start gap-4 mb-4">
                                    <div
                                        className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
                                        style={{ backgroundColor: member.color }}
                                    >
                                        {member.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-body font-semibold truncate">{member.name}</h3>
                                        <Badge variant="primary" className="mt-1">
                                            {roleLabel(member.role)}
                                        </Badge>
                                        {member.birthdate && (
                                            <p className="text-body-sm text-muted-foreground mt-1">
                                                {t('family:card.age', { count: calculateAge(member.birthdate) })}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Health Information */}
                                {(member.allergies && member.allergies.length > 0) || (member.medications && member.medications.length > 0) ? (
                                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Heart className="h-4 w-4 text-amber-600" />
                                            <span className="text-label font-semibold text-amber-900">{t('family:card.health')}</span>
                                        </div>
                                        {member.allergies && member.allergies.length > 0 && (
                                            <div className="mb-2">
                                                <p className="text-[11px] font-medium text-amber-900 mb-1">{t('family:card.allergies')}</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {member.allergies.map((allergy, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded"
                                                        >
                                                            {allergy}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {member.medications && member.medications.length > 0 && (
                                            <div>
                                                <p className="text-[11px] font-medium text-amber-900 mb-1">{t('family:card.medications')}</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {member.medications.map((med, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded"
                                                        >
                                                            {med}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                {/* Emergency Contact */}
                                {member.emergency_contact_name && (
                                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertTriangle className="h-4 w-4 text-red-600" />
                                            <span className="text-label font-semibold text-red-900">{t('family:card.emergency')}</span>
                                        </div>
                                        <p className="text-body-sm text-red-900 font-medium">
                                            {member.emergency_contact_name}
                                        </p>
                                        {member.emergency_contact_phone && (
                                            <div className="flex items-center gap-1 mt-1">
                                                <Phone className="h-3 w-3 text-red-600" />
                                                <a
                                                    href={`tel:${member.emergency_contact_phone}`}
                                                    className="text-body-sm text-red-700 hover:underline"
                                                >
                                                    {member.emergency_contact_phone}
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Notes */}
                                {member.notes && (
                                    <div className="mb-4 p-3 bg-nexus-background rounded-lg">
                                        <p className="text-body-sm text-muted-foreground">{member.notes}</p>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-2 pt-2 border-t">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleEdit(member)}
                                        className="flex-1"
                                    >
                                        <Edit2 className="h-4 w-4 mr-1" />
                                        {t('common:actions.edit')}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(member.id)}>
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Shared accounts section */}
            {(() => {
                return (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-nexus-blue" />
                            <h2 className="text-h2">{t('family:shared.title')}</h2>
                        </div>
                        <p className="text-body-sm text-muted-foreground">
                            {t('family:shared.subtitle')}
                        </p>

                        {/* Account list */}
                        {sharedAccounts.length > 1 && (
                            <div className="grid gap-3">
                                {sharedAccounts.map((account) => (
                                    <Card key={account.id} hover={false}>
                                        <CardContent className="flex items-center gap-3 p-4">
                                            <div className="w-10 h-10 rounded-full bg-nexus-blue/10 flex items-center justify-center shrink-0">
                                                {account.is_owner
                                                    ? <Crown className="w-5 h-5 text-nexus-blue" />
                                                    : <User className="w-5 h-5 text-muted-foreground" />
                                                }
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-body font-medium truncate">
                                                    {account.name}
                                                    {account.id === user?.id && (
                                                        <span className="ml-2 text-label-sm text-muted-foreground">{t('family:shared.you')}</span>
                                                    )}
                                                </p>
                                                <p className="text-body-sm text-muted-foreground truncate">{account.email}</p>
                                            </div>
                                            {account.is_owner ? (
                                                <Badge variant="primary">{t('family:shared.owner')}</Badge>
                                            ) : isOwner ? (
                                                <div className="w-32" title={t('family:shared.roleTitle')}>
                                                    <Select
                                                        value={account.role === 'enfant' ? 'enfant' : 'parent'}
                                                        onValueChange={(value) => handleChangeMemberRole(account.id, value as 'parent' | 'enfant')}
                                                        options={ACCOUNT_ROLES}
                                                    />
                                                </div>
                                            ) : (
                                                <Badge variant="default">
                                                    {account.role === 'enfant' ? t('family:shared.child') : t('family:shared.parent')}
                                                </Badge>
                                            )}
                                            {/* Owner can kick non-owner members (except themselves) */}
                                            {isOwner && !account.is_owner && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleTransferOwnership(account)}
                                                    title={t('family:shared.transferTitle')}
                                                >
                                                    <Crown className="w-4 h-4 text-amber-500" />
                                                </Button>
                                            )}
                                            {isOwner && !account.is_owner && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleKickMember(account.id)}
                                                    title={t('family:shared.kickTitle')}
                                                >
                                                    <UserX className="w-4 h-4 text-red-500" />
                                                </Button>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}

                        {sharedAccounts.length <= 1 && (
                            <Card hover={false}>
                                <CardContent className="p-4 text-center text-muted-foreground text-body-sm">
                                    {t('family:shared.none')}
                                </CardContent>
                            </Card>
                        )}

                        {/* Owner: pending join requests to approve / reject */}
                        {isOwner && joinRequests.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <UserPlus className="w-4 h-4 text-nexus-blue" />
                                    <h3 className="text-body font-semibold">{t('family:requests.title')}</h3>
                                    <Badge variant="primary">{joinRequests.length}</Badge>
                                </div>
                                {joinRequests.map((reqItem) => (
                                    <Card key={reqItem.id} hover={false}>
                                        <CardContent className="flex items-center gap-3 p-4">
                                            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                                                <User className="w-5 h-5 text-amber-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-body font-medium truncate">{reqItem.requester_name}</p>
                                                <p className="text-body-sm text-muted-foreground truncate">{reqItem.requester_email}</p>
                                            </div>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleApproveRequest(reqItem.id)}
                                                className="flex items-center gap-1 text-green-600"
                                                title={t('family:requests.accept')}
                                            >
                                                <Check className="w-4 h-4" />
                                                {t('family:requests.accept')}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRejectRequest(reqItem.id)}
                                                title={t('family:requests.rejectTitle')}
                                            >
                                                <X className="w-4 h-4 text-red-500" />
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}

                        {/* Lone account: request to join another family */}
                        {isOwner && sharedAccounts.length <= 1 && (
                            myRequest && myRequest.status === 'pending' ? (
                                <Card hover={false}>
                                    <CardContent className="flex items-center gap-3 p-4">
                                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                                            <Clock className="w-5 h-5 text-amber-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-body font-medium">{t('family:myRequest.pendingTitle')}</p>
                                            <p className="text-body-sm text-muted-foreground truncate">
                                                {t('family:myRequest.sentTo', { name: myRequest.owner_name, email: myRequest.owner_email })}
                                            </p>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={handleCancelJoinRequest}>
                                            {t('common:actions.cancel')}
                                        </Button>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="space-y-3 border-t pt-4">
                                    <div className="flex items-center gap-2">
                                        <UserPlus className="w-4 h-4 text-nexus-blue" />
                                        <h3 className="text-body font-semibold">{t('family:join.title')}</h3>
                                    </div>
                                    <p className="text-body-sm text-muted-foreground">
                                        {t('family:join.desc')}
                                    </p>
                                    {myRequest && myRequest.status === 'rejected' && (
                                        <p className="text-body-sm text-red-500">
                                            {t('family:join.rejected')}
                                        </p>
                                    )}
                                    {joinError && (
                                        <p className="text-body-sm text-red-500">{joinError}</p>
                                    )}
                                    <form onSubmit={handleSendJoinRequest} className="flex flex-col gap-2 sm:flex-row">
                                        <Input
                                            type="email"
                                            value={joinEmail}
                                            onChange={(e) => setJoinEmail(e.target.value)}
                                            placeholder={t('family:join.emailPlaceholder')}
                                            className="flex-1"
                                        />
                                        <Button
                                            type="submit"
                                            variant="secondary"
                                            disabled={joinSubmitting}
                                            className="flex items-center justify-center gap-2"
                                        >
                                            <Send className="w-4 h-4" />
                                            {joinSubmitting ? t('family:join.sending') : t('family:join.send')}
                                        </Button>
                                    </form>
                                </div>
                            )
                        )}

                        {/* Owner: invite a new member (by email and/or shared link) */}
                        {isOwner && (
                            <div className="space-y-3 border-t pt-4">
                                <div className="flex items-center gap-2">
                                    <UserPlus className="w-4 h-4 text-nexus-blue" />
                                    <h3 className="text-body font-semibold">{t('family:invite.title')}</h3>
                                </div>
                                <p className="text-body-sm text-muted-foreground">{t('family:invite.desc')}</p>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                    <div className="w-full sm:w-44">
                                        <label className="block text-label font-medium text-foreground mb-1.5">
                                            {t('family:invite.roleLabel')}
                                        </label>
                                        <Select
                                            value={inviteRole}
                                            onValueChange={(value) => setInviteRole(value as 'parent' | 'enfant')}
                                            options={ACCOUNT_ROLES}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-label font-medium text-foreground mb-1.5">
                                            {t('family:invite.emailLabel')}
                                        </label>
                                        <Input
                                            type="email"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            placeholder={t('family:invite.emailPlaceholder')}
                                        />
                                    </div>
                                    <Button
                                        variant="secondary"
                                        onClick={handleGenerateInvite}
                                        disabled={inviteLinkLoading}
                                        className="flex items-center justify-center gap-2"
                                    >
                                        {inviteEmail.trim() ? <Send className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                                        {inviteLinkLoading
                                            ? t('family:invite.generating')
                                            : inviteEmail.trim() ? t('family:invite.send') : t('family:invite.generate')}
                                    </Button>
                                </div>

                                {inviteNotice?.kind === 'sent' && (
                                    <p className="text-body-sm text-green-600">
                                        {t('family:invite.sent', { email: inviteNotice.email })}
                                    </p>
                                )}
                                {inviteNotice?.kind === 'link' && (
                                    <p className="text-body-sm text-amber-600">{t('family:invite.sendFailed')}</p>
                                )}

                                {inviteLink && (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2 p-3 rounded-nexus bg-nexus-blue/5 border border-nexus-blue/20">
                                            <input
                                                readOnly
                                                value={inviteLink}
                                                className="flex-1 bg-transparent text-body-sm text-foreground outline-none truncate"
                                            />
                                            <button
                                                onClick={handleCopyInvite}
                                                className="shrink-0 p-1 rounded hover:bg-nexus-blue/10 transition-colors"
                                                title={t('family:invite.copyTitle')}
                                            >
                                                {copied
                                                    ? <Check className="w-4 h-4 text-green-500" />
                                                    : <Copy className="w-4 h-4 text-nexus-blue" />
                                                }
                                            </button>
                                        </div>
                                        <p className="text-body-sm text-muted-foreground">{t('family:invite.linkHint')}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Member: leave family */}
                        {!isOwner && (
                            <Button
                                variant="ghost"
                                onClick={handleLeaveFamily}
                                disabled={leavingFamily}
                                className="flex items-center gap-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                            >
                                <LogOut className="w-4 h-4" />
                                {leavingFamily ? t('family:leave.leaving') : t('family:leave.leave')}
                            </Button>
                        )}
                    </div>
                );
            })()}

            {/* Dialog */}
            <Dialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                title={editingMember ? t('family:dialog.editTitle') : t('family:dialog.addTitle')}
                description={t('family:dialog.description')}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label={t('family:form.name')}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder={t('family:form.namePlaceholder')}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">{t('family:form.role')}</label>
                            <Select
                                value={formData.role}
                                onValueChange={(value) => setFormData({ ...formData, role: value })}
                                options={ROLES}
                            />
                        </div>
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">{t('family:form.color')}</label>
                            <Select
                                value={formData.color}
                                onValueChange={(value) => setFormData({ ...formData, color: value })}
                                options={colorOptions}
                            />
                        </div>
                    </div>
                    <Input
                        label={t('family:form.birthdate')}
                        type="date"
                        value={formData.birthdate}
                        onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
                    />
                    {/* Owner only: link this profile to one of the family's shared accounts */}
                    {editingMember && isOwner && sharedAccounts.length > 0 && (
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                {t('family:link.label')}
                            </label>
                            <Select
                                value={formData.linked_user_id}
                                onValueChange={(value) => setFormData({ ...formData, linked_user_id: value })}
                                options={[
                                    { value: '', label: t('family:link.none') },
                                    ...sharedAccounts.map((a) => ({ value: a.id, label: `${a.name} (${a.email})` })),
                                ]}
                            />
                            <p className="text-body-sm text-muted-foreground mt-1">{t('family:link.hint')}</p>
                        </div>
                    )}
                    <div className="border-t pt-4">
                        <h4 className="text-body font-semibold mb-3 flex items-center gap-2">
                            <Heart className="h-4 w-4 text-amber-600" />
                            {t('family:form.healthInfo')}
                        </h4>
                        <Input
                            label={t('family:form.allergies')}
                            value={formData.allergies}
                            onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                            placeholder={t('family:form.allergiesPlaceholder')}
                        />
                        <Input
                            label={t('family:form.medications')}
                            value={formData.medications}
                            onChange={(e) => setFormData({ ...formData, medications: e.target.value })}
                            placeholder={t('family:form.medicationsPlaceholder')}
                            className="mt-3"
                        />
                    </div>
                    <div className="border-t pt-4">
                        <h4 className="text-body font-semibold mb-3 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            {t('family:form.emergencyContact')}
                        </h4>
                        <Input
                            label={t('family:form.contactName')}
                            value={formData.emergency_contact_name}
                            onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                            placeholder={t('family:form.contactNamePlaceholder')}
                        />
                        <Input
                            label={t('family:form.contactPhone')}
                            type="tel"
                            value={formData.emergency_contact_phone}
                            onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                            placeholder={t('family:form.contactPhonePlaceholder')}
                            className="mt-3"
                        />
                    </div>
                    <Textarea
                        label={t('family:form.notes')}
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder={t('family:form.notesPlaceholder')}
                        rows={2}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                            {t('common:actions.cancel')}
                        </Button>
                        <Button type="submit">{editingMember ? t('common:actions.save') : t('common:actions.add')}</Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
};

export default Family;
