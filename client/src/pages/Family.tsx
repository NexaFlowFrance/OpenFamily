import React, { useEffect, useState } from 'react';
import { useWebSocketUpdates } from '../hooks/useWebSocketUpdates';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { Plus, Edit2, Trash2, User, Phone, Heart, AlertTriangle, Users, Link2, Copy, LogOut, Crown, UserX, Check } from 'lucide-react';
import { Card, CardContent, Button, Dialog, Input, Select, Textarea, Badge } from '../components/ui';
import { DEFAULT_FAMILY_COLOR, FAMILY_COLOR_PRESETS } from '../design/colorPresets';

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
}

const ROLES = [
    { value: 'Parent', label: 'Parent' },
    { value: 'Enfant', label: 'Enfant' },
    { value: 'Etudiant', label: 'Etudiant' },
    { value: 'Autre', label: 'Autre' },
];

interface SharedAccount {
    id: string;
    name: string;
    email: string;
    is_owner: boolean;
}

const Family: React.FC = () => {
    const { user, leaveFamily } = useAuth();
    const [members, setMembers] = useState<FamilyMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
    const [error, setError] = useState('');

    // Shared accounts state
    const [sharedAccounts, setSharedAccounts] = useState<SharedAccount[]>([]);
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [inviteLinkLoading, setInviteLinkLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [leavingFamily, setLeavingFamily] = useState(false);

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
    });

    useEffect(() => {
        loadMembers();
        loadSharedAccounts();
    }, []);
    useWebSocketUpdates('family', () => { void loadMembers(); });

    const loadMembers = async () => {
        try {
            const response = await api.get<{ success: boolean; data: FamilyMember[] }>('/api/family');
            if (response.success) {
                setMembers(response.data);
            }
        } catch (error) {
            console.error('Failed to load family members:', error);
            setError(error instanceof Error ? error.message : 'Impossible de charger la famille.');
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
            // Silently ignore — non-blocking
        }
    };

    const handleGenerateInvite = async () => {
        setInviteLinkLoading(true);
        try {
            const response = await api.post<{ success: boolean; data: { token: string } }>('/api/invites', {});
            if (response.success && response.data) {
                const baseUrl = window.location.origin;
                setInviteLink(`${baseUrl}/join?invite=${response.data.token}`);
            }
        } catch {
            setError('Impossible de créer un lien d\'invitation.');
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

    const handleKickMember = async (userId: string) => {
        if (!confirm('Retirer ce compte de la famille ?')) return;
        try {
            await api.delete(`/api/invites/members/${userId}`);
            await loadSharedAccounts();
        } catch {
            setError('Impossible de retirer ce membre.');
        }
    };

    const handleLeaveFamily = async () => {
        if (!confirm('Quitter la famille partagée ? Vous retrouverez vos propres données.')) return;
        setLeavingFamily(true);
        try {
            await leaveFamily();
            setSharedAccounts([]);
        } catch {
            setError('Impossible de quitter la famille.');
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
            } else {
                await api.post('/api/family', payload);
            }
            setDialogOpen(false);
            resetForm();
            loadMembers();
        } catch (error) {
            console.error('Failed to save family member:', error);
            setError(error instanceof Error ? error.message : 'Impossible d’enregistrer ce membre.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce membre de la famille ?')) return;
        try {
            await api.delete(`/api/family/${id}`);
            loadMembers();
        } catch (error) {
            console.error('Failed to delete family member:', error);
            setError(error instanceof Error ? error.message : 'Impossible de supprimer ce membre.');
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
                    <p className="text-muted-foreground font-medium animate-pulse">Chargement de la famille...</p>
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
                    <h1 className="text-h1 mb-1">Famille</h1>
                    <p className="text-muted-foreground text-body">Gérez les membres de votre famille</p>
                </div>
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter un membre
                </Button>
            </div>

            {members.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <User className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <p className="text-muted-foreground">Aucun membre de la famille. Ajoutez votre premier membre !</p>
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
                                            {member.role}
                                        </Badge>
                                        {member.birthdate && (
                                            <p className="text-body-sm text-muted-foreground mt-1">
                                                {calculateAge(member.birthdate)} ans
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Health Information */}
                                {(member.allergies && member.allergies.length > 0) || (member.medications && member.medications.length > 0) ? (
                                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Heart className="h-4 w-4 text-amber-600" />
                                            <span className="text-label font-semibold text-amber-900">Santé</span>
                                        </div>
                                        {member.allergies && member.allergies.length > 0 && (
                                            <div className="mb-2">
                                                <p className="text-[11px] font-medium text-amber-900 mb-1">Allergies:</p>
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
                                                <p className="text-[11px] font-medium text-amber-900 mb-1">Médicaments:</p>
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
                                            <span className="text-label font-semibold text-red-900">Contact d'urgence</span>
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
                                        Modifier
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
                const currentAccount = sharedAccounts.find((a) => a.id === user?.id);
                const isOwner = currentAccount?.is_owner ?? true;

                return (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-nexus-blue" />
                            <h2 className="text-h2">Comptes partagés</h2>
                        </div>
                        <p className="text-body-sm text-muted-foreground">
                            Partagez l'accès à vos données familiales avec d'autres comptes.
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
                                                        <span className="ml-2 text-label-sm text-muted-foreground">(vous)</span>
                                                    )}
                                                </p>
                                                <p className="text-body-sm text-muted-foreground truncate">{account.email}</p>
                                            </div>
                                            <Badge variant={account.is_owner ? 'primary' : 'default'}>
                                                {account.is_owner ? 'Propriétaire' : 'Membre'}
                                            </Badge>
                                            {/* Owner can kick non-owner members (except themselves) */}
                                            {isOwner && !account.is_owner && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleKickMember(account.id)}
                                                    title="Retirer ce compte"
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
                                    Aucun autre compte ne partage encore cette famille.
                                </CardContent>
                            </Card>
                        )}

                        {/* Owner: generate invite */}
                        {isOwner && (
                            <div className="space-y-3">
                                <Button
                                    variant="secondary"
                                    onClick={handleGenerateInvite}
                                    disabled={inviteLinkLoading}
                                    className="flex items-center gap-2"
                                >
                                    <Link2 className="w-4 h-4" />
                                    {inviteLinkLoading ? 'Génération…' : 'Générer un lien d\'invitation'}
                                </Button>

                                {inviteLink && (
                                    <div className="flex items-center gap-2 p-3 rounded-nexus bg-nexus-blue/5 border border-nexus-blue/20">
                                        <input
                                            readOnly
                                            value={inviteLink}
                                            className="flex-1 bg-transparent text-body-sm text-foreground outline-none truncate"
                                        />
                                        <button
                                            onClick={handleCopyInvite}
                                            className="shrink-0 p-1 rounded hover:bg-nexus-blue/10 transition-colors"
                                            title="Copier"
                                        >
                                            {copied
                                                ? <Check className="w-4 h-4 text-green-500" />
                                                : <Copy className="w-4 h-4 text-nexus-blue" />
                                            }
                                        </button>
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
                                {leavingFamily ? 'Départ en cours…' : 'Quitter la famille partagée'}
                            </Button>
                        )}
                    </div>
                );
            })()}

            {/* Dialog */}
            <Dialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                title={editingMember ? 'Modifier le membre' : 'Ajouter un membre'}
                description="Remplissez les informations du membre de la famille"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Nom"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder="Ex: Marie Dupont"
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">Rôle</label>
                            <Select
                                value={formData.role}
                                onValueChange={(value) => setFormData({ ...formData, role: value })}
                                options={ROLES}
                            />
                        </div>
                        <div>
                            <label className="block text-label font-medium text-foreground mb-1.5">Couleur</label>
                            <Select
                                value={formData.color}
                                onValueChange={(value) => setFormData({ ...formData, color: value })}
                                options={FAMILY_COLOR_PRESETS}
                            />
                        </div>
                    </div>
                    <Input
                        label="Date de naissance (optionnel)"
                        type="date"
                        value={formData.birthdate}
                        onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
                    />
                    <div className="border-t pt-4">
                        <h4 className="text-body font-semibold mb-3 flex items-center gap-2">
                            <Heart className="h-4 w-4 text-amber-600" />
                            Informations de santé
                        </h4>
                        <Input
                            label="Allergies (séparées par des virgules)"
                            value={formData.allergies}
                            onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                            placeholder="Ex: Arachides, Lactose"
                        />
                        <Input
                            label="Médicaments (séparés par des virgules)"
                            value={formData.medications}
                            onChange={(e) => setFormData({ ...formData, medications: e.target.value })}
                            placeholder="Ex: Aspirine, Insuline"
                            className="mt-3"
                        />
                    </div>
                    <div className="border-t pt-4">
                        <h4 className="text-body font-semibold mb-3 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            Contact d'urgence
                        </h4>
                        <Input
                            label="Nom du contact"
                            value={formData.emergency_contact_name}
                            onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                            placeholder="Ex: Jean Dupont"
                        />
                        <Input
                            label="Téléphone du contact"
                            type="tel"
                            value={formData.emergency_contact_phone}
                            onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                            placeholder="Ex: +33 6 12 34 56 78"
                            className="mt-3"
                        />
                    </div>
                    <Textarea
                        label="Notes (optionnel)"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Notes supplémentaires..."
                        rows={2}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                            Annuler
                        </Button>
                        <Button type="submit">{editingMember ? 'Enregistrer' : 'Ajouter'}</Button>
                    </div>
                </form>
            </Dialog>
        </div>
    );
};

export default Family;
