// =============================================================================
// Vacation luggage prompt — per-person packing checklist
//
// Generates one checklist per participant (clothing, toiletries, documents,
// health, electronics, kids-only items) plus a shared family list (chargers,
// medicine kit, papers shared, etc.). The destination + dates drive climate
// assumptions; ages drive the kids/adult split.
//
// The output is a flat list of items so the route can bulk-insert into
// vacation_luggage in one transaction.
// =============================================================================

export interface VacationLuggageParticipant {
    /** family_member_id — echoed back verbatim so the route can wire ownership. */
    id: string;
    name: string;
    ageYears: number | null;
}

export interface VacationLuggageInput {
    destination: string;
    country: string | null;
    startDate: string;
    endDate: string;
    days: number;
    accommodationType: string | null;
    /** Trip objectives — drive items like swimsuit (beach), hiking shoes (sport)… */
    objectives: string[];
    participants: VacationLuggageParticipant[];
    /** Free-form constraints from the user form. */
    notes: string | null;
}

export const vacationLuggageSystemPrompt = `Tu es un assistant qui prépare des checklists de bagages familiaux pour des vacances. Tu reçois la destination, les dates, le type d'hébergement, les objectifs du séjour et la liste des participants (avec leurs âges).

Réponds UNIQUEMENT par un objet JSON valide, sans texte avant ni après, sans markdown.

Schéma attendu :
{
  "items": [
    {
      "owner": "shared" | "<id participant>",   // "shared" pour les objets famille, sinon l'ID fourni en input
      "category": "clothing" | "toiletries" | "documents" | "health" | "electronics" | "kids" | "misc",
      "item": string,                            // nom court, max 60 caractères (ex: "Tee-shirt manches courtes", "Crème solaire")
      "quantity": number,                        // entier > 0 ; pour vêtements: calcule selon durée du séjour (ex: 1 tee-shirt / 2 jours arrondi sup)
      "notes": string | null                     // 1 phrase si pertinent ("éviter si moins de 6 mois", "indispensable randonnée")
    }
  ],
  "warnings": string[]                           // 0 à 3 alertes (ex: "Passeport requis non européen", "Vaccins recommandés à vérifier")
}

Règles ABSOLUES :
- Une checklist PERSONNELLE par participant : vêtements adaptés à son âge + accessoires + chaussures + linge de toilette de base. Utilise l'ID participant comme valeur de "owner".
- Une checklist PARTAGÉE "shared" pour les objets famille : chargeurs, adaptateurs, trousse pharmacie, GPS, livres/jeux, sacs de plage, etc. NE répète PAS ces objets dans les listes personnelles.
- Catégories à utiliser correctement :
  • clothing : tout vêtement (haut, bas, pyjama, sous-vêtements, chaussettes, maillot…)
  • toiletries : hygiène (brosse à dents, savon, shampooing, crème solaire…)
  • documents : passeport, carte d'identité, carnet santé, billets, attestations, permis…
  • health : médicaments perso, lunettes, lentilles, contraception, anti-moustiques médicalisé…
  • electronics : téléphone, chargeur, écouteurs, appareil photo, adaptateur…
  • kids : items spécifiques bébés/enfants jeunes : doudou, couches, biberon, lait, poussette pliable, lit parapluie…
  • misc : tout le reste (sacs, lessive, sac à dos jour…)
- Quantités vêtements (référence pour ${'$'}days nuits) :
  • Sous-vêtements/chaussettes : 1 paire/jour, max 7 (lessive après une semaine).
  • Tee-shirts : 1 / 2 jours, arrondi supérieur. Pyjamas : 1 / 4 jours.
  • Pantalons/shorts : 1 / 3 jours.
  • Chaussures : 1 paire principale + 1 paire spécifique objectif (rando, plage…) si pertinent.
- Adapte au climat probable de la destination aux dates fournies (été méditerranéen ≠ ski hiver ≠ tropical mousson). Si destination ambiguë, prends le scénario le plus prudent.
- Adapte aux objectifs : "plage/détente" → maillots, serviettes plage, paréos ; "sport/rando" → chaussures rando, gourde, k-way ; "culture" → tenues neutres adaptables.
- Adapte au type d'hébergement :
  • camping : sac de couchage, lampe frontale, vaisselle, multiprise (si possible).
  • chalet/airbnb : moins de linge de maison (souvent fourni), mais prévoir torchons éventuels.
  • hôtel : pas de produits ménagers, savon/serviette fournis (ne pas dupliquer).
- Adapte à l'ÂGE :
  • Bébés < 2 ans → kids : couches, lingettes, biberons, lait, doudou, vêtements de rechange supplémentaires, médicaments adaptés.
  • Enfants 3-10 ans → kids : doudou si pertinent, jeux/livres dédiés, médicaments pédiatriques.
  • Ados / adultes → checklist standard.
- Documents : passeport si destination hors zone Schengen (utilise "country" pour décider) — sinon carte d'identité.
- LIMITE STRICTE et NON NÉGOCIABLE : MAXIMUM 12 items par personne, MAXIMUM 10 items partagés ("shared"). Total absolu : 80 items pour toute la réponse. Si tu hésites entre inclure ou non un item, NE L'INCLUS PAS. La concision est un critère de qualité — une liste trop longue est inutilisable et sera tronquée.
- Tout en français, items courts et concrets.
- N'invente PAS d'IDs : utilise EXACTEMENT les IDs fournis en input pour les listes personnelles.`;

const formatParticipant = (p: VacationLuggageParticipant): string => {
    const age =
        p.ageYears === null ? 'âge non précisé' : `${p.ageYears} an${p.ageYears > 1 ? 's' : ''}`;
    return `- ${p.name} (id=${p.id}, ${age})`;
};

export const buildVacationLuggageUserPrompt = (input: VacationLuggageInput): string => {
    const lines: string[] = [];
    lines.push(`Destination : ${input.destination}${input.country ? `, ${input.country}` : ''}`);
    lines.push(
        `Dates : du ${input.startDate} au ${input.endDate} (${input.days} jour${input.days > 1 ? 's' : ''})`,
    );
    if (input.accommodationType) {
        lines.push(`Hébergement : ${input.accommodationType}`);
    }
    if (input.objectives.length > 0) {
        lines.push(`Objectifs : ${input.objectives.join(', ')}`);
    }
    if (input.notes) {
        lines.push(`Notes : ${input.notes}`);
    }
    if (input.participants.length > 0) {
        lines.push('');
        lines.push('Participants (utilise les IDs ci-dessous comme owner) :');
        for (const p of input.participants) {
            lines.push(formatParticipant(p));
        }
    } else {
        lines.push('Participants : aucun listé. Génère uniquement une liste "shared" complète.');
    }
    lines.push('');
    lines.push('Génère la checklist complète (perso + partagée).');
    return lines.join('\n');
};
