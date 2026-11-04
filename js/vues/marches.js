// Marchés et bons de commande : liste, fiche, indicateurs ; résultat par activité.
import { appeler } from '../client.js';
import { h, vider, ajouter, annoncer, blocErreur, dialogue } from '../ui.js';
import { formatMontant, formatDate, lireMontant } from '../format.js';

const NATURES = [
  { valeur: 'marche_public', libelle: 'Marché public' }, { valeur: 'marche_prive', libelle: 'Marché privé' },
  { valeur: 'bon_commande', libelle: 'Bon de commande client' },
];
const STATUTS = [
  { valeur: 'en_cours', libelle: 'En cours' }, { valeur: 'reception_provisoire', libelle: 'Réception provisoire' },
  { valeur: 'reception_definitive', libelle: 'Réception définitive' }, { valeur: 'clos', libelle: 'Clos' },
  { valeur: 'resilie', libelle: 'Résilié' },
];
const libelle = (liste, v) => (liste.find((x) => x.valeur === v) || {}).libelle || v;
const pourcent = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');

function montant(nom, texte, obligatoire) {
  const r = lireMontant(texte);
  if (!r.ok) throw new Error(`${nom} : ${r.erreur}`);
  if (obligatoire && !r.valeur) throw new Error(`${nom} : obligatoire.`);
  return r.valeur ? String(r.valeur) : '';
}

function boutonImprimer() {
  const b = h('button', { type: 'button', class: 'bouton secondaire' }, 'Imprimer / PDF');
  b.addEventListener('click', () => window.print());
  return b;
}

