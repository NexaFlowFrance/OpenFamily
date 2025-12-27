import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Lock, Unlock, Shield } from 'lucide-react';
import { encryptAllLocalStorage, decryptAllLocalStorage, isEncryptionEnabled } from '@/lib/encryption';

export default function EncryptionSettings() {
  const [isEncrypted, setIsEncrypted] = useState(isEncryptionEnabled());
  const [showDialog, setShowDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleEnableEncryption = async () => {
    if (password.length < 8) {
      alert('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (password !== confirmPassword) {
      alert('Les mots de passe ne correspondent pas');
      return;
    }

    if (!window.confirm('⚠️ Important : Si vous oubliez ce mot de passe, vos données seront DÉFINITIVEMENT inaccessibles. Êtes-vous sûr de vouloir continuer ?')) {
      return;
    }

    setIsProcessing(true);
    try {
      await encryptAllLocalStorage(password);
      setIsEncrypted(true);
      setShowDialog(false);
      setPassword('');
      setConfirmPassword('');
      alert('✅ Chiffrement activé ! Vos données sont maintenant sécurisées.');
    } catch (error) {
      alert('❌ Erreur lors du chiffrement. Veuillez réessayer.');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisableEncryption = async () => {
    if (!password) {
      alert('Veuillez entrer votre mot de passe');
      return;
    }

    setIsProcessing(true);
    try {
      await decryptAllLocalStorage(password);
      setIsEncrypted(false);
      setShowDialog(false);
      setPassword('');
      alert('✅ Chiffrement désactivé. Vos données sont maintenant en clair.');
    } catch (error) {
      alert('❌ Mot de passe incorrect ou erreur de déchiffrement.');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Shield className="w-5 h-5" />
        Sécurité et chiffrement
      </h3>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium flex items-center gap-2">
              {isEncrypted ? (
                <>
                  <Lock className="w-4 h-4 text-green-600" />
                  Chiffrement activé
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 text-muted-foreground" />
                  Chiffrement désactivé
                </>
              )}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              {isEncrypted 
                ? 'Vos données sont protégées par mot de passe'
                : 'Activez le chiffrement pour protéger vos données sensibles'
              }
            </p>
          </div>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                {isEncrypted ? 'Désactiver' : 'Activer'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {isEncrypted ? 'Désactiver le chiffrement' : 'Activer le chiffrement'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {!isEncrypted ? (
                  <>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        ⚠️ <strong>Important :</strong> Conservez précieusement votre mot de passe. 
                        Il est impossible de récupérer vos données si vous l'oubliez.
                      </p>
                    </div>
                    <div>
                      <Label>Mot de passe (min. 8 caractères)</Label>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Choisissez un mot de passe fort"
                        disabled={isProcessing}
                      />
                    </div>
                    <div>
                      <Label>Confirmer le mot de passe</Label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirmez votre mot de passe"
                        disabled={isProcessing}
                      />
                    </div>
                    <Button 
                      onClick={handleEnableEncryption} 
                      className="w-full"
                      disabled={isProcessing}
                    >
                      {isProcessing ? 'Chiffrement en cours...' : 'Activer le chiffrement'}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Entrez votre mot de passe pour désactiver le chiffrement et rendre 
                      vos données accessibles en clair.
                    </p>
                    <div>
                      <Label>Mot de passe</Label>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Votre mot de passe"
                        disabled={isProcessing}
                      />
                    </div>
                    <Button 
                      onClick={handleDisableEncryption} 
                      className="w-full"
                      variant="destructive"
                      disabled={isProcessing}
                    >
                      {isProcessing ? 'Déchiffrement en cours...' : 'Désactiver le chiffrement'}
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>🔒 Utilise AES-256-GCM avec PBKDF2 (100 000 itérations)</p>
        <p>🔐 Le chiffrement est effectué localement dans votre navigateur</p>
        <p>🛡️ Aucune clé n'est envoyée à un serveur</p>
      </div>
    </div>
  );
}
