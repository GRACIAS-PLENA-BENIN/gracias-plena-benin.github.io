// Immobilisations : registre, plan d'amortissement de l'exercice, écriture des dotations.
import { appeler } from '../client.js';
import { h, vider, ajouter, annoncer, blocErreur, dialogue } from '../ui.js';
import { formatMontant, formatDate, lireMontant } from '../format.js';

const montant = (nom, texte, obligatoire) => {
  const r = lireMontant(texte);
  if (!r.ok) throw new Error(`${nom} : ${r.erreur}`);
  if (obligatoire && !r.valeur) throw new Error(`${nom} : obligatoire.`);
  return String(r.valeur || 0);
};

export async function vueImmobilisations(ctx, zone) {
  const societe = ctx.habilitation.societe_id;
  const erreurs = h('div', { class: 'zone-erreur' });

  async function executer(fn, message) {
    vider(erreurs);
    try { const r = await fn(); if (message) annoncer(message, 'succes'); await afficher(); return r; } catch (err) {
      ajouter(erreurs, blocErreur(err.message)); erreurs.scrollIntoView({ behavior: 'smooth', block: 'center' }); return undefined;
    }
  }

  function formulaire(i) {
    const comptes = ctx.ref.comptes || [];
    const opts = (re) => comptes.filter((c) => re.test(c.numero)).map((c) => ({ valeur: c.numero, libelle: `${c.numero} — ${c.libelle}` }));
    const immo = opts(/^2[1-5]/);
    const amort = opts(/^28/);
    const dot = opts(/^681/);
    const act = (ctx.ref.axes || []).find((a) => a.code === 'ACTIVITE');
    return dialogue({
      titre: i ? `Modifier ${i.code}` : 'Nouvelle immobilisation',
      texte: 'Amortissement linéaire, au prorata des jours à partir de la mise en service. La durée d\'utilité est à fixer avec votre expert-comptable.',
      champs: [
        ...(i ? [] : [{ nom: 'code', etiquette: 'Code (ex. VEH-01, ORDI-2026-03)', requis: true }]),
        { nom: 'libelle', etiquette: 'Désignation', valeur: i?.libelle, requis: true },
        { nom: 'compte_immo', etiquette: 'Compte d\'immobilisation', type: 'select', options: immo, valeur: i?.compte_immo || '2441' },
        { nom: 'compte_amort', etiquette: 'Compte d\'amortissement', type: 'select', options: amort, valeur: i?.compte_amort || '2844' },
        { nom: 'compte_dotation', etiquette: 'Compte de dotation', type: 'select', options: dot, valeur: i?.compte_dotation || '6813' },
        ...(act ? [{ nom: 'activite', etiquette: 'Activité qui utilise le bien', type: 'select',
          options: [{ valeur: '', libelle: '(aucune)' }, ...act.sections.map((x) => ({ valeur: x.code, libelle: x.libelle }))],
          valeur: i?.activite || 'FRAIS_COMMUNS' }] : []),
        { nom: 'date_acquisition', etiquette: 'Date d\'acquisition', type: 'date', valeur: i?.date_acquisition, requis: true },
        { nom: 'date_mise_en_service', etiquette: 'Date de mise en service (si différente)', type: 'date', valeur: i?.date_mise_en_service || '' },
        { nom: 'valeur_origine', etiquette: 'Valeur d\'origine HT (FCFA)', valeur: i ? String(i.valeur_origine) : '', requis: true },
        { nom: 'duree_mois', etiquette: 'Durée d\'utilité (mois, ex. 60 pour 5 ans)', valeur: i ? String(i.duree_mois) : '', requis: true },
        { nom: 'valeur_residuelle', etiquette: 'Valeur résiduelle (FCFA, 0 en général)', valeur: i ? String(i.valeur_residuelle) : '0' },
        { nom: 'date_sortie', etiquette: 'Date de sortie (cession, rebut) — sinon vide', type: 'date', valeur: i?.date_sortie || '' },
      ],
      bouton: 'Enregistrer',
    });
  }

  function preparer(v) {
    const p = { ...v };
    p.valeur_origine = montant('Valeur d\'origine', p.valeur_origine, true);
    p.valeur_residuelle = montant('Valeur résiduelle', p.valeur_residuelle, false);
    if (!/^\d{1,4}$/.test(String(p.duree_mois).trim()) || Number(p.duree_mois) < 1) throw new Error('Durée : nombre de mois entier.');
    p.duree_mois = String(Number(p.duree_mois));
    return p;
  }

  async function afficher() {
    vider(zone);
    const ex = ctx.exercice;
    ajouter(zone, h('h1', {}, 'Immobilisations'), erreurs);
    if (!ex) return ajouter(zone, h('p', {}, 'Aucun exercice.'));
    const liste = await appeler('immobilisations', { p_societe: societe, p_exercice: ex.id });
    const actions = h('div', { class: 'actions sans-impression' });
    if (ctx.peut('parametrage')) {
      const b = h('button', { type: 'button', class: 'bouton principal' }, 'Nouvelle immobilisation');
      b.addEventListener('click', async () => {
        const v = await formulaire(null);
        if (v) await executer(() => appeler('enregistrer_immobilisation', { p_societe: societe, p_code: null, p: preparer(v) }), `Immobilisation ${v.code.toUpperCase()} enregistrée.`);
      });
      ajouter(actions, b);
    }
    const aDoter = liste.filter((i) => Number(i.dotation) > 0 && !i.ecriture_id);
    if (ctx.peut('saisie') && aDoter.length && ex.statut === 'ouvert') {
      const g = h('button', { type: 'button', class: 'bouton secondaire' }, `Générer l'écriture des dotations ${ex.code}`);
      g.addEventListener('click', async () => {
        const ok = await dialogue({ titre: 'Générer les dotations ?', bouton: 'Générer',
          texte: `Une écriture en brouillard sera créée au ${formatDate(ex.date_fin)} dans le journal des opérations diverses pour ${aDoter.length} immobilisation(s). Vérifiez-la puis validez-la.` });
        if (!ok) return;
        const id = await executer(() => appeler('generer_dotations', { p_societe: societe, p_exercice: ex.id }), 'Brouillard des dotations créé.');
        if (id) window.location.hash = `#/ecriture/${id}`;
      });
      ajouter(actions, g);
    }
    const imp = h('button', { type: 'button', class: 'bouton secondaire' }, 'Imprimer / PDF');
    imp.addEventListener('click', () => window.print());
    ajouter(zone, ajouter(actions, imp));
    if (!liste.length) return ajouter(zone, h('p', { class: 'discret' }, 'Aucune immobilisation enregistrée.'));
    const tot = (k) => liste.reduce((s, i) => s + Number(i[k]), 0);
    ajouter(zone, h('h2', {}, `Registre et plan d'amortissement — exercice ${ex.code}`),
      h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
        h('thead', {}, h('tr', {}, ['Immobilisation', 'Compte', 'Mise en service', 'Durée', 'Valeur d\'origine', 'Amort. antérieurs', 'Dotation', 'Cumul fin', 'VNC', 'Comptabilisée']
          .map((t, n) => h('th', { scope: 'col', class: n >= 4 && n <= 8 ? 'nombre' : '' }, t)))),
        h('tbody', {}, liste.map((i) => {
          const nom = ctx.peut('parametrage') ? h('button', { type: 'button', class: 'bouton lien' }, i.code) : h('span', {}, i.code);
          nom.addEventListener?.('click', async () => {
            const v = await formulaire(i);
            if (v) await executer(() => appeler('enregistrer_immobilisation', { p_societe: societe, p_code: i.code, p: preparer(v) }), 'Immobilisation mise à jour.');
          });
          return h('tr', {},
            h('td', { 'data-titre': 'Immobilisation' }, nom, h('br'), h('span', { class: 'discret' }, i.libelle + (i.date_sortie ? ` · sortie le ${formatDate(i.date_sortie)}` : ''))),
            h('td', { 'data-titre': 'Compte' }, i.compte_immo),
            h('td', { 'data-titre': 'Mise en service' }, formatDate(i.date_mise_en_service)),
            h('td', { 'data-titre': 'Durée' }, `${i.duree_mois} mois`),
            h('td', { 'data-titre': 'Valeur d\'origine', class: 'nombre' }, formatMontant(i.valeur_origine)),
            h('td', { 'data-titre': 'Amort. antérieurs', class: 'nombre' }, formatMontant(i.cumul_debut)),
            h('td', { 'data-titre': 'Dotation', class: 'nombre' }, formatMontant(i.dotation)),
            h('td', { 'data-titre': 'Cumul fin', class: 'nombre' }, formatMontant(i.cumul_fin)),
            h('td', { 'data-titre': 'VNC', class: 'nombre' }, formatMontant(i.vnc)),
            h('td', { 'data-titre': 'Comptabilisée' }, i.ecriture_id
              ? h('a', { href: `#/ecriture/${i.ecriture_id}` }, i.ecriture_statut === 'brouillard' ? 'Brouillard' : 'Oui')
              : (Number(i.dotation) ? 'Non' : '—')));
        })),
        h('tfoot', {}, h('tr', {}, h('th', { scope: 'row', colspan: '4' }, 'Total'),
          ...['valeur_origine', 'cumul_debut', 'dotation', 'cumul_fin', 'vnc'].map((k) => h('td', { class: 'nombre' }, formatMontant(tot(k)))), h('td', {}))))),
      h('p', { class: 'discret' }, 'Les biens déjà détenus avant GRACIAS : saisissez leur date de mise en service réelle, les amortissements antérieurs sont recalculés. '
        + 'Si le cumul diffère de votre comptabilité passée, l\'écart doit être examiné avec votre expert-comptable avant de générer les dotations. '
        + 'Une cession se comptabilise par une écriture manuelle ; la date de sortie arrête l\'amortissement.'));
  }

  await afficher();
}
