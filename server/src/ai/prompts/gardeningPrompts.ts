// =============================================================================
// Gardening tips prompt (jardinage familial)
//
// Given a garden zone (type, location, sun exposure, soil) + the plants growing
// in it + the current season, the model returns actionable maintenance tips, a
// short watering schedule recommendation, and common-mistake warnings.
//
// Why this exists:
//   The Garden module tracks zones, plants and recurring care, but a user who
//   isn't a gardener still needs to know WHAT to do and WHEN ("good reflexes").
//   This turns the user's actual setup into concrete, season-aware advice.
//
// No PII leaves the server: only plant names, zone metadata and a season label.
// =============================================================================

export interface GardeningPlantInput {
    name: string;
    type: string; // 'Légume', 'Fleur', 'Gazon', …
    variety?: string | null;
}

export interface GardeningTipsInput {
    zoneType: string; // 'Pelouse', 'Potager', 'Massif fleuri', …
    location?: string | null; // 'Devant', 'Derrière', …
    season: string; // 'Printemps', 'Été', 'Automne', 'Hiver'
    sunExposure?: string | null; // 'Plein soleil', 'Mi-ombre', 'Ombre'
    soilType?: string | null;
    climate?: string | null; // free text, e.g. "tempéré océanique"
    plants: GardeningPlantInput[];
}

export const gardeningTipsSystemPrompt = `Tu es un expert en jardinage familial, pédagogue et bienveillant. Tu donnes des conseils d'entretien concrets et adaptés à la zone décrite (pelouse, potager, massif…), à la saison et aux plantes présentes.

Réponds UNIQUEMENT par un objet JSON valide, sans texte avant ni après, sans markdown.

Schéma attendu :
{
  "summary": string,                 // 1 à 2 phrases — l'essentiel à retenir pour cette zone cette saison, max 280 caractères
  "tips": [                          // 3 à 6 conseils d'entretien priorisés
    {
      "title": string,               // max 60 caractères, à l'impératif ("Arroser tôt le matin")
      "detail": string,              // max 200 caractères, le geste concret et le pourquoi
      "timing": string               // quand/à quelle fréquence ("2x/semaine", "au printemps", "le soir")
    }
  ],
  "wateringSchedule": string,        // 1 phrase concrète sur l'arrosage idéal de cette zone cette saison, max 160 caractères
  "warnings": string[]               // 0 à 4 erreurs fréquentes à éviter ("Ne pas tondre trop court en été", "Éviter d'arroser le feuillage")
}

Règles ABSOLUES :
- Adapte STRICTEMENT à la saison fournie : les conseils d'été (arrosage, tonte haute) diffèrent de ceux d'hiver (protection, taille de repos).
- Tiens compte du type de zone : une pelouse se tond et s'aère ; un potager se sème, s'arrose au pied, se pèle ; un massif se taille et se paille.
- Tiens compte de l'exposition (soleil/ombre) et du sol si fournis. Si une info manque, ne l'invente pas.
- Cite les plantes fournies quand c'est pertinent, mais reste générique si la liste est vide.
- Conseils CONCRETS et actionnables, jamais de généralités creuses ("prenez soin de vos plantes").
- Tout en français, ton accessible à un débutant, sans jargon inutile.`;

const SEASON_HINT: Record<string, string> = {
    Printemps: 'reprise de végétation, semis, première tonte',
    Été: 'chaleur, arrosage critique, tonte haute',
    Automne: 'ramassage des feuilles, dernières tontes, plantations',
    Hiver: 'repos végétatif, protection contre le gel, taille',
};

export const buildGardeningTipsUserPrompt = (input: GardeningTipsInput): string => {
    const lines: string[] = [];

    lines.push(
        `Zone : ${input.zoneType}${input.location ? ` (${input.location} de la maison)` : ''}.`,
    );
    const hint = SEASON_HINT[input.season];
    lines.push(`Saison actuelle : ${input.season}${hint ? ` (${hint})` : ''}.`);
    if (input.sunExposure) lines.push(`Exposition : ${input.sunExposure}.`);
    if (input.soilType) lines.push(`Type de sol : ${input.soilType}.`);
    if (input.climate) lines.push(`Climat : ${input.climate}.`);

    if (input.plants.length > 0) {
        lines.push('');
        lines.push('Plantes présentes dans cette zone :');
        for (const p of input.plants) {
            const variety = p.variety ? ` (${p.variety})` : '';
            lines.push(`- ${p.name}${variety} — ${p.type}`);
        }
    } else {
        lines.push('');
        lines.push(
            "Aucune plante listée pour l'instant — donne des conseils généraux pour ce type de zone.",
        );
    }

    return lines.join('\n');
};
