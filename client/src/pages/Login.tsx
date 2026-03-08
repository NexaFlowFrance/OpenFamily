import { useState, useEffect, useRef } from 'react';
import { useAuth, LoginMember } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, ArrowLeft, Users } from 'lucide-react';

export default function Login() {
  const { login, fetchLoginMembers } = useAuth();
  const { t } = useLanguage();
  const [members, setMembers] = useState<LoginMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<LoginMember | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadMembers = async () => {
      const result = await fetchLoginMembers();
      setMembers(result);
      setLoading(false);
    };
    loadMembers();
  }, [fetchLoginMembers]);

  useEffect(() => {
    if (selectedMember?.hasPin && pinInputRef.current) {
      pinInputRef.current.focus();
    }
  }, [selectedMember]);

  const handleSelectMember = async (member: LoginMember) => {
    setError('');
    setPin('');
    
    if (!member.hasPin) {
      // Direct login without PIN
      setLoggingIn(true);
      const result = await login(member.id);
      if (!result.success) {
        setError(result.error || t.login.error);
      }
      setLoggingIn(false);
    } else {
      setSelectedMember(member);
    }
  };

  const handlePinSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedMember || !pin) return;
    
    setLoggingIn(true);
    setError('');
    const result = await login(selectedMember.id, pin);
    if (!result.success) {
      setError(result.error === 'Invalid PIN' ? t.login.wrongPin : (result.error || t.login.error));
      setPin('');
    }
    setLoggingIn(false);
  };

  const handleBack = () => {
    setSelectedMember(null);
    setPin('');
    setError('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t.login.title}</h1>
          <p className="text-foreground/60 mt-1">{t.login.subtitle}</p>
        </div>

        {/* Member Selection */}
        {!selectedMember && (
          <div className="space-y-3">
            {members.length === 0 ? (
              <div className="text-center py-8 text-foreground/60">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t.login.noMembers}</p>
              </div>
            ) : (
              members.map(member => (
                <button
                  key={member.id}
                  onClick={() => handleSelectMember(member)}
                  disabled={loggingIn}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 group disabled:opacity-50"
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: member.color || '#6b8e7f' }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left">
                    <span className="font-medium text-foreground text-lg">{member.name}</span>
                  </div>
                  {member.hasPin && (
                    <Lock className="w-4 h-4 text-foreground/40" />
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* PIN Entry */}
        {selectedMember && (
          <div className="space-y-6">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-foreground/60 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">{t.login.back}</span>
            </button>

            <div className="text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-md mx-auto mb-3"
                style={{ backgroundColor: selectedMember.color || '#6b8e7f' }}
              >
                {selectedMember.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-lg font-semibold">{selectedMember.name}</h2>
            </div>

            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-foreground/70 mb-2 block">{t.login.enterPin}</label>
                <Input
                  ref={pinInputRef}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setPin(value);
                  }}
                  placeholder="••••"
                  className="text-center text-2xl tracking-[0.5em] h-14"
                  autoComplete="off"
                />
              </div>

              {error && (
                <p className="text-destructive text-sm text-center">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full h-12"
                disabled={!pin || loggingIn}
              >
                {loggingIn ? t.loading : t.login.loginButton}
              </Button>
            </form>
          </div>
        )}

        {error && !selectedMember && (
          <p className="text-destructive text-sm text-center mt-4">{error}</p>
        )}
      </Card>
    </div>
  );
}
