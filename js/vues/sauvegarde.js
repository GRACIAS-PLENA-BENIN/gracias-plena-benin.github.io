// Sauvegarde complète téléchargeable (gérant).
import { appeler } from '../client.js';
import { h, vider, ajouter, annoncer, blocErreur, telecharger } from '../ui.js';

export function nomFichierSauvegarde(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `gracias-sauvegarde-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}h${p(d.getMinutes())}.json`;
}

export async function vueSauvegarde(ctx, zone) {
  const etat = await appeler('etat_sauvegardes', { p_societe: ctx.habilitation.societe_id });
  const resultat = h('div', { 'aria-live': 'polite' });
  const bouton = h('button', { type: 'button', class: 'bouton principal' }, 'Télécharger une sauvegarde complète');
  bouton.addEventListener('click', async () => {
    bouton.disabled = true;
    bouton.textContent = 'Préparation de la sauvegarde…';
    vider(resultat);
    try {
      const donnees = await appeler('exporter_sauvegarde', { p_societe: ctx.habilitation.societe_id });
      const nom = nomFichierSauvegarde();
      telecharger(nom, JSON.stringify(donnees), 'application/json;charset=utf-8');
      const lignes = Object.values(donnees.controle.lignes).reduce((a, b) => a + b, 0);
      annoncer('Sauvegarde téléchargée.', 'succes');
      ajouter(resultat, h('div', { class: 'controle-ok' },
        h('p', {}, `Fichier « ${nom} » : ${lignes} lignes, journal d'audit vérifié intact.`),
        h('p', {}, `Empreinte de contrôle : ${donnees.empreinte.slice(0, 16)}… (permet de détecter toute modification du fichier).`)));
      document.dispatchEvent(new CustomEvent('gracias:sauvegarde'));
      vider(zone);
      await vueSauvegarde(ctx, zone);
      ajouter(zone, resultat);
    } catch (err) {
      ajouter(resultat, blocErreur(err.message));
      bouton.disabled = false;
      bouton.textContent = 'Télécharger une sauvegarde complète';
    }
  });

  const derniere = etat.derniere ? new Date(etat.derniere) : null;
  ajouter(zone,
    h('h1', {}, 'Sauvegarde'),
    h('p', {}, derniere
      ? `Dernière sauvegarde téléchargée le ${derniere.toLocaleString('fr-FR')}.`
      : h('strong', {}, 'Aucune sauvegarde n\'a encore été téléchargée.')),
    h('section', { class: 'bloc' },
      h('h2', {}, 'Pourquoi et quand'),
      h('ul', { class: 'liste' },
        h('li', {}, 'L\'hébergement gratuit ne fait aucune sauvegarde automatique : sans ce fichier, une panne ou une erreur de manipulation peut faire perdre les données.'),
        h('li', {}, 'Téléchargez une sauvegarde à la fin de chaque journée de saisie, et au moins une fois par semaine.'),
        h('li', {}, 'Conservez-la à deux endroits différents : votre ordinateur et une clé USB ou un espace en ligne personnel.'),
        h('li', {}, 'Le fichier contient toute la comptabilité : gardez-le en lieu sûr, ne l\'envoyez à personne d\'autre.')),
      h('div', { class: 'actions' }, bouton),
      resultat),
    h('section', { class: 'bloc' },
      h('h2', {}, 'Restaurer'),
      h('p', {}, 'La restauration se fait dans une base neuve, jamais par-dessus les données existantes. ',
        'Le fichier est contrôlé avant tout chargement : un fichier modifié ou incomplet est refusé. ',
        'La procédure est décrite dans le guide « Lancer, sauvegarder et reprendre ».')),
    etat.historique.length ? h('section', { class: 'bloc' },
      h('h2', {}, 'Historique des téléchargements'),
      h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Date'), h('th', { scope: 'col' }, 'Par'),
          h('th', { scope: 'col', class: 'nombre' }, 'Lignes'), h('th', { scope: 'col' }, 'Empreinte'))),
        h('tbody', {}, etat.historique.map((s) => h('tr', {},
          h('td', {}, new Date(s.cree_le).toLocaleString('fr-FR')), h('td', {}, s.cree_par),
          h('td', { class: 'nombre' }, String(s.lignes)), h('td', {}, `${s.empreinte}…`))))))) : null);
}

/** Bandeau de rappel si aucune sauvegarde depuis plus de 7 jours (gérant). */
export async function bandeauSauvegarde(ctx) {
  if (!ctx.peut('sauvegarde')) return null;
  try {
    const etat = await appeler('etat_sauvegardes', { p_societe: ctx.habilitation.societe_id });
    const jours = etat.derniere ? Math.floor((Date.now() - new Date(etat.derniere).getTime()) / 86400000) : null;
    if (jours !== null && jours < 7) return null;
    return h('div', { class: 'bandeau-avertissement bandeau-sauvegarde', role: 'note' },
      h('strong', {}, jours === null ? 'Aucune sauvegarde téléchargée. ' : `Dernière sauvegarde il y a ${jours} jours. `),
      'L\'hébergement gratuit ne sauvegarde pas automatiquement : ',
      h('a', { href: '#/sauvegarde' }, 'télécharger une sauvegarde'), '.');
  } catch { return null; }
}
