// Balance générale à six colonnes, avec contrôle d'équilibre et export.
import { appeler } from '../client.js';
import { h, vider, blocErreur, telecharger, ajouter } from '../ui.js';
import { formatMontant, formatMontantOuVide, formatDate, versCsv } from '../format.js';

export async function vueBalance(ctx, zone) {
  const x = ctx.exercice;
  const champDu = h('input', { type: 'date', value: x.date_debut, min: x.date_debut, max: x.date_fin });
  const champAu = h('input', { type: 'date', value: x.date_fin, min: x.date_debut, max: x.date_fin });
  const champClasse = h('select', {}, h('option', { value: '' }, 'Toutes les classes'),
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => h('option', { value: String(c) }, `Classe ${c}`)));
  const resultat = h('div', { class: 'resultat' });

  async function charger() {
    ajouter(vider(resultat), h('p', { class: 'discret' }, 'Chargement…'));
    try {
      const lignes = await appeler('balance', { p_societe: ctx.habilitation.societe_id, p_exercice: x.id,
        p_date_debut: champDu.value || null, p_date_fin: champAu.value || null,
        p_classe: champClasse.value ? Number(champClasse.value) : null });
      afficher(lignes);
    } catch (err) { ajouter(vider(resultat), blocErreur(err.message)); }
  }

  function afficher(lignes) {
    const cols = ['initial_debit', 'initial_credit', 'mouvement_debit', 'mouvement_credit', 'final_debit', 'final_credit'];
    const tot = Object.fromEntries(cols.map((c) => [c, lignes.reduce((s, l) => s + Number(l[c]), 0)]));
    const equilibree = tot.initial_debit === tot.initial_credit && tot.mouvement_debit === tot.mouvement_credit
                    && tot.final_debit === tot.final_credit;
    const partielle = Boolean(champClasse.value);
    const exporter = h('button', { type: 'button', class: 'bouton secondaire' }, 'Exporter (CSV)');
    exporter.addEventListener('click', () => telecharger(`balance-${x.code}-${champDu.value}-${champAu.value}.csv`,
      versCsv(lignes, [{ titre: 'Compte', valeur: (l) => l.compte }, { titre: 'Intitulé', valeur: (l) => l.libelle },
        { titre: 'Solde initial débit', valeur: (l) => l.initial_debit }, { titre: 'Solde initial crédit', valeur: (l) => l.initial_credit },
        { titre: 'Mouvements débit', valeur: (l) => l.mouvement_debit }, { titre: 'Mouvements crédit', valeur: (l) => l.mouvement_credit },
        { titre: 'Solde final débit', valeur: (l) => l.final_debit }, { titre: 'Solde final crédit', valeur: (l) => l.final_credit }])));

    vider(resultat);
    if (!lignes.length) { ajouter(resultat, h('p', { class: 'vide' }, 'Aucun compte mouvementé sur cette période.')); return; }
    ajouter(resultat, 
      h('p', { class: partielle ? 'discret' : (equilibree ? 'controle-ok' : 'erreur') },
        partielle ? 'Balance partielle (une seule classe) : l\'égalité débit / crédit ne s\'applique qu\'à la balance complète.'
          : equilibree ? `Balance équilibrée : débits et crédits égaux sur les trois colonnes (du ${formatDate(champDu.value)} au ${formatDate(champAu.value)}).`
            : 'ANOMALIE : la balance n\'est pas équilibrée. Ne poursuivez pas et contactez l\'administrateur.'),
      h('div', { class: 'defilement' }, h('table', { class: 'tableau tableau-balance' },
        h('thead', {},
          h('tr', {}, h('th', { scope: 'col', rowspan: '2' }, 'Compte'), h('th', { scope: 'col', rowspan: '2' }, 'Intitulé'),
            h('th', { scope: 'colgroup', colspan: '2', class: 'groupe' }, 'Solde initial'),
            h('th', { scope: 'colgroup', colspan: '2', class: 'groupe' }, 'Mouvements de la période'),
            h('th', { scope: 'colgroup', colspan: '2', class: 'groupe' }, 'Solde final')),
          h('tr', {}, ['Débit', 'Crédit', 'Débit', 'Crédit', 'Débit', 'Crédit'].map((t) => h('th', { scope: 'col', class: 'nombre' }, t)))),
        h('tbody', {}, lignes.map((l) => h('tr', {},
          h('td', {}, h('a', { href: '#/grand-livre', class: 'numero-compte',
            onclick: () => { try { sessionStorage.setItem('gracias.gl.compte', l.compte); } catch { /* */ } } }, l.compte)),
          h('td', { class: 'libelle' }, l.libelle),
          cols.map((c) => h('td', { class: 'nombre' }, formatMontantOuVide(l[c])))))),
        h('tfoot', {}, h('tr', {}, h('th', { scope: 'row', colspan: '2' }, 'Totaux'),
          cols.map((c) => h('td', { class: 'nombre' }, formatMontant(tot[c]))))))),
      h('div', { class: 'actions sans-impression' }, exporter, boutonImprimer()));
  }

  const form = h('form', { class: 'filtres', novalidate: true },
    h('label', { class: 'champ' }, h('span', {}, 'Du'), champDu),
    h('label', { class: 'champ' }, h('span', {}, 'Au'), champAu),
    h('label', { class: 'champ' }, h('span', {}, 'Classe'), champClasse),
    h('button', { type: 'submit', class: 'bouton principal' }, 'Afficher'));
  form.addEventListener('submit', (e) => { e.preventDefault(); charger(); });
  ajouter(zone, h('h1', {}, 'Balance générale'),
    h('p', { class: 'discret' }, 'Écritures validées uniquement. Les brouillards n\'ont aucun effet sur la balance.'),
    form, resultat);
  await charger();
}

function boutonImprimer() {
  const b = h('button', { type: 'button', class: 'bouton secondaire' }, 'Imprimer / PDF');
  b.addEventListener('click', () => window.print());
  return b;
}
