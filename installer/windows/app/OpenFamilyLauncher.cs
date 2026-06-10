// =============================================================================
//  OpenFamily — Lanceur natif (.exe) du panneau de controle
//  Edite par NexaFlow — https://nexaflow.fr
//
//  Remplace l'ancien lanceur OpenFamily.vbs. Ouvre la fenetre graphique
//  (OpenFamilyControl.ps1) sans afficher de console PowerShell, et affiche
//  un message clair si le panneau ne parvient pas a demarrer.
//
//  Compilation (faite automatiquement par build-local.ps1) :
//    csc.exe /target:winexe /win32icon:assets\OpenFamily.ico ^
//            /reference:System.Windows.Forms.dll ^
//            /out:OpenFamily.exe OpenFamilyLauncher.cs
// =============================================================================
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace OpenFamily
{
    internal static class Launcher
    {
        [STAThread]
        private static int Main()
        {
            try
            {
                string appDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                string script = Path.Combine(appDir, "OpenFamilyControl.ps1");

                if (!File.Exists(script))
                {
                    MessageBox.Show(
                        "Fichier introuvable :\n" + script,
                        "OpenFamily", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }

                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File \"" + script + "\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WorkingDirectory = appDir
                };

                Process proc = Process.Start(psi);

                // Si le panneau plante immediatement (mauvaise config, droits...),
                // on previent l'utilisateur au lieu de laisser un echec silencieux.
                if (proc != null && proc.WaitForExit(4000) && proc.ExitCode != 0)
                {
                    MessageBox.Show(
                        "OpenFamily n'a pas pu ouvrir le panneau de controle.\n\n" +
                        "Consultez les journaux dans :\n" +
                        "%LOCALAPPDATA%\\OpenFamily\\logs",
                        "OpenFamily", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return proc.ExitCode;
                }

                return 0;
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Erreur au lancement d'OpenFamily :\n\n" + ex.Message,
                    "OpenFamily", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}