export async function vueMarches(ctx, zone, code) {
  const societe = ctx.habilitation.societe_id;
  const modifiable = ctx.peut('parametrage');
  const erreurs = h('div', { class: 'zone-erreur' });
  let onglet = 'marches';
  try { onglet = sessionStorage.getItem('gracias.marches.onglet') || 'marches'; } catch { /* sans effet */ }

  async function executer(fn, message) {
    vider(erreurs);
    try {
      await fn();
      annoncer(message, 'succes');
      await ctx.rechargerReference();
      await afficher();
    } catch (err) { ajouter(erreurs, blocErreur(err.message)); erreurs.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  async function afficher() {
    vider(zone);
    const d = await appeler('marches', { p_societe: societe });
    if (!d.suivi_actif) return afficherActivation();
    if (code) return afficherFiche(d, d.marches.find((m) => m.code === code));
    const barre = h('div', { class: 'filtres sans-impression', role: 'tablist' });
    for (const [cle, titre] of [['marches', 'Marchés et bons de commande'], ['activites', 'Résultat par activité']]) {
      const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(cle === onglet),
        class: cle === onglet ? 'bouton principal' : 'bouton secondaire' }, titre);
      b.addEventListener('click', () => { onglet = cle; try { sessionStorage.setItem('gracias.marches.onglet', cle); } catch { /* */ } afficher(); });
      ajouter(barre, b);
    }
    ajouter(zone, h('h1', {}, 'Marchés et activités'), barre, erreurs);
    if (onglet === 'activites') await afficherActivites();
    else afficherListe(d);
  }

  function afficherActivation() {
    ajouter(zone, h('h1', {}, 'Marchés et activités'), erreurs,
      h('p', {}, 'Le suivi par activité (BTP, fournitures, prestations de services, autres) et par marché n\'est pas encore activé.'),
      h('p', {}, 'Une fois activé, chaque ligne de charge (classe 6), de produit (classe 7) ou de retenue de garantie (4117) devra indiquer son activité. '
        + 'Les frais qui ne relèvent d\'aucune activité iront dans « Frais communs ». Vous pourrez aussi rattacher la ligne à un marché.'));
    if (!modifiable) return ajouter(zone, h('p', { class: 'discret' }, 'Seuls le gérant et le comptable peuvent l\'activer.'));
    const b = h('button', { type: 'button', class: 'bouton principal' }, 'Activer le suivi par activité et par marché');
    b.addEventListener('click', async () => {
      const ok = await dialogue({ titre: 'Activer le suivi ?', bouton: 'Activer',
        texte: 'L\'activité deviendra obligatoire à la validation des écritures de charges et de produits. Les écritures déjà validées ne changent pas.' });
      if (ok) await executer(() => appeler('activer_suivi_marches', { p_societe: societe }), 'Suivi activé.');
    });
    ajouter(zone, h('div', { class: 'actions' }, b));
  }

  function formulaire(d, m) {
    const clients = (ctx.ref.tiers || []).filter((t) => t.type === 'client').map((t) => ({ valeur: t.code, libelle: `${t.code} — ${t.nom}` }));
    const champs = m ? [
      { nom: 'objet', etiquette: 'Objet', valeur: m.objet, requis: true },
      { nom: 'reference', etiquette: 'N° du marché ou du bon de commande', valeur: m.reference || '' },
      { nom: 'statut', etiquette: 'Statut', type: 'select', options: STATUTS, valeur: m.statut },
      { nom: 'montant_ht', etiquette: 'Montant HT (FCFA)', valeur: String(m.montant_ht), requis: true },
      { nom: 'montant_ttc', etiquette: 'Montant TTC (FCFA, facultatif)', valeur: m.montant_ttc ? String(m.montant_ttc) : '' },
      { nom: 'taux_retenue', etiquette: 'Taux de retenue de garantie du contrat (%)', valeur: String(m.taux_retenue) },
      { nom: 'avance_demarrage', etiquette: 'Avance de démarrage (FCFA)', valeur: String(m.avance_demarrage) },
      { nom: 'date_fin_prevue', etiquette: 'Fin prévue des travaux / livraison', type: 'date', valeur: m.date_fin_prevue || '' },
      { nom: 'date_reception_provisoire', etiquette: 'Date de réception provisoire', type: 'date', valeur: m.date_reception_provisoire || '' },
      { nom: 'date_liberation_retenue', etiquette: 'Date prévue de libération de la retenue', type: 'date', valeur: m.date_liberation_retenue || '' },
      { nom: 'observations', etiquette: 'Observations', valeur: m.observations || '' },
    ] : [
      { nom: 'code', etiquette: 'Code court (ex. M2026-01, BC-SONEB-12)', requis: true },
      { nom: 'nature', etiquette: 'Nature', type: 'select', options: NATURES, valeur: 'marche_public' },
      { nom: 'reference', etiquette: 'N° du marché ou du bon de commande' },
      { nom: 'objet', etiquette: 'Objet', requis: true },
      { nom: 'client', etiquette: 'Client (maître d\'ouvrage)', type: 'select', options: [{ valeur: '', libelle: '— choisir —' }, ...clients], valeur: '' },
      { nom: 'activite', etiquette: 'Activité', type: 'select', options: d.activites.map((a) => ({ valeur: a.code, libelle: a.libelle })), valeur: 'BTP' },
      { nom: 'date_signature', etiquette: 'Date de signature / de réception du bon', type: 'date', requis: true },
      { nom: 'date_fin_prevue', etiquette: 'Fin prévue (facultatif)', type: 'date' },
      { nom: 'montant_ht', etiquette: 'Montant HT (FCFA)', requis: true },
      { nom: 'montant_ttc', etiquette: 'Montant TTC (FCFA, facultatif)' },
      { nom: 'taux_retenue', etiquette: 'Taux de retenue de garantie du contrat (%, 0 si aucune)', valeur: '0' },
      { nom: 'avance_demarrage', etiquette: 'Avance de démarrage (FCFA, facultatif)' },
    ];
    return dialogue({ titre: m ? `Modifier ${m.code}` : 'Nouveau marché ou bon de commande', champs, bouton: 'Enregistrer',
      texte: m ? null : clients.length ? null : 'Aucun client : créez-le d\'abord dans Paramétrage > Clients et fournisseurs.' });
  }

  function preparer(v) {
    const p = { ...v };
    if ('client' in p && !p.client) throw new Error('Choisissez le client.');
    p.montant_ht = montant('Montant HT', p.montant_ht, true);
    p.montant_ttc = montant('Montant TTC', p.montant_ttc, false);
    p.avance_demarrage = montant('Avance de démarrage', p.avance_demarrage, false) || '0';
    p.taux_retenue = String(p.taux_retenue || '0').replace(',', '.').trim();
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(p.taux_retenue) || Number(p.taux_retenue) > 100) throw new Error('Taux de retenue : nombre entre 0 et 100.');
    return p;
  }

  function afficherListe(d) {
    if (modifiable) {
      const b = h('button', { type: 'button', class: 'bouton principal' }, 'Nouveau marché ou bon de commande');
      b.addEventListener('click', async () => {
        const v = await formulaire(d, null);
        if (v) await executer(() => appeler('creer_marche', { p_societe: societe, p: preparer(v) }), `Marché ${v.code.toUpperCase()} créé.`);
      });
      ajouter(zone, h('div', { class: 'actions sans-impression' }, b, boutonImprimer()));
    }
    if (!d.marches.length) return ajouter(zone, h('p', { class: 'discret' }, 'Aucun marché enregistré.'));
    const tot = d.marches.reduce((t, m) => ({ ht: t.ht + Number(m.montant_ht), p: t.p + Number(m.produits),
      c: t.c + Number(m.charges), r: t.r + Number(m.retenues) }), { ht: 0, p: 0, c: 0, r: 0 });
    ajouter(zone, h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
      h('thead', {}, h('tr', {}, ['Marché', 'Client', 'Statut', 'Montant HT', 'Facturé', 'Exécution', 'Charges', 'Marge', 'Retenue']
        .map((t, i) => h('th', { scope: 'col', class: i >= 3 && i !== 5 ? 'nombre' : '' }, t)))),
      h('tbody', {}, d.marches.map((m) => h('tr', {},
        h('td', { 'data-titre': 'Marché' }, h('a', { href: `#/marche/${encodeURIComponent(m.code)}` }, m.code), h('br'),
          h('span', { class: 'discret' }, `${libelle(NATURES, m.nature)} — ${m.objet}`)),
        h('td', { 'data-titre': 'Client' }, m.nom_client),
        h('td', { 'data-titre': 'Statut' }, libelle(STATUTS, m.statut)),
        h('td', { 'data-titre': 'Montant HT', class: 'nombre' }, formatMontant(m.montant_ht)),
        h('td', { 'data-titre': 'Facturé', class: 'nombre' }, formatMontant(m.produits)),
        h('td', { 'data-titre': 'Exécution' }, pourcent(Number(m.produits), Number(m.montant_ht))),
        h('td', { 'data-titre': 'Charges', class: 'nombre' }, formatMontant(m.charges)),
        h('td', { 'data-titre': 'Marge', class: 'nombre' }, formatMontant(m.marge)),
        h('td', { 'data-titre': 'Retenue', class: 'nombre' }, formatMontant(m.retenues))))),
      h('tfoot', {}, h('tr', {}, h('th', { scope: 'row', colspan: '3' }, 'Total'),
        h('td', { class: 'nombre' }, formatMontant(tot.ht)), h('td', { class: 'nombre' }, formatMontant(tot.p)), h('td', {}),
        h('td', { class: 'nombre' }, formatMontant(tot.c)), h('td', { class: 'nombre' }, formatMontant(tot.p - tot.c)),
        h('td', { class: 'nombre' }, formatMontant(tot.r)))))),
    h('p', { class: 'discret' }, 'Montants issus des écritures validées. Pour rattacher une opération à un marché, choisissez le marché '
      + 'sur la ligne de charge, de produit ou de retenue (4117) lors de la saisie.'));
  }

  async function afficherFiche(d, m) {
    ajouter(zone, h('p', { class: 'fil' }, h('a', { href: '#/marches' }, 'Marchés')));
    if (!m) return ajouter(zone, blocErreur('Marché introuvable.'));
    const info = (t, v) => h('div', {}, h('dt', {}, t), h('dd', {}, v ?? '—'));
    const retenuePrevue = Math.round(Number(m.montant_ttc || m.montant_ht) * Number(m.taux_retenue) / 100);
    ajouter(zone, h('h1', {}, `${m.code} — ${m.objet}`), erreurs,
      h('dl', { class: 'infos' },
        info('Nature', libelle(NATURES, m.nature)), info('N°', m.reference), info('Client', m.nom_client),
        info('Activité', m.libelle_activite), info('Statut', libelle(STATUTS, m.statut)),
        info('Signé le', formatDate(m.date_signature)), info('Fin prévue', m.date_fin_prevue ? formatDate(m.date_fin_prevue) : null),
        info('Réception provisoire', m.date_reception_provisoire ? formatDate(m.date_reception_provisoire) : null),
        info('Libération de la retenue', m.date_liberation_retenue ? formatDate(m.date_liberation_retenue) : null)),
      h('dl', { class: 'infos' },
        info('Montant HT', formatMontant(m.montant_ht)), info('Montant TTC', m.montant_ttc ? formatMontant(m.montant_ttc) : null),
        info('Facturé (HT)', `${formatMontant(m.produits)} (${pourcent(Number(m.produits), Number(m.montant_ht))})`),
        info('Reste à facturer', formatMontant(m.reste_a_facturer)),
        info('Charges', formatMontant(m.charges)),
        info('Marge', `${formatMontant(m.marge)} (${pourcent(Number(m.marge), Number(m.produits))} du facturé)`),
        info('Retenue de garantie en attente', formatMontant(m.retenues)),
        info(`Retenue prévue au contrat (${m.taux_retenue} %)`, formatMontant(retenuePrevue)),
        info('Avance de démarrage', formatMontant(m.avance_demarrage))),
      m.observations ? h('p', {}, m.observations) : null);
    const actions = h('div', { class: 'actions sans-impression' }, boutonImprimer());
    if (modifiable) {
      const b = h('button', { type: 'button', class: 'bouton secondaire' }, 'Modifier');
      b.addEventListener('click', async () => {
        const v = await formulaire(d, m);
        if (v) await executer(() => appeler('modifier_marche', { p_societe: societe, p_code: m.code, p: preparer(v) }), 'Marché mis à jour.');
      });
      actions.prepend(b);
    }
    ajouter(zone, actions);
    const ecr = await appeler('ecritures_marche', { p_societe: societe, p_code: m.code });
    ajouter(zone, h('h2', {}, `Écritures rattachées (${ecr.length})`));
    if (!ecr.length) return ajouter(zone, h('p', { class: 'discret' }, 'Aucune écriture rattachée à ce marché.'));
    ajouter(zone, h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
      h('thead', {}, h('tr', {}, ['Date', 'N°', 'Libellé', 'Produits', 'Charges', 'Retenue']
        .map((t, i) => h('th', { scope: 'col', class: i >= 3 ? 'nombre' : '' }, t)))),
      h('tbody', {}, ecr.map((e) => h('tr', {},
        h('td', { 'data-titre': 'Date' }, formatDate(e.date)),
        h('td', { 'data-titre': 'N°' }, h('a', { href: `#/ecriture/${e.id}` }, e.statut === 'brouillard' ? 'Brouillard' : e.numero)),
        h('td', { 'data-titre': 'Libellé' }, e.libelle),
        h('td', { 'data-titre': 'Produits', class: 'nombre' }, formatMontant(e.produits)),
        h('td', { 'data-titre': 'Charges', class: 'nombre' }, formatMontant(e.charges)),
        h('td', { 'data-titre': 'Retenue', class: 'nombre' }, formatMontant(e.retenues))))))),
    h('p', { class: 'discret' }, 'Les brouillards sont listés mais ne comptent dans les indicateurs qu\'une fois validés.'));
  }

  async function afficherActivites() {
    const ex = ctx.exercice;
    const du = h('input', { type: 'date', name: 'du', value: ex ? ex.date_debut : '' });
    const au = h('input', { type: 'date', name: 'au', value: ex ? ex.date_fin : '' });
    const resultat = h('div', {});
    const voir = h('button', { type: 'button', class: 'bouton secondaire' }, 'Afficher');
    async function calculer() {
      vider(resultat);
      try {
        const r = await appeler('resultat_activites', { p_societe: societe, p_du: du.value || null, p_au: au.value || null });
        const somme = (k) => r.activites.reduce((t, a) => t + Number(a[k]), 0);
        const np = Number(r.total.produits) - somme('produits');
        const nc = Number(r.total.charges) - somme('charges');
        const ligne = (nom, p, c, cls) => h('tr', { class: cls || '' }, h('th', { scope: 'row' }, nom),
          h('td', { class: 'nombre' }, formatMontant(p)), h('td', { class: 'nombre' }, formatMontant(c)),
          h('td', { class: 'nombre' }, formatMontant(p - c)));
        ajouter(resultat, h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Activité'), h('th', { scope: 'col', class: 'nombre' }, 'Produits'),
            h('th', { scope: 'col', class: 'nombre' }, 'Charges'), h('th', { scope: 'col', class: 'nombre' }, 'Résultat'))),
          h('tbody', {}, r.activites.map((a) => ligne(a.libelle, Number(a.produits), Number(a.charges))),
            np || nc ? ligne('Non ventilé (écritures antérieures à l\'activation)', np, nc, 'discret') : null),
          h('tfoot', {}, ligne('Total', Number(r.total.produits), Number(r.total.charges))))),
        h('p', { class: 'discret' }, 'Écritures validées de la période. Le total est égal au résultat des comptes de classes 6 et 7 '
          + '(hors classe 8 : produits et charges hors activités ordinaires, impôt sur le résultat).'));
      } catch (err) { ajouter(resultat, blocErreur(err.message)); }
    }
    voir.addEventListener('click', calculer);
    ajouter(zone, h('div', { class: 'filtres sans-impression' },
      h('label', { class: 'champ' }, h('span', {}, 'Du'), du), h('label', { class: 'champ' }, h('span', {}, 'Au'), au), voir, boutonImprimer()),
      resultat);
    await calculer();
  }

  await afficher();
}
