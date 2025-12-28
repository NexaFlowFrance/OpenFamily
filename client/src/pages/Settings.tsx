import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Language, languageNames, languageFlags } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Trash2, Plus, Moon, Sun, Heart, Bell, Globe, Check, Download, Upload, FileJson } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requestNotificationPermission, getNotificationStatus } from '@/lib/notifications';
import DataSharing from '@/components/DataSharing';
import EncryptionSettings from '@/components/EncryptionSettings';

const COLORS = [
  '#6b8e7f', // Vert sauge (garde 1 vert)
  '#c8dfe8', // Bleu clair
  '#f0d4a8', // Beige/jaune
  '#d97b7b', // Rose/saumon
  '#9b87c7', // Violet/lavande
  '#e8a07b', // Orange corail
  '#7ba5c7', // Bleu gris
  '#c795a8', // Rose poudré
];

export default function Settings() {
  const { 
    familyMembers, addFamilyMember, updateFamilyMember, deleteFamilyMember,
    shoppingItems, tasks, appointments, recipes, meals, budget
  } = useApp();
  const { theme, toggleTheme, actualTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [selectedMemberHealth, setSelectedMemberHealth] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState(getNotificationStatus());
  const [formData, setFormData] = useState({
    name: '',
    role: 'parent' as const,
    color: COLORS[0],
  });

  const handleExportData = () => {
    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: {
        shoppingItems,
        tasks,
        appointments,
        recipes,
        meals,
        budget,
        familyMembers,
      }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openfamily-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const imported = JSON.parse(content);
        
        if (!imported.data) {
          alert('Fichier invalide : structure de données incorrecte');
          return;
        }

        const confirmImport = confirm(
          `Voulez-vous importer les données du ${new Date(imported.exportDate).toLocaleDateString()} ?\n\n` +
          `Cela remplacera toutes vos données actuelles.`
        );

        if (confirmImport) {
          // Recharger la page après avoir importé les données dans localStorage
          localStorage.setItem('openfamily-data', JSON.stringify(imported.data));
          window.location.reload();
        }
      } catch (error) {
        alert('Erreur lors de l\'importation : fichier JSON invalide');
        console.error(error);
      }
    };
    reader.readAsText(file);
  };

  const handleAddMember = () => {
    if (formData.name.trim()) {
      addFamilyMember({
        name: formData.name,
        role: formData.role,
        color: formData.color,
      });
      setFormData({
        name: '',
        role: 'parent',
        color: COLORS[0],
      });
      setShowForm(false);
    }
  };

  return (
    <div className="pb-24">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <h1 className="text-3xl font-bold text-foreground">Paramètres</h1>
      </div>

      {/* Language Section */}
      <div className="p-4 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-foreground mb-4">{t.settings.language}</h2>
          
          <Card className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-5 h-5 text-primary" />
                <h3 className="font-medium text-foreground">{t.settings.language}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['fr', 'en', 'de', 'es'] as Language[]).map(lang => (
                  <Button
                    key={lang}
                    variant={language === lang ? 'default' : 'outline'}
                    className="justify-start gap-2"
                    onClick={() => setLanguage(lang)}
                  >
                    <span className="text-xl">{languageFlags[lang]}</span>
                    <span>{languageNames[lang]}</span>
                    {language === lang && <Check className="w-4 h-4 ml-auto" />}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Appearance Section */}
        <div>
          <h2 className="text-xl font-bold text-foreground mb-4">{t.settings.appearance}</h2>
          
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">{t.settings.theme}</h3>
                <p className="text-sm text-muted-foreground">
                  {theme === 'auto' 
                    ? `Auto (${actualTheme === 'dark' ? t.onboarding.darkMode : t.onboarding.lightMode})`
                    : theme === 'dark' ? t.onboarding.darkMode : t.onboarding.lightMode}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleTheme}
              >
                {theme === 'auto' ? (
                  <div className="relative w-5 h-5">
                    <Sun className="w-5 h-5 absolute top-0 left-0 opacity-50" />
                    <Moon className="w-5 h-5 absolute top-0 left-0 opacity-50" />
                  </div>
                ) : theme === 'dark' ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </Button>
            </div>
          </Card>
        </div>

        {/* Notifications Section */}
        <div>
          <h2 className="text-xl font-bold text-foreground mb-4">Notifications</h2>
          
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Rappels de rendez-vous</h3>
                <p className="text-sm text-muted-foreground">
                  {notificationStatus === 'granted' && 'Activées (30 min avant)'}
                  {notificationStatus === 'denied' && 'Refusées'}
                  {notificationStatus === 'default' && 'Non configurées'}
                  {notificationStatus === 'unsupported' && 'Non supportées'}
                </p>
              </div>
              {notificationStatus !== 'granted' && notificationStatus !== 'unsupported' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const granted = await requestNotificationPermission();
                    setNotificationStatus(getNotificationStatus());
                    if (granted) {
                      alert('Notifications activées ! Vous recevrez des rappels 30 minutes avant vos rendez-vous.');
                    }
                  }}
                >
                  <Bell className="w-4 h-4 mr-2" />
                  Activer
                </Button>
              )}
              {notificationStatus === 'granted' && (
                <Bell className="w-5 h-5 text-green-600" />
              )}
            </div>
          </Card>
        </div>

        {/* Data Management Section */}
        <div>
          <h2 className="text-xl font-bold text-foreground mb-4">Gestion des données</h2>
          
          <Card className="p-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileJson className="w-5 h-5 text-primary" />
                <h3 className="font-medium text-foreground">Sauvegarde et restauration</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Exportez toutes vos données (courses, tâches, rendez-vous, recettes, planning, budget, famille) pour les sauvegarder ou les transférer vers un autre appareil.
              </p>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleExportData}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exporter mes données
                </Button>
                
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => document.getElementById('import-file-input')?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Importer des données
                </Button>
                <input
                  id="import-file-input"
                  type="file"
                  accept=".json"
                  onChange={handleImportData}
                  className="hidden"
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Family Members Section */}
        <div>
          <h2 className="text-xl font-bold text-foreground mb-4">Membres de la famille</h2>
          
          <div className="space-y-3">
            {familyMembers.map(member => (
              <Card key={member.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full"
                      style={{ backgroundColor: member.color || '#6b8e7f' }}
                    />
                    <div>
                      <h3 className="font-medium text-foreground">{member.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {member.role === 'parent' ? 'Parent' : member.role === 'child' ? 'Enfant' : 'Autre'}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Dialog open={selectedMemberHealth === member.id} onOpenChange={(open) => !open && setSelectedMemberHealth(null)}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setSelectedMemberHealth(member.id)}
                        >
                          <Heart className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Santé - {member.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Groupe sanguin</Label>
                            <Input
                              value={member.bloodType || ''}
                              onChange={(e) => updateFamilyMember(member.id, { bloodType: e.target.value })}
                              placeholder="Ex: A+"
                            />
                          </div>
                          <div>
                            <Label>Allergies (une par ligne)</Label>
                            <Textarea
                              value={member.allergies?.join('\n') || ''}
                              onChange={(e) => updateFamilyMember(member.id, { 
                                allergies: e.target.value.split('\n').filter(a => a.trim()) 
                              })}
                              placeholder="Ex: Arachides&#10;Lactose"
                              rows={3}
                            />
                          </div>
                          <div>
                            <Label>Notes médicales</Label>
                            <Textarea
                              value={member.medicalNotes || ''}
                              onChange={(e) => updateFamilyMember(member.id, { medicalNotes: e.target.value })}
                              placeholder="Notes importantes..."
                              rows={4}
                            />
                          </div>
                          <div>
                            <Label>Contact d'urgence - Nom</Label>
                            <Input
                              value={member.emergencyContact?.name || ''}
                              onChange={(e) => updateFamilyMember(member.id, { 
                                emergencyContact: { 
                                  ...member.emergencyContact,
                                  name: e.target.value,
                                  phone: member.emergencyContact?.phone || '',
                                  relation: member.emergencyContact?.relation || ''
                                } 
                              })}
                              placeholder="Nom complet"
                            />
                          </div>
                          <div>
                            <Label>Contact d'urgence - Téléphone</Label>
                            <Input
                              value={member.emergencyContact?.phone || ''}
                              onChange={(e) => updateFamilyMember(member.id, { 
                                emergencyContact: { 
                                  name: member.emergencyContact?.name || '',
                                  phone: e.target.value,
                                  relation: member.emergencyContact?.relation || ''
                                } 
                              })}
                              placeholder="06 XX XX XX XX"
                            />
                          </div>
                          <div>
                            <Label>Contact d'urgence - Relation</Label>
                            <Input
                              value={member.emergencyContact?.relation || ''}
                              onChange={(e) => updateFamilyMember(member.id, { 
                                emergencyContact: { 
                                  name: member.emergencyContact?.name || '',
                                  phone: member.emergencyContact?.phone || '',
                                  relation: e.target.value
                                } 
                              })}
                              placeholder="Ex: Conjoint, Parent"
                            />
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    
                    {familyMembers.length > 1 && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => deleteFamilyMember(member.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Display health info preview */}
                {(member.allergies?.length || member.bloodType) && (
                  <div className="mt-3 pt-3 border-t text-sm space-y-1">
                    {member.bloodType && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">Groupe:</span> {member.bloodType}
                      </p>
                    )}
                    {member.allergies && member.allergies.length > 0 && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">Allergies:</span> {member.allergies.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>

          <Button
            onClick={() => setShowForm(true)}
            variant="outline"
            className="w-full mt-4"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ajouter un membre
          </Button>
        </div>

        {/* App Info Section */}
        <div className="border-t border-border pt-6">
          <h2 className="text-xl font-bold text-foreground mb-4">À propos</h2>
          
          <Card className="p-4 space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Application</p>
              <p className="font-medium text-foreground">
                OpenFamily by{' '}
                <a 
                  href="https://nexaflow.fr" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  NexaFlow
                </a>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Version</p>
              <p className="font-medium text-foreground">1.0.0</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stockage</p>
              <p className="font-medium text-foreground">Local (navigateur)</p>
            </div>
          </Card>
        </div>

        {/* Data Management Section */}
        <div className="border-t border-border pt-6">
          <EncryptionSettings />
        </div>

        {/* Sharing Section */}
        <div className="border-t border-border pt-6 mt-6">
          <DataSharing />
          
          <div className="mt-6">
            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm('Êtes-vous sûr ? Cette action supprimera toutes les données.')) {
                  localStorage.removeItem('openfamily_shopping');
                  localStorage.removeItem('openfamily_tasks');
                  localStorage.removeItem('openfamily_appointments');
                  localStorage.removeItem('openfamily_members');
                  localStorage.removeItem('openfamily_recipes');
                  localStorage.removeItem('openfamily_meals');
                  localStorage.removeItem('openfamily_budgets');
                  window.location.reload();
                }
              }}
            >
              🗑️ Réinitialiser toutes les données
            </Button>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold">Ajouter un membre</h2>

            <div>
              <label className="text-sm font-medium text-foreground">Nom</label>
              <Input
                placeholder="Ex: Marie"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Rôle</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="parent">Parent</option>
                <option value="child">Enfant</option>
                <option value="other">Autre</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Couleur</label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-full h-10 rounded-lg transition-all ${
                      formData.color === color ? 'ring-2 ring-offset-2 ring-primary' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={handleAddMember}
                className="flex-1"
              >
                Ajouter
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
