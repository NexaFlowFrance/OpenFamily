import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import {
    Plus,
    Edit2,
    Trash2,
    User,
    Phone,
    Heart,
    AlertTriangle,
    Utensils,
    Mail,
    KeyRound,
} from 'lucide-react';
import {
    Card,
    CardContent,
    Button,
    Dialog,
    Input,
    Select,
    Textarea,
    Badge,
} from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_FAMILY_COLOR, FAMILY_COLOR_PRESETS } from '../design/colorPresets';

interface DietaryPreferencesShape {
    regime?: string;
    spice_level?: string;
    dislikes?: string[];
    favorites?: string[];
    notes?: string;
}

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
    dietary_preferences?: DietaryPreferencesShape;
    email?: string | null;
    has_account?: boolean;
}

// Shape of the optional `account` block returned by POST /api/family and
// POST /api/family/:id/invite. The temporary password is only present when the
// email could not be delivered (so the owner can relay it manually).
interface AccountResult {
    email: string;
    emailDelivered: boolean;
    temporaryPassword?: string;
}

// Stored DATA values — labels are resolved at render time via i18n.
const ROLE_VALUES = ['Parent', 'Enfant', 'Etudiant', 'Autre'] as const;
const REGIME_VALUES = [
    '',
    'omnivore',
    'vegetarian',
    'vegan',
    'halal',
    'kosher',
    'no_pork',
] as const;
const SPICE_VALUES = ['', 'none', 'mild', 'medium', 'hot'] as const;

