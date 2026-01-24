import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCurrency, currencies, getCurrencyName } from '@/contexts/CurrencyContext';
import { useNotificationSettings, getNotificationTimings } from '@/hooks/useNotificationSettings';
import { Language, languageNames, languageFlags } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Trash2, Plus, Moon, Sun, Heart, Bell, Globe, Check, DollarSign } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { requestNotificationPermission, getNotificationStatus } from '@/lib/notifications';

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
    shoppingItems, tasks, appointments, recipes, meals
  } = useApp();
  const { theme, toggleTheme, actualTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { currency, setCurrency } = useCurrency();
  const { 
    settings: notificationSettings, 
    toggleAppointmentReminders, 
    toggleAppointmentTiming,
    getEnabledAppointmentTimings,
    isInitialized: notificationsInitialized
  } = useNotificationSettings();
  const [showForm, setShowForm] = useState(false);
  const [selectedMemberHealth, setSelectedMemberHealth] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState(getNotificationStatus());

  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const isSecureContextOrLocalhost = window.isSecureContext || isLocalhost;
  const [formData, setFormData] = useState({
    name: '',
    role: 'parent' as const,
    color: COLORS[0],
  });

  // Mock user ID for notifications (should be replaced with real auth system)
  const userId = 'user-default';

  useEffect(() => {
    setNotificationStatus(getNotificationStatus());
  }, []);

  // Import/export functions removed

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
        <h1 className="text-3xl font-bold text-foreground">{t.settings.title}</h1>
      </div>

      {/* Language Section */}
      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground mb-3">{t.settings.language}</h2>
          
          <Card className="p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">{t.settings.language}</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['fr', 'en', 'de', 'es'] as Language[]).map(lang => (
                  <Button
                    key={lang}
                    variant={language === lang ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start gap-2 h-8"
                    onClick={() => setLanguage(lang)}
                  >
                    <span className="text-base">{languageFlags[lang]}</span>
                    <span className="text-sm">{languageNames[lang]}</span>
                    {language === lang && <Check className="w-3 h-3 ml-auto" />}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Currency Section */}
        <div>
          <h2 className="text-lg font-bold text-foreground mb-3">{t.settings.currency}</h2>
          
          <Card className="p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">{t.settings.defaultCurrency}</h3>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {currencies.map(curr => (
                  <Button
                    key={curr.code}
                    variant={currency.code === curr.code ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start gap-2 h-8 text-sm"
                    onClick={() => setCurrency(curr)}
                  >
                    <span className="text-xs w-6 text-center shrink-0">{curr.symbol}</span>
                    <span className="truncate">{getCurrencyName(curr.code, t)}</span>
                    {currency.code === curr.code && <Check className="w-3 h-3 ml-auto" />}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Appearance Section */}
        <div>
          <h2 className="text-lg font-bold text-foreground mb-3">{t.settings.appearance}</h2>
          
          <Card className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-foreground">{t.settings.theme}</h3>
                <p className="text-sm text-muted-foreground">
                  {theme === 'auto' 
                    ? `Auto (${actualTheme === 'dark' ? t.onboarding.darkMode : t.onboarding.lightMode})`
                    : theme === 'dark' ? t.onboarding.darkMode : t.onboarding.lightMode}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleTheme}
                className="h-8 w-8 p-0"
              >
                {theme === 'auto' ? (
                  <div className="relative w-4 h-4">
                    <Sun className="w-4 h-4 absolute top-0 left-0 opacity-50" />
                    <Moon className="w-4 h-4 absolute top-0 left-0 opacity-50" />
                  </div>
                ) : theme === 'dark' ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </Button>
            </div>
          </Card>
        </div>

        {/* Notifications Section */}
        <div>
          <h2 className="text-lg font-bold text-foreground mb-3">{t.settings.notifications}</h2>
          
          <Card className="p-3 space-y-4">
            {!isSecureContextOrLocalhost && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium text-foreground">{t.settings.httpsRequiredTitle}</p>
                <p className="text-sm text-muted-foreground">{t.settings.httpsRequiredDesc}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {t.settings.currentProtocol}: <span className="font-medium">{window.location.protocol}</span>
                </p>
              </div>
            )}

            {/* Activation générale */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-foreground">{t.settings.permissions}</h3>
                <p className="text-sm text-muted-foreground">
                  {notificationStatus === 'granted' && t.settings.granted}
                  {notificationStatus === 'denied' && t.settings.denied}
                  {notificationStatus === 'default' && t.settings.notConfigured}
                  {notificationStatus === 'unsupported' && t.settings.unsupported}
                </p>
              </div>
              {notificationStatus !== 'granted' && notificationStatus !== 'unsupported' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!isSecureContextOrLocalhost) {
                      alert(t.settings.httpsRequiredDesc);
                      return;
                    }
                    const granted = await requestNotificationPermission();
                    setNotificationStatus(getNotificationStatus());
                    if (granted) {
                      alert(t.settings.activatedMessage);
                    }
                  }}
                  className="h-8"
                  disabled={!isSecureContextOrLocalhost}
                >
                  <Bell className="w-4 h-4 mr-2" />
                  {t.settings.activate}
                </Button>
              )}
              {notificationStatus === 'granted' && (
                <Bell className="w-5 h-5 text-green-600" />
              )}
            </div>

            {/* Configuration des rappels de rendez-vous */}
            {notificationStatus === 'granted' && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">{t.settings.appointmentReminders}</h3>
                    <p className="text-sm text-muted-foreground">
                      {notificationSettings.appointmentReminders.enabled
                        ? `${getEnabledAppointmentTimings().length} ${t.settings.timingsConfigured}`
                        : t.settings.disabled
                      }
                    </p>
                  </div>
                  <Switch
                    checked={notificationSettings.appointmentReminders.enabled}
                    onCheckedChange={(enabled) => toggleAppointmentReminders(enabled, userId)}
                  />
                </div>

                {/* Options de délais */}
                {notificationSettings.appointmentReminders.enabled && (
                  <div className="ml-4 space-y-2">
                    <p className="text-xs text-muted-foreground mb-2">
                      {t.settings.chooseWhen}
                    </p>
                    {getNotificationTimings(t).map(timing => {
                      const currentTiming = notificationSettings.appointmentReminders.timings.find(t => t.id === timing.id);
                      return (
                        <div key={timing.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`timing-${timing.id}`}
                            checked={currentTiming?.enabled || false}
                            onCheckedChange={(checked) => 
                              toggleAppointmentTiming(timing.id, checked as boolean)
                            }
                          />
                          <Label
                            htmlFor={`timing-${timing.id}`}
                            className="text-sm text-foreground cursor-pointer"
                          >
                            {timing.label}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Section de gestion des données supprimée */}

        {/* Family Members Section */}
        <div>
          <h2 className="text-lg font-bold text-foreground mb-3">{t.settings.familyMembers}</h2>
          
          <div className="space-y-2">
            {familyMembers.map(member => (
              <Card key={member.id} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full"
                      style={{ backgroundColor: member.color || '#6b8e7f' }}
                    />
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{member.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {member.role === 'parent' ? t.settings.parent : member.role === 'child' ? t.settings.child : t.settings.other}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Dialog open={selectedMemberHealth === member.id} onOpenChange={(open) => !open && setSelectedMemberHealth(null)}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setSelectedMemberHealth(member.id)}
                        >
                          <Heart className="w-3 h-3" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{t.settings.health} - {member.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>{t.settings.bloodGroup}</Label>
                            <Input
                              defaultValue={member.bloodType || ''}
                              onBlur={(e) => updateFamilyMember(member.id, { bloodType: e.target.value })}
                              placeholder={t.settings.bloodGroupPlaceholder}
                            />
                          </div>
                          <div>
                            <Label>{t.settings.allergies}</Label>
                            <Textarea
                              defaultValue={member.allergies?.join('\n') || ''}
                              onBlur={(e) => updateFamilyMember(member.id, { 
                                allergies: e.target.value.split('\n').filter(a => a.trim()) 
                              })}
                              placeholder={t.settings.allergiesPlaceholder}
                              rows={3}
                            />
                          </div>
                          <div>
                            <Label>{t.settings.medicalNotes}</Label>
                            <Textarea
                              defaultValue={member.medicalNotes || ''}
                              onBlur={(e) => updateFamilyMember(member.id, { medicalNotes: e.target.value })}
                              placeholder={t.settings.medicalNotesPlaceholder}
                              rows={4}
                            />
                          </div>
                          <div>
                            <Label>{t.settings.emergencyContactName}</Label>
                            <Input
                              defaultValue={member.emergencyContact?.name || ''}
                              onBlur={(e) => updateFamilyMember(member.id, { 
                                emergencyContact: { 
                                  ...member.emergencyContact,
                                  name: e.target.value,
                                  phone: member.emergencyContact?.phone || '',
                                  relation: member.emergencyContact?.relation || ''
                                } 
                              })}
                              placeholder={t.settings.fullName}
                            />
                          </div>
                          <div>
                            <Label>{t.settings.emergencyContactPhone}</Label>
                            <Input
                              defaultValue={member.emergencyContact?.phone || ''}
                              onBlur={(e) => updateFamilyMember(member.id, { 
                                emergencyContact: { 
                                  name: member.emergencyContact?.name || '',
                                  phone: e.target.value,
                                  relation: member.emergencyContact?.relation || ''
                                } 
                              })}
                              placeholder={t.settings.phonePlaceholder}
                            />
                          </div>
                          <div>
                            <Label>{t.settings.emergencyContactRelation}</Label>
                            <Input
                              defaultValue={member.emergencyContact?.relation || ''}
                              onBlur={(e) => updateFamilyMember(member.id, { 
                                emergencyContact: { 
                                  name: member.emergencyContact?.name || '',
                                  phone: member.emergencyContact?.phone || '',
                                  relation: e.target.value
                                } 
                              })}
                              placeholder={t.settings.relationPlaceholder}
                            />
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    
                    {familyMembers.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteFamilyMember(member.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
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
                        <span className="font-medium">{t.settings.group}:</span> {member.bloodType}
                      </p>
                    )}
                    {member.allergies && member.allergies.length > 0 && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">{t.settings.allergies}:</span> {member.allergies.join(', ')}
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
            {t.settings.addMember}
          </Button>
        </div>

        {/* App Info Section */}
        <div className="border-t border-border pt-6">
          <h2 className="text-xl font-bold text-foreground mb-4">{t.settings.about}</h2>
          
          <Card className="p-4 space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{t.settings.application}</p>
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
              <p className="text-sm text-muted-foreground">{t.settings.version}</p>
              <p className="font-medium text-foreground">1.0.2</p>
            </div>
          </Card>
        </div>

        {/* Sections de gestion et réinitialisation des données supprimées */}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold">{t.settings.addMember}</h2>

            <div>
              <label className="text-sm font-medium text-foreground">{t.settings.name}</label>
              <Input
                placeholder={t.settings.namePlaceholder}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.settings.role}</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                className="w-full mt-1 p-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="parent">{t.settings.parent}</option>
                <option value="child">{t.settings.child}</option>
                <option value="other">{t.settings.other}</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.settings.color}</label>
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
                {t.cancel}
              </Button>
              <Button
                onClick={handleAddMember}
                className="flex-1"
              >
                {t.add}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
