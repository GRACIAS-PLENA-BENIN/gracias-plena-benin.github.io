// Grand livre d'un compte : solde initial, mouvements, solde progressif, export.
import { appeler } from '../client.js';
import { h, vider, blocErreur, telecharger, ajouter } from '../ui.js';
import { formatMontant, formatMontantOuVide, formatDate, sensSolde, versCsv } from '../format.js';

export async function vueGrandLivre(ctx, zone) {
  const x = ctx.exercice;
  const memo = sessionStorage.getItem('gracias.gl.compte') || '';
  const listeComptes = h('datalist', { id: 'liste-comptes-gl' },
    ctx.ref.comptes.map((c) => h('option', { value: c.numero }, `${c.numero} — ${c.libelle}`)));
  const champCompte = h('input', { type: 'text', list: 'liste-comptes-gl', inputmode: 'numeric', value: memo, required: true });
  const champDu = h('input', { type: 'date', value: x.date_debut, min: x.date_debut, max: x.date_fin });
  const champAu = h('input', { type: 'date', value: x.date_fin, min: x.date_debut, max: x.date_fin });
  const resultat = h('div', { class: 'resultat' });
  const bouton = h('button', { type: 'submit', class: 'bouton principal' }, 'Afficher');

  async function charger() {
    const compte = champCompte.value.split(/\s/)[0].trim();
    if (!compte) { ajouter(vider(resultat), blocErreur('Choisissez un compte.')); return; }
    try { sessionStorage.setItem('gracias.gl.compte', compte); } catch { /* sans effet */ }
    ajouter(vider(resultat), h('p', { class: 'discret' }, 'Chargement…'));
    try {
      const gl = await appeler('grand_livre', { p_societe: ctx.habilitation.societe_id, p_exercice: x.id,
        p_compte: compte, p_date_debut: champDu.value || null, p_date_fin: champAu.value || null });
      afficher(gl);
    } catch (err) { ajouter(vider(resultat), blocErreur(err.message)); }
  }

  function solde(v) {
    const s = sensSolde(v);
    return h('span', { class: 'solde' }, s.montant, s.sens ? h('span', { class: 'sens' }, ` ${s.sens}`) : null);
  }

  function afficher(gl) {
    const exporter = h('button', { type: 'button', class: 'bouton secondaire' }, 'Exporter (CSV)');
    exporter.addEventListener('click', () => telecharger(`grand-livre-${gl.compte}-${gl.date_debut}-${gl.date_fin}.csv`,
      versCsv([{ date: gl.date_debut, numero: '', journal: '', libelle: 'Solde initial', tiers: '', debit: '', credit: '', solde: gl.solde_initial, lettrage: '' },
               ...gl.lignes], [
        { titre: 'Date', valeur: (l) => formatDate(l.date) }, { titre: 'Numéro', valeur: (l) => l.numero },
        { titre: 'Journal', valeur: (l) => l.journal }, { titre: 'Libellé', valeur: (l) => l.libelle },
        { titre: 'Tiers', valeur: (l) => l.tiers || '' }, { titre: 'Débit', valeur: (l) => l.debit || '' },
        { titre: 'Crédit', valeur: (l) => l.credit || '' }, { titre: 'Solde (débit - crédit)', valeur: (l) => l.solde },
        { titre: 'Lettrage', valeur: (l) => l.lettrage || '' }])));
    ajouter(vider(resultat), 
      h('div', { class: 'synthese' },
        h('h2', {}, `${gl.compte} — ${gl.libelle}`),
        h('p', { class: 'discret' }, `Du ${formatDate(gl.date_debut)} au ${formatDate(gl.date_fin)}. Écritures validées uniquement.`),
        h('dl', { class: 'chiffres' },
          h('div', {}, h('dt', {}, 'Solde initial'), h('dd', {}, solde(gl.solde_initial))),
          h('div', {}, h('dt', {}, 'Total débit'), h('dd', { class: 'nombre' }, formatMontant(gl.total_debit))),
          h('div', {}, h('dt', {}, 'Total crédit'), h('dd', { class: 'nombre' }, formatMontant(gl.total_credit))),
          h('div', { class: 'fort' }, h('dt', {}, 'Solde final'), h('dd', { class: 'solde-final' }, solde(gl.solde_final))))),
      gl.lignes.length === 0
        ? h('p', { class: 'vide' }, 'Aucun mouvement validé sur ce compte pour cette période.')
        : h('div', { class: 'defilement' }, h('table', { class: 'tableau tableau-gl' },
            h('thead', {}, h('tr', {},
              ['Date', 'Numéro', 'Journal', 'Libellé', 'Tiers'].map((t) => h('th', { scope: 'col' }, t)),
              ['Débit', 'Crédit', 'Solde'].map((t) => h('th', { scope: 'col', class: 'nombre' }, t)),
              h('th', { scope: 'col' }, 'Lettr.'))),
            h('tbody', {}, gl.lignes.map((l) => h('tr', {},
              h('td', {}, formatDate(l.date)),
              h('td', {}, h('a', { href: `#/ecriture/${l.ecriture_id}`, class: 'numero' }, l.numero)),
              h('td', {}, l.journal), h('td', { class: 'libelle' }, l.libelle), h('td', {}, l.tiers || ''),
              h('td', { class: 'nombre' }, formatMontantOuVide(l.debit)),
              h('td', { class: 'nombre' }, formatMontantOuVide(l.credit)),
              h('td', { class: 'nombre' }, solde(l.solde)),
              h('td', {}, l.lettrage || '')))))),
      h('div', { class: 'actions sans-impression' }, exporter, boutonImprimer()));
  }

  const form = h('form', { class: 'filtres', novalidate: true },
    h('label', { class: 'champ' }, h('span', {}, 'Compte'), champCompte),
    h('label', { class: 'champ' }, h('span', {}, 'Du'), champDu),
    h('label', { class: 'champ' }, h('span', {}, 'Au'), champAu), bouton);
  form.addEventListener('submit', (e) => { e.preventDefault(); charger(); });

  ajouter(zone, h('h1', {}, 'Grand livre'), listeComptes, form, resultat);
  if (memo) await charger(); else champCompte.focus();
}

function boutonImprimer() {
  const b = h('button', { type: 'button', class: 'bouton secondaire' }, 'Imprimer / PDF');
  b.addEventListener('click', () => window.print());
  return b;
}
