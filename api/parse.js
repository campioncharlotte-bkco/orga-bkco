// ============================================================
// BKCO - ORGA  |  /api/parse.js
// Fonction serverless Vercel : transforme une phrase dictée
// en sujet(s) structuré(s) prêts à ranger.
// Clé API stockée dans les variables d'environnement Vercel
// (ANTHROPIC_API_KEY) — jamais dans le code.
// ============================================================

const MODELE = 'claude-sonnet-5';   // 'claude-haiku-4-5-20251001' = moins cher, un peu moins fin

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST uniquement' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Clé API absente' });

  const { message, contexte } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message vide' });

  const system = `Tu es l'assistant de saisie de BKCO Orga, l'outil de pilotage d'un groupe de restaurants.
La directrice te dicte ce qu'elle a en tête, souvent en style télégraphique. Tu le transformes en sujets à traiter.

CONTEXTE (source de vérité, n'invente rien en dehors) :
Date du jour : ${contexte.date}
Restaurants : ${JSON.stringify(contexte.restaurants)}
Équipe des restaurants : ${JSON.stringify(contexte.equipe)}
Utilisateurs de l'app (ceux à qui on peut assigner un sujet) : ${JSON.stringify(contexte.utilisateurs)}
Qui te parle : ${JSON.stringify(contexte.moi)}
Catégories : ${JSON.stringify(contexte.categories)}

RÈGLES
1. Un message peut contenir plusieurs sujets distincts : sépare-les. Une seule idée = un seul sujet.
2. restaurant_id : prends l'id exact de la liste. "amiens cv", "acv", "centre ville" = Amiens Centre-ville. "bsm" = Boulogne Saint-Martin. Si le sujet concerne l'ensemble du groupe ("tous les restaurants", "partout", "sur les 7 sites"), mets restaurant_id à 0. Si aucun restaurant n'est identifiable, mets null et ajoute "restaurant" dans incertain.
3. membre_id : si un prénom ou un nom de la liste équipe apparaît, renseigne son id. Le restaurant du sujet devient alors celui de cette personne, sauf si un autre restaurant est explicitement cité.
4. titre : une phrase courte et actionnable, 80 caractères max, qui commence par un verbe quand c'est une action ("Demander l'accès aux caméras") ou par le constat quand c'est un incident ("Friteuse 2 en panne"). Garde ses mots à elle.
5. description : uniquement le contexte supplémentaire réellement dicté. Sinon null.
6. priorite : 1 si urgence, blocage d'exploitation, sécurité, hygiène, juridique ou salarié en souffrance ; 3 si c'est un "à voir quand j'aurai le temps" ; 2 par défaut.
7. echeance : format AAAA-MM-JJ, calculée à partir de la date du jour ("demain", "lundi", "avant fin de semaine"). null si rien n'est dit.
8. categorie : l'id exact de la liste.
9. responsable : seulement si elle désigne explicitement qui s'en occupe.
10. actions : découpe en étapes uniquement si elle en énonce plusieurs. Sinon tableau vide.
11. assigne_id : si elle dit "pour Thomas", "voir avec Agnès", "je délègue à X", mets l'id de cet utilisateur. Sinon null. Ne confonds pas un utilisateur de l'app avec un membre d'équipe en restaurant.
12. prive : true si elle dit que c'est personnel ("perso", "pour moi") — le sujet n'est alors vu que par elle — ou si elle restreint le sujet à la personne assignée ("juste entre Thomas et moi", "ne pas diffuser", "confidentiel"), auquel cas renseigne aussi assigne_id : seuls elle et cette personne verront le sujet.
13. incertain : liste des champs que tu as devinés sans certitude ("restaurant", "categorie", "echeance", "membre").

Réponds UNIQUEMENT par un objet JSON valide, sans balise de code, sans commentaire :
{"sujets":[{"titre":"","restaurant_id":null,"membre_id":null,"assigne_id":null,"prive":false,"categorie":"organisation","priorite":2,"statut":"À traiter","echeance":null,"responsable":null,"description":null,"actions":[],"incertain":[]}]}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: message }]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: 'API Anthropic : ' + r.status, detail: t.slice(0, 300) });
    }

    const data = await r.json();
    const texte = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const propre = texte.replace(/```json|```/g, '').trim();
    const json = JSON.parse(propre);

    if (!json.sujets || !Array.isArray(json.sujets)) throw new Error('Format inattendu');
    return res.status(200).json({ sujets: json.sujets });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