const Family: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    // Owners (no family_owner_id) manage the family; invited members only view it.
    const isOwner = !user?.family_owner_id;
    const roleOptions = ROLE_VALUES.map((value) => ({
        value,
        label: t('family.roles.' + value, { defaultValue: value }),
    }));
    const regimeOptions = REGIME_VALUES.map((value) => ({
        value,
        label: value
            ? t('family.regimes.' + value, { defaultValue: value })
            : t('family.regimes.unspecified'),
    }));
    const spiceOptions = SPICE_VALUES.map((value) => ({
        value,
        label: value
            ? t('family.spice.' + value, { defaultValue: value })
            : t('family.spice.unspecified'),
    }));
    const [members, setMembers] = useState<FamilyMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
    const [error, setError] = useState('');

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
        diet_regime: '',
        diet_spice: '',
        diet_dislikes: '',
        diet_favorites: '',
        has_account: false,
        email: '',
    });

    // Invite dialog (give an existing member a login, or resend their password).
    const [inviteMember, setInviteMember] = useState<FamilyMember | null>(null);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState('');
    // Shown after a successful invite so the owner can relay a temp password that
    // could not be emailed.
    const [accountResult, setAccountResult] = useState<AccountResult | null>(null);

    useEffect(() => {
        loadMembers();
    }, []);

    const loadMembers = async () => {
        try {
            const response = await api.get<{ success: boolean; data: FamilyMember[] }>(
                '/api/family',
            );
            if (response.success) {
                setMembers(response.data);
            }
        } catch (error) {
            console.error('Failed to load family members:', error);
            setError(error instanceof Error ? error.message : t('family.errors.load'));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const splitCsv = (s: string) =>
                s
                    ? s
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean)
                    : [];

            const dietary_preferences: DietaryPreferencesShape = {};
            if (formData.diet_regime) dietary_preferences.regime = formData.diet_regime;
            if (formData.diet_spice) dietary_preferences.spice_level = formData.diet_spice;
            const dislikes = splitCsv(formData.diet_dislikes);
            if (dislikes.length) dietary_preferences.dislikes = dislikes;
            const favorites = splitCsv(formData.diet_favorites);
            if (favorites.length) dietary_preferences.favorites = favorites;

            const payload = {
                ...formData,
                allergies: splitCsv(formData.allergies),
                medications: splitCsv(formData.medications),
                birthdate: formData.birthdate || null,
                emergency_contact_name: formData.emergency_contact_name || null,
                emergency_contact_phone: formData.emergency_contact_phone || null,
                notes: formData.notes || null,
                dietary_preferences,
            };

            if (editingMember) {
                await api.put(`/api/family/${editingMember.id}`, payload);
            } else {
                const res = await api.post<{
                    success: boolean;
                    data: FamilyMember;
                    account?: AccountResult;
                }>('/api/family', payload);
                if (res.account) {
                    setAccountResult(res.account);
                }
            }
            setDialogOpen(false);
            resetForm();
            loadMembers();
        } catch (error) {
            console.error('Failed to save family member:', error);
            setError(error instanceof Error ? error.message : t('family.errors.save'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('family.confirm_delete'))) return;
        try {
            await api.delete(`/api/family/${id}`);
            loadMembers();
        } catch (error) {
            console.error('Failed to delete family member:', error);
            setError(error instanceof Error ? error.message : t('family.errors.delete'));
        }
    };

    const handleEdit = (member: FamilyMember) => {
        setEditingMember(member);
        const diet = member.dietary_preferences ?? {};
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
            diet_regime: diet.regime || '',
            diet_spice: diet.spice_level || '',
            diet_dislikes: diet.dislikes?.join(', ') || '',
            diet_favorites: diet.favorites?.join(', ') || '',
            // Account is managed from the card (invite/resend), not the edit form.
            has_account: member.has_account ?? false,
            email: member.email ?? '',
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
            diet_regime: '',
            diet_spice: '',
            diet_dislikes: '',
            diet_favorites: '',
            has_account: false,
            email: '',
        });
    };

    const openInvite = (member: FamilyMember) => {
        setInviteMember(member);
        setInviteEmail(member.email ?? '');
        setInviteError('');
    };

    const handleInvite = async () => {
        if (!inviteMember) return;
        setInviteError('');
        setInviteLoading(true);
        try {
            // Resend reuses the stored email server-side; first invite needs one.
            const body = inviteMember.has_account ? {} : { email: inviteEmail.trim() };
            const res = await api.post<{
                success: boolean;
                data: FamilyMember;
                account?: AccountResult;
            }>(`/api/family/${inviteMember.id}/invite`, body);
            setInviteMember(null);
            if (res.account) {
                setAccountResult(res.account);
            }
            loadMembers();
        } catch (error) {
            setInviteError(error instanceof Error ? error.message : t('family.errors.invite'));
        } finally {
            setInviteLoading(false);
        }
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
                    <p className="text-muted-foreground font-medium animate-pulse">
                        {t('family.loading')}
                    </p>
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
                    <h1 className="text-h1 mb-1">{t('family.title')}</h1>
                    <p className="text-muted-foreground text-body">{t('family.subtitle')}</p>
                </div>
                {isOwner && (
                    <Button
                        onClick={() => {
                            resetForm();
                            setDialogOpen(true);
                        }}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('family.add_member')}
                    </Button>
                )}
            </div>

            {members.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <User className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <p className="text-muted-foreground">{t('family.empty')}</p>
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
                                        <h3 className="text-body font-semibold truncate">
                                            {member.name}
                                        </h3>
                                        <Badge variant="primary" className="mt-1">
                                            {t('family.roles.' + member.role, {
                                                defaultValue: member.role,
                                            })}
                                        </Badge>
                                        {member.birthdate && (
                                            <p className="text-body-sm text-muted-foreground mt-1">
                                                {t('family.card.age', {
                                                    count: calculateAge(member.birthdate),
                                                })}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Health Information */}
                                {(member.allergies && member.allergies.length > 0) ||
                                (member.medications && member.medications.length > 0) ? (
                                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Heart className="h-4 w-4 text-amber-600" />
                                            <span className="text-label font-semibold text-amber-900">
                                                {t('family.card.health')}
                                            </span>
                                        </div>
                                        {member.allergies && member.allergies.length > 0 && (
                                            <div className="mb-2">
                                                <p className="text-[11px] font-medium text-amber-900 mb-1">
                                                    {t('family.card.allergies')}
                                                </p>
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
                                                <p className="text-[11px] font-medium text-amber-900 mb-1">
                                                    {t('family.card.medications')}
                                                </p>
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
                                            <span className="text-label font-semibold text-red-900">
                                                {t('family.card.emergency_contact')}
                                            </span>
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
                                        <p className="text-body-sm text-muted-foreground">
                                            {member.notes}
                                        </p>
                                    </div>
                                )}

                                {/* Account status — visible to everyone */}
                                <div className="flex items-center gap-2 mb-3">
                                    {member.has_account ? (
                                        <Badge variant="success">
                                            <KeyRound className="h-3 w-3 mr-1" />
                                            {t('family.account.active')}
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary">
                                            {t('family.account.none')}
                                        </Badge>
                                    )}
                                </div>

                                {/* Actions — owner only */}
                                {isOwner && (
                                    <div className="flex flex-col gap-2 pt-2 border-t">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => openInvite(member)}
                                            className="w-full"
                                        >
                                            {member.has_account ? (
                                                <>
                                                    <Mail className="h-4 w-4 mr-1" />
                                                    {t('family.account.resend')}
                                                </>
                                            ) : (
                                                <>
                                                    <KeyRound className="h-4 w-4 mr-1" />
                                                    {t('family.account.give_access')}
                                                </>
                                            )}
                                        </Button>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleEdit(member)}
                                                className="flex-1"
                                            >
                                                <Edit2 className="h-4 w-4 mr-1" />
                                                {t('common.edit')}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(member.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Dialog */}
            <Dialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                title={editingMember ? t('family.form.edit_title') : t('family.form.new_title')}
                description={t('family.form.description')}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label={t('family.form.name')}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder={t('family.form.name_placeholder')}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                {t('family.form.role')}
                            </label>
                            <Select
                                value={formData.role}
                                onValueChange={(value) => setFormData({ ...formData, role: value })}
                                options={roleOptions}
                            />
                        </div>
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">
                                {t('family.form.color')}
                            </label>
                            <Select
                                value={formData.color}
                                onValueChange={(value) =>
                                    setFormData({ ...formData, color: value })
                                }
                                options={FAMILY_COLOR_PRESETS}
                            />
                        </div>
                    </div>
                    <Input
                        label={t('family.form.birthdate')}
                        type="date"
                        value={formData.birthdate}
                        onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
                    />
                    <div className="border-t pt-4">
                        <h4 className="text-body font-semibold mb-3 flex items-center gap-2">
                            <Heart className="h-4 w-4 text-amber-600" />
                            {t('family.form.health_section')}
                        </h4>
                        <Input
                            label={t('family.form.allergies')}
                            value={formData.allergies}
                            onChange={(e) =>
                                setFormData({ ...formData, allergies: e.target.value })
                            }
                            placeholder={t('family.form.allergies_placeholder')}
                        />
                        <Input
                            label={t('family.form.medications')}
                            value={formData.medications}
                            onChange={(e) =>
                                setFormData({ ...formData, medications: e.target.value })
                            }
                            placeholder={t('family.form.medications_placeholder')}
                            className="mt-3"
                        />
                    </div>
                    <div className="border-t pt-4">
                        <h4 className="text-body font-semibold mb-3 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            {t('family.form.emergency_section')}
                        </h4>
                        <Input
                            label={t('family.form.contact_name')}
                            value={formData.emergency_contact_name}
                            onChange={(e) =>
                                setFormData({ ...formData, emergency_contact_name: e.target.value })
                            }
                            placeholder={t('family.form.contact_name_placeholder')}
                        />
                        <Input
                            label={t('family.form.contact_phone')}
                            type="tel"
                            value={formData.emergency_contact_phone}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    emergency_contact_phone: e.target.value,
                                })
                            }
                            placeholder={t('family.form.contact_phone_placeholder')}
                            className="mt-3"
                        />
                    </div>
                    <div className="border-t pt-4">
                        <h4 className="text-body font-semibold mb-3 flex items-center gap-2">
                            <Utensils className="h-4 w-4 text-primary" />
                            {t('family.form.dietary_section')}
                            <span className="text-label-sm font-normal text-muted-foreground">
                                {t('family.form.dietary_hint')}
                            </span>
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-label font-medium text-foreground mb-1.5">
                                    {t('family.form.regime')}
                                </label>
                                <Select
                                    value={formData.diet_regime}
                                    onValueChange={(value) =>
                                        setFormData({ ...formData, diet_regime: value })
                                    }
                                    options={regimeOptions}
                                />
                            </div>
                            <div>
                                <label className="block text-label font-medium text-foreground mb-1.5">
                                    {t('family.form.spice_level')}
                                </label>
                                <Select
                                    value={formData.diet_spice}
                                    onValueChange={(value) =>
                                        setFormData({ ...formData, diet_spice: value })
                                    }
                                    options={spiceOptions}
                                />
                            </div>
                        </div>
                        <Input
                            label={t('family.form.dislikes')}
                            value={formData.diet_dislikes}
                            onChange={(e) =>
                                setFormData({ ...formData, diet_dislikes: e.target.value })
                            }
                            placeholder={t('family.form.dislikes_placeholder')}
                            className="mt-3"
                        />
                        <Input
                            label={t('family.form.favorites')}
                            value={formData.diet_favorites}
                            onChange={(e) =>
                                setFormData({ ...formData, diet_favorites: e.target.value })
                            }
                            placeholder={t('family.form.favorites_placeholder')}
                            className="mt-3"
                        />
                    </div>
                    <Textarea
                        label={t('family.form.notes')}
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder={t('family.form.notes_placeholder')}
                        rows={2}
                    />

                    {/* Account — only when creating. Existing members get a login
                        via the "give access" action on their card. */}
                    {!editingMember && (
                        <div className="border-t pt-4">
                            <h4 className="text-body font-semibold mb-3 flex items-center gap-2">
                                <KeyRound className="h-4 w-4 text-primary" />
                                {t('family.form.account_section')}
                            </h4>
                            <label className="flex cursor-pointer items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={formData.has_account}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            has_account: e.target.checked,
                                        })
                                    }
                                    className="h-4 w-4 rounded border-border accent-primary"
                                />
                                <span className="text-caption text-foreground">
                                    {t('family.form.has_account')}
                                </span>
                            </label>
                            {formData.has_account && (
                                <Input
                                    label={t('family.form.email')}
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) =>
                                        setFormData({ ...formData, email: e.target.value })
                                    }
                                    placeholder={t('family.form.email_placeholder')}
                                    className="mt-3"
                                    required
                                />
                            )}
                            <p className="mt-2 text-micro text-muted-foreground">
                                {t('family.form.account_hint')}
                            </p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setDialogOpen(false)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit">
                            {editingMember ? t('common.save') : t('family.form.add')}
                        </Button>
                    </div>
                </form>
            </Dialog>

            {/* Invite / resend dialog */}
            <Dialog
                open={!!inviteMember}
                onOpenChange={(open) => {
                    if (!open) setInviteMember(null);
                }}
                title={
                    inviteMember?.has_account
                        ? t('family.invite.resend_title')
                        : t('family.invite.title')
                }
                description={t('family.invite.description', { name: inviteMember?.name ?? '' })}
            >
                <div className="space-y-4">
                    {!inviteMember?.has_account && (
                        <Input
                            label={t('family.form.email')}
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder={t('family.form.email_placeholder')}
                            required
                        />
                    )}
                    {inviteError && <p className="text-caption text-danger">{inviteError}</p>}
                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setInviteMember(null)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleInvite}
                            disabled={
                                inviteLoading || (!inviteMember?.has_account && !inviteEmail.trim())
                            }
                        >
                            {inviteMember?.has_account
                                ? t('family.account.resend')
                                : t('family.account.give_access')}
                        </Button>
                    </div>
                </div>
            </Dialog>

            {/* Account result — surfaces the temp password when it couldn't be emailed */}
            <Dialog
                open={!!accountResult}
                onOpenChange={(open) => {
                    if (!open) setAccountResult(null);
                }}
                title={t('family.account.result_title')}
                description={
                    accountResult?.emailDelivered
                        ? t('family.account.result_sent', { email: accountResult?.email ?? '' })
                        : t('family.account.result_manual')
                }
            >
                <div className="space-y-4">
                    {accountResult && !accountResult.emailDelivered && (
                        <div className="rounded-input border border-warning/30 bg-warning/10 p-3 text-caption">
                            <p className="mb-2 text-foreground">
                                {t('family.account.temp_password_label')}
                            </p>
                            <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-foreground">
                                {accountResult.temporaryPassword}
                            </code>
                            <p className="mt-2 text-micro text-muted-foreground">
                                {t('family.account.email_label', {
                                    email: accountResult.email,
                                })}
                            </p>
                        </div>
                    )}
                    <div className="flex justify-end pt-2">
                        <Button type="button" onClick={() => setAccountResult(null)}>
                            {t('common.close')}
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
};

export default Family;
