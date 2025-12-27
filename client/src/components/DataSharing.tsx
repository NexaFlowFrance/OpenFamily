import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { QrCode, Upload, Download } from 'lucide-react';
import QRCode from 'qrcode';

export default function DataSharing() {
  const { shoppingItems, tasks, appointments, familyMembers, recipes, meals, budgets } = useApp();
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [showQRDialog, setShowQRDialog] = useState(false);

  const generateQRCode = async () => {
    const exportData = {
      shopping: shoppingItems,
      tasks: tasks,
      appointments: appointments,
      members: familyMembers,
      recipes: recipes,
      meals: meals,
      budgets: budgets,
      exportDate: new Date().toISOString(),
      appVersion: '1.0.0',
    };

    const dataString = JSON.stringify(exportData);
    
    // Pour les QR codes, on peut compresser les données ou utiliser un service d'URL courte
    // Ici, on génère directement le QR code avec les données (limité en taille)
    try {
      const url = await QRCode.toDataURL(dataString, {
        errorCorrectionLevel: 'M',
        width: 400,
        margin: 2,
      });
      setQrCodeUrl(url);
      setShowQRDialog(true);
    } catch (error) {
      console.error('Erreur génération QR code:', error);
      alert('Les données sont trop volumineuses pour un QR code. Utilisez l\'export JSON.');
    }
  };

  const exportAsJSON = () => {
    const exportData = {
      shopping: localStorage.getItem('openfamily_shopping'),
      tasks: localStorage.getItem('openfamily_tasks'),
      appointments: localStorage.getItem('openfamily_appointments'),
      members: localStorage.getItem('openfamily_members'),
      recipes: localStorage.getItem('openfamily_recipes'),
      meals: localStorage.getItem('openfamily_meals'),
      budgets: localStorage.getItem('openfamily_budgets'),
      exportDate: new Date().toISOString(),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `openfamily-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFromJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        
        if (window.confirm('Voulez-vous remplacer toutes vos données actuelles ? Cette action est irréversible.')) {
          // Restaurer toutes les données
          if (data.shopping) localStorage.setItem('openfamily_shopping', data.shopping);
          if (data.tasks) localStorage.setItem('openfamily_tasks', data.tasks);
          if (data.appointments) localStorage.setItem('openfamily_appointments', data.appointments);
          if (data.members) localStorage.setItem('openfamily_members', data.members);
          if (data.recipes) localStorage.setItem('openfamily_recipes', data.recipes);
          if (data.meals) localStorage.setItem('openfamily_meals', data.meals);
          if (data.budgets) localStorage.setItem('openfamily_budgets', data.budgets);
          
          alert('Données importées avec succès ! La page va se recharger.');
          window.location.reload();
        }
      } catch (error) {
        alert('Erreur lors de l\'importation. Vérifiez que le fichier est valide.');
        console.error(error);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Partage de données</h3>
      
      <div className="grid grid-cols-1 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Export JSON</h4>
              <p className="text-sm text-muted-foreground">Télécharger toutes vos données</p>
            </div>
            <Button onClick={exportAsJSON} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exporter
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Import JSON</h4>
              <p className="text-sm text-muted-foreground">Restaurer depuis un fichier</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                Importer
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={importFromJSON}
                />
              </label>
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Partage QR Code</h4>
              <p className="text-sm text-muted-foreground">Partager via QR code (données limitées)</p>
            </div>
            <Button onClick={generateQRCode} variant="outline" size="sm">
              <QrCode className="w-4 h-4 mr-2" />
              Générer
            </Button>
          </div>
        </Card>
      </div>

      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR Code de partage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scannez ce QR code avec un autre appareil pour importer les données.
            </p>
            {qrCodeUrl && (
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img src={qrCodeUrl} alt="QR Code" className="max-w-full" />
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              ⚠️ Pour de grandes quantités de données, préférez l'export JSON
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
