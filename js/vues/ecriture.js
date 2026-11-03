// Détail d'une écriture et actions : modifier, valider, supprimer, contrepasser.
import { appeler } from '../client.js';
import { h, annoncer, blocErreur, dialogue, ajouter } from '../ui.js';
import { formatMontantOuVide, formatMontant, formatDate, aujourdhui } from '../format.js';

export async function vueEcriture(ctx, zone, id) {
  const e = await appeler('ecriture', { p_id: id });
  const erreurs = h('div', { class: 'zone-erreur' });
  const totalD = e.lignes.reduce((s, l) => s + Number(l.debit), 0);
  const totalC = e.lignes.reduce((s, l) => s + Number(l.credit), 0);
  const brouillard = e.statut === 'brouillard';

  async function action(fn, bouton) {
    erreurs.replaceChildren();
    bouton.disabled = true;
    try { await fn(); } catch (err) { ajouter(erreurs, blocErreur(err.message)); bouton.disabled = false; }
  }

  const actions = h('div', { class: 'actions' });
  if (brouillard && ctx.peut('saisie')) {
    ajouter(actions, h('a', { class: 'bouton secondaire', href: `#/saisie/${e.id}` }, 'Modifier'));
    const bSupp = h('button', { class: 'bouton danger-discret', type: 'button' }, 'Supprimer le brouillard');
    bSupp.addEventListener('click', async () => {
      const ok = await dialogue({ titre: 'Supprimer ce brouillard ?', texte: 'Le brouillard sera supprimé (l\'opération reste tracée dans le journal d\'audit).', bouton: 'Supprimer', danger: true });
      if (ok) await action(async () => { await appeler('supprimer_brouillard', { p_id: e.id }); annoncer('Brouillard supprimé.'); ctx.aller('#/ecritures'); }, bSupp);
    });
    ajouter(actions, bSupp);
  }
  if (brouillard && ctx.peut('validation')) {
    const bVal = h('button', { class: 'bouton principal', type: 'button' }, 'Valider l\'écriture');
    bVal.addEventListener('click', async () => {
      const ok = await dialogue({ titre: 'Valider cette écriture ?',
        texte: 'Une écriture validée est définitive : elle reçoit un numéro et ne pourra plus être modifiée ni supprimée. Une erreur se corrigera par contrepassation.',
        bouton: 'Valider' });
      if (ok) await action(async () => {
        const numero = await appeler('valider_ecriture', { p_id: e.id });
        annoncer(`Écriture validée : ${numero}.`, 'succes');
        await vueEcritureRecharger(ctx, zone, e.id);
      }, bVal);
    });
    ajouter(actions, bVal);
  }
  if (!brouillard && !e.contrepassee_par && ctx.peut('contrepassation')) {
    const bCp = h('button', { class: 'bouton secondaire', type: 'button' }, 'Contrepasser');
    bCp.addEventListener('click', async () => {
      const v = await dialogue({ titre: `Contrepasser ${e.numero}`,
        texte: 'Une écriture inverse sera créée et validée. L\'écriture d\'origine reste en place, liée à sa contrepassation.',
        champs: [{ nom: 'date', etiquette: 'Date de la contrepassation', type: 'date', valeur: dateParDefaut(ctx, e.date), requis: true },
                 { nom: 'motif', etiquette: 'Motif (obligatoire)', requis: true }],
        bouton: 'Contrepasser' });
      if (v) await action(async () => {
        const r = await appeler('contrepasser_ecriture', { p_id: e.id, p_date: v.date, p_motif: v.motif });
        annoncer(`Contrepassation validée : ${r.numero}.`, 'succes');
        ctx.aller(`#/ecriture/${r.id}`);
      }, bCp);
    });
    ajouter(actions, bCp);
  }

  const liens = [];
  if (e.contrepasse_de) liens.push(h('p', {}, 'Contrepassation de ', h('a', { href: `#/ecriture/${e.contrepasse_de.id}` }, e.contrepasse_de.numero), '.'));
  if (e.contrepassee_par) liens.push(h('p', {}, 'Contrepassée par ', h('a', { href: `#/ecriture/${e.contrepassee_par.id}` }, e.contrepassee_par.numero), '.'));

  ajouter(zone, 
    h('p', { class: 'fil' }, h('a', { href: '#/ecritures' }, 'Écritures')),
    h('div', { class: 'titre-ecriture' },
      brouillard ? h('span', { class: 'etiquette-brouillard grande' }, 'Brouillard')
                 : h('span', { class: 'tampon', title: 'Écriture validée' }, e.numero),
      h('h1', {}, e.libelle)),
    h('dl', { class: 'infos' },
      info('Date', formatDate(e.date)), info('Journal', e.journal), info('Pièce', e.reference_piece || '—'),
      info('Saisie par', `${e.cree_par} le ${new Date(e.cree_le).toLocaleString('fr-FR')}`),
      brouillard ? null : info('Validée par', `${e.valide_par} le ${new Date(e.valide_le).toLocaleString('fr-FR')}`)),
    liens,
    h('div', { class: 'defilement' }, h('table', { class: 'tableau tableau-lignes' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Compte'), h('th', { scope: 'col' }, 'Libellé'), h('th', { scope: 'col' }, 'Tiers'),
        h('th', { scope: 'col' }, 'Analytique'), h('th', { scope: 'col', class: 'nombre' }, 'Débit'),
        h('th', { scope: 'col', class: 'nombre' }, 'Crédit'), h('th', { scope: 'col' }, 'Lettrage'))),
      h('tbody', {}, e.lignes.map((l) => h('tr', {},
        h('td', { 'data-titre': 'Compte' }, h('span', { class: 'numero-compte' }, l.compte), ' ', h('span', { class: 'discret' }, l.libelle_compte)),
        h('td', { 'data-titre': 'Libellé' }, l.libelle || ''),
        h('td', { 'data-titre': 'Tiers' }, l.tiers ? `${l.tiers} — ${l.nom_tiers}` : ''),
        h('td', { 'data-titre': 'Analytique' }, l.ventilations.map((v) => `${v.section}`).join(', ')),
        h('td', { 'data-titre': 'Débit', class: 'nombre' }, formatMontantOuVide(l.debit)),
        h('td', { 'data-titre': 'Crédit', class: 'nombre' }, formatMontantOuVide(l.credit)),
        h('td', { 'data-titre': 'Lettrage' }, l.code_lettrage || '')))),
      h('tfoot', {}, h('tr', {},
        h('th', { scope: 'row', colspan: '4' }, 'Total'),
        h('td', { class: 'nombre' }, formatMontant(totalD)), h('td', { class: 'nombre' }, formatMontant(totalC)), h('td', {}))))),
    erreurs, actions);
}

function info(terme, valeur) {
  return h('div', {}, h('dt', {}, terme), h('dd', {}, valeur));
}

function dateParDefaut(ctx, dateOrigine) {
  const jour = aujourdhui();
  const periodeOuverte = (d) => (ctx.ref.exercices || []).some((x) => (x.periodes || [])
    .some((p) => p.statut === 'ouverte' && d >= p.date_debut && d <= p.date_fin));
  if (periodeOuverte(dateOrigine)) return dateOrigine;
  if (periodeOuverte(jour)) return jour;
  return dateOrigine;
}

async function vueEcritureRecharger(ctx, zone, id) {
  zone.replaceChildren();
  await vueEcriture(ctx, zone, id);
}
