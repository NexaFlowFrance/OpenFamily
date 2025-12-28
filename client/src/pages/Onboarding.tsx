import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Language, languageNames, languageFlags } from '@/lib/i18n';
import { Sun, Moon, Check, Users, Globe, Palette, ArrowRight, ArrowLeft, Smartphone, Server } from 'lucide-react';
import { RepositoryFactory } from '@/repositories/factory';

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { addFamilyMember } = useApp();
  const [step, setStep] = useState(1);
  const [storageMode, setStorageMode] = useState<'local' | 'server'>('local');
  const [serverUrl, setServerUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [tempMembers, setTempMembers] = useState<Array<{ name: string; color: string }>>([]);
  const [newMemberName, setNewMemberName] = useState('');

  const totalSteps = 4;

  const handleLanguageSelect = (lang: Language) => {
    setLanguage(lang);
  };

  const handleThemeSelect = (selectedTheme: 'light' | 'dark') => {
    setTheme(selectedTheme);
  };

  const handleAddMember = () => {
    if (newMemberName.trim()) {
      const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
      setTempMembers([...tempMembers, { name: newMemberName.trim(), color: randomColor }]);
      setNewMemberName('');
    }
  };

  const handleFinish = () => {
    // Configurer le mode de stockage
    RepositoryFactory.setStorageMode(storageMode, storageMode === 'server' ? {
      apiUrl: serverUrl,
      authToken: authToken || undefined,
      familyId: familyId || undefined,
    } : undefined);

    // Ajouter les membres de la famille
    tempMembers.forEach(member => {
      addFamilyMember({
        name: member.name,
        color: member.color,
        healthInfo: {
          bloodType: '',
          allergies: [],
          vaccinations: [],
          notes: '',
          emergencyContact: { name: '', phone: '', relation: '' },
        },
      });
    });

    // Marquer l'onboarding comme terminé
    localStorage.setItem('openfamily_onboarding_completed', 'true');
    onComplete();
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrevious = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-8 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{t.onboarding.title}</h1>
          <p className="text-muted-foreground">{t.onboarding.subtitle}</p>
        </div>

        {/* Progress */}
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'w-12 bg-primary' : 'w-8 bg-primary/20'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Language */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <Globe className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold">{t.onboarding.selectLanguage}</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(['fr', 'en', 'de', 'es'] as Language[]).map(lang => (
                <Button
                  key={lang}
                  variant={language === lang ? 'default' : 'outline'}
                  size="lg"
                  className="h-20 text-lg justify-start gap-3"
                  onClick={() => handleLanguageSelect(lang)}
                >
                  <span className="text-3xl">{languageFlags[lang]}</span>
                  <span>{languageNames[lang]}</span>
                  {language === lang && <Check className="w-5 h-5 ml-auto" />}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Theme */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <Palette className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold">{t.onboarding.selectTheme}</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="lg"
                className="h-32 flex-col gap-3"
                onClick={() => handleThemeSelect('light')}
              >
                <Sun className="w-12 h-12" />
                <span className="text-lg">{t.onboarding.lightMode}</span>
                {theme === 'light' && <Check className="w-5 h-5 absolute top-3 right-3" />}
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="lg"
                className="h-32 flex-col gap-3"
                onClick={() => handleThemeSelect('dark')}
              >
                <Moon className="w-12 h-12" />
                <span className="text-lg">{t.onboarding.darkMode}</span>
                {theme === 'dark' && <Check className="w-5 h-5 absolute top-3 right-3" />}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Storage Mode */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <Server className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold">{t.onboarding.selectStorageMode}</h2>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <Button
                variant={storageMode === 'local' ? 'default' : 'outline'}
                size="lg"
                className="h-auto flex-col gap-3 p-6 text-left items-start"
                onClick={() => setStorageMode('local')}
              >
                <div className="flex items-center gap-3 w-full">
                  <Smartphone className="w-8 h-8" />
                  <div className="flex-1">
                    <div className="text-lg font-semibold">{t.onboarding.localMode}</div>
                    <div className="text-sm text-muted-foreground mt-1">{t.onboarding.localModeDesc}</div>
                  </div>
                  {storageMode === 'local' && <Check className="w-5 h-5" />}
                </div>
              </Button>
              <Button
                variant={storageMode === 'server' ? 'default' : 'outline'}
                size="lg"
                className="h-auto flex-col gap-3 p-6 text-left items-start"
                onClick={() => setStorageMode('server')}
              >
                <div className="flex items-center gap-3 w-full">
                  <Server className="w-8 h-8" />
                  <div className="flex-1">
                    <div className="text-lg font-semibold">{t.onboarding.serverMode}</div>
                    <div className="text-sm text-muted-foreground mt-1">{t.onboarding.serverModeDesc}</div>
                  </div>
                  {storageMode === 'server' && <Check className="w-5 h-5" />}
                </div>
              </Button>
            </div>

            {storageMode === 'server' && (
              <div className="space-y-4 mt-6 p-4 border rounded-lg bg-card">
                <div>
                  <label className="text-sm font-medium mb-2 block">{t.onboarding.serverUrl}</label>
                  <Input
                    placeholder={t.onboarding.serverUrlPlaceholder}
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">{t.onboarding.authToken}</label>
                  <Input
                    placeholder={t.onboarding.authTokenPlaceholder}
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    type="password"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">{t.onboarding.familyId}</label>
                  <Input
                    placeholder={t.onboarding.familyIdPlaceholder}
                    value={familyId}
                    onChange={(e) => setFamilyId(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Family Members */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <Users className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold">{t.onboarding.addFamilyMembers}</h2>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder={t.onboarding.memberName}
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
              />
              <Button onClick={handleAddMember}>{t.onboarding.addMember}</Button>
            </div>

            {tempMembers.length > 0 && (
              <div className="space-y-2">
                {tempMembers.map((member, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div
                      className="w-8 h-8 rounded-full"
                      style={{ backgroundColor: member.color }}
                    />
                    <span className="font-medium">{member.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setTempMembers(tempMembers.filter((_, i) => i !== index))}
                    >
                      {t.delete}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {tempMembers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-16 h-16 mx-auto mb-3 opacity-50" />
                <p>{t.onboarding.addFamilyMembers}</p>
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={step === 1}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t.onboarding.previous}
          </Button>

          <div className="flex gap-2">
            {step === 4 && (
              <Button variant="ghost" onClick={handleFinish}>
                {t.onboarding.skipForNow}
              </Button>
            )}
            <Button onClick={handleNext}>
              {step === totalSteps ? t.onboarding.finish : t.onboarding.next}
              {step < totalSteps && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
