// Factures clients : liste, saisie, émission (écriture automatique), e-MECeF, impression ; TVA.
import { appeler } from '../client.js';
import { h, vider, ajouter, annoncer, blocErreur, dialogue } from '../ui.js';
import { formatMontant, formatDate, lireMontant, aujourdhui } from '../format.js';

export async function vueFactures(ctx, zone, id) {
  const societe = ctx.habilitation.societe_id;
  const erreurs = h('div', { class: 'zone-erreur' });
  let onglet = 'factures';
  try { onglet = sessionStorage.getItem('gracias.factures.onglet') || 'factures'; } catch { /* sans effet */ }

  const erreur = (err) => { ajouter(vider(erreurs), blocErreur(err.message)); erreurs.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  async function afficher() {
    vider(zone);
    if (id === 'nouvelle') return formulaire(null);
    if (id) return fiche(id);
    const barre = h('div', { class: 'filtres sans-impression', role: 'tablist' });
    for (const [cle, titre] of [['factures', 'Factures clients'], ['tva', 'TVA']]) {
      const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(cle === onglet), class: cle === onglet ? 'bouton principal' : 'bouton secondaire' }, titre);
      b.addEventListener('click', () => { onglet = cle; try { sessionStorage.setItem('gracias.factures.onglet', cle); } catch { /* */ } afficher(); });
      ajouter(barre, b);
    }
    ajouter(zone, h('h1', {}, 'Factures et TVA'), barre, erreurs);
    if (onglet === 'tva') return tva();
    return liste();
  }

  async function liste() {
    const ex = ctx.exercice;
    const f = await appeler('factures', { p_societe: societe, p_du: ex ? ex.date_debut : null, p_au: ex ? ex.date_fin : null });
    const taux = await appeler('taux_tva', { p_societe: societe });
    const actions = h('div', { class: 'actions sans-impression' });
    if (ctx.peut('saisie')) ajouter(actions, h('a', { class: 'bouton principal', href: '#/facture/nouvelle' }, 'Nouvelle facture'));
    ajouter(zone, actions);
    if (!taux.some((x) => x.actif)) ajouter(zone, h('p', { class: 'avertissement' }, 'Aucun taux de TVA paramétré : ouvrez l\'onglet TVA pour l\'ajouter.'));
    const aNormaliser = f.filter((x) => x.statut === 'emise' && !x.emecef_code).length;
    if (aNormaliser) ajouter(zone, h('p', { class: 'avertissement' }, `${aNormaliser} facture(s) émise(s) sans numéro e-MECeF : normalisez-les auprès de la DGI puis saisissez leur numéro.`));
    if (!f.length) return ajouter(zone, h('p', { class: 'discret' }, 'Aucune facture sur l\'exercice.'));
    ajouter(zone, h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
      h('thead', {}, h('tr', {}, ['N°', 'Date', 'Client', 'Objet', 'HT', 'TVA', 'TTC', 'e-MECeF'].map((t, i) => h('th', { scope: 'col', class: i >= 4 && i <= 6 ? 'nombre' : '' }, t)))),
      h('tbody', {}, f.map((x) => h('tr', {},
        h('td', { 'data-titre': 'N°' }, h('a', { href: `#/facture/${x.id}` }, x.numero || 'Brouillon')),
        h('td', { 'data-titre': 'Date' }, formatDate(x.date_facture)), h('td', { 'data-titre': 'Client' }, x.nom_client),
        h('td', { 'data-titre': 'Objet' }, x.objet + (x.marche ? ` (${x.marche})` : '')),
        h('td', { 'data-titre': 'HT', class: 'nombre' }, formatMontant(x.total_ht)), h('td', { 'data-titre': 'TVA', class: 'nombre' }, formatMontant(x.total_tva)),
        h('td', { 'data-titre': 'TTC', class: 'nombre' }, formatMontant(x.total_ttc)),
        h('td', { 'data-titre': 'e-MECeF' }, x.statut === 'brouillon' ? '—' : (x.emecef_code || h('strong', {}, 'À normaliser')))))))));
  }

  async function tva() {
    const taux = await appeler('taux_tva', { p_societe: societe });
    if (ctx.peut('parametrage')) {
      const b = h('button', { type: 'button', class: 'bouton secondaire' }, 'Ajouter ou modifier un taux');
      b.addEventListener('click', async () => {
        const v = await dialogue({ titre: 'Taux de TVA', texte: 'Indiquez la référence du Code général des impôts (article) pour la traçabilité.',
          champs: [{ nom: 'code', etiquette: 'Code (ex. TVA18, EXO)', valeur: 'TVA18', requis: true }, { nom: 'libelle', etiquette: 'Libellé', valeur: 'TVA taux normal', requis: true },
            { nom: 'taux', etiquette: 'Taux (%)', valeur: '18', requis: true }, { nom: 'reference', etiquette: 'Référence légale (CGI, article…)', valeur: '' },
            { nom: 'actif', etiquette: 'Actif', type: 'checkbox', valeur: true }], bouton: 'Enregistrer' });
        if (!v) return;
        try { await appeler('enregistrer_taux_tva', { p_societe: societe, p: { ...v, taux: String(v.taux).replace(',', '.') } }); annoncer('Taux enregistré.', 'succes'); await afficher(); } catch (err) { erreur(err); }
      });
      ajouter(zone, h('div', { class: 'actions sans-impression' }, b));
    }
    ajouter(zone, h('h2', {}, 'Taux paramétrés'), taux.length ? h('ul', { class: 'liste' }, taux.map((x) =>
      h('li', {}, `${x.code} — ${x.libelle} : ${x.taux} %${x.reference ? ` (${x.reference})` : ' (référence légale à compléter)'}${x.actif ? '' : ' — inactif'}`)))
      : h('p', { class: 'discret' }, 'Aucun taux.'));
    const ex = ctx.exercice;
    const etat = await appeler('etat_tva', { p_societe: societe, p_du: ex ? ex.date_debut : null, p_au: ex ? ex.date_fin : null });
    const imp = h('button', { type: 'button', class: 'bouton secondaire sans-impression' }, 'Imprimer / PDF');
    imp.addEventListener('click', () => window.print());
    ajouter(zone, h('h2', {}, 'TVA par mois (écritures validées)'), imp, h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
      h('thead', {}, h('tr', {}, ['Mois', 'TVA collectée (443)', 'TVA récupérable (445)', 'Solde'].map((t, i) => h('th', { scope: 'col', class: i ? 'nombre' : '' }, t)))),
      h('tbody', {}, etat.map((m) => h('tr', {}, h('td', {}, m.mois.split('-').reverse().join('/')),
        h('td', { class: 'nombre' }, formatMontant(m.collectee)), h('td', { class: 'nombre' }, formatMontant(m.recuperable)),
        h('td', { class: 'nombre' }, `${formatMontant(Math.abs(m.solde))} ${Number(m.solde) >= 0 ? 'à payer' : 'crédit'}`)))))),
    h('p', { class: 'discret' }, 'Aide à la préparation de la déclaration : les montants, les éventuelles retenues à la source et la déclaration elle-même sont à vérifier avant dépôt. '
      + 'Pensez à imputer la TVA de vos achats sur le compte 445 correspondant lors de la saisie.'));
  }

  async function formulaire(existante) {
    const taux = (await appeler('taux_tva', { p_societe: societe })).filter((x) => x.actif);
    const marches = await appeler('marches', { p_societe: societe }).catch(() => ({ marches: [], activites: [] }));
    const clients = (ctx.ref.tiers || []).filter((t) => t.type === 'client');
    const produits = (ctx.ref.comptes || []).filter((c) => /^7/.test(c.numero));
    const sel = (nom, options, valeur, vide) => { const s = h('select', { name: nom }, vide ? h('option', { value: '' }, vide) : null,
      options.map((o) => h('option', { value: o.valeur }, o.libelle))); s.value = valeur ?? ''; return s; };
    const e = existante || { date_facture: aujourdhui(), lignes: [] };
    const client = sel('client', clients.map((t) => ({ valeur: t.code, libelle: `${t.code} — ${t.nom}` })), e.client, '— client —');
    const date = h('input', { type: 'date', name: 'date_facture', value: e.date_facture });
    const objet = h('input', { type: 'text', name: 'objet', value: e.objet || '', placeholder: 'ex. Décompte n°2 — construction de 3 classes' });
    const marche = sel('marche', marches.marches.filter((m) => !['clos', 'resilie'].includes(m.statut)).map((m) => ({ valeur: m.code, libelle: `${m.code} — ${m.objet}` })), e.marche, '(aucun marché)');
    const activite = sel('activite', (marches.activites || []).map((a) => ({ valeur: a.code, libelle: a.libelle })), e.activite, '(activité du marché)');
    const retenue = h('input', { type: 'text', inputmode: 'numeric', name: 'retenue_garantie', value: e.retenue_garantie ? String(e.retenue_garantie) : '' });
    const corps = h('tbody', {});
    const totaux = h('p', { 'aria-live': 'polite' });
    const lignes = [];
    function ajouterLigne(l = {}) {
      const r = { designation: h('input', { type: 'text', name: 'designation', value: l.designation || '' }),
        quantite: h('input', { type: 'text', inputmode: 'decimal', name: 'quantite', value: l.quantite ? String(l.quantite) : '1', size: 6 }),
        prix: h('input', { type: 'text', inputmode: 'numeric', name: 'prix_unitaire', value: l.prix_unitaire ? String(l.prix_unitaire) : '' }),
        compte: sel('compte', produits.map((c) => ({ valeur: c.numero, libelle: `${c.numero} — ${c.libelle}` })), l.compte || (produits.find((c) => c.numero === '7051') ? '7051' : produits[0]?.numero)),
        taux: sel('taux_tva', taux.map((x) => ({ valeur: x.code, libelle: `${x.code} (${x.taux} %)` })), l.taux_tva ?? (taux[0]?.code || ''), 'Sans TVA') };
      const suppr = h('button', { type: 'button', class: 'bouton danger-discret petit', 'aria-label': 'Supprimer la ligne' }, '✕');
      const tr = h('tr', {}, h('td', {}, r.designation), h('td', {}, r.quantite), h('td', {}, r.prix), h('td', {}, r.compte), h('td', {}, r.taux), h('td', {}, suppr));
      suppr.addEventListener('click', () => { lignes.splice(lignes.indexOf(r), 1); tr.remove(); calculer(); });
      Object.values(r).forEach((x) => x.addEventListener('input', calculer));
      lignes.push(r); corps.append(tr); calculer();
    }
    function lire() {
      const ls = lignes.map((r, i) => {
        const q = String(r.quantite.value).replace(',', '.').trim();
        if (!/^\d+(\.\d{1,3})?$/.test(q) || Number(q) <= 0) throw new Error(`Ligne ${i + 1} : quantité invalide.`);
        const p = lireMontant(r.prix.value);
        if (!p.ok) throw new Error(`Ligne ${i + 1} : ${p.erreur}`);
        if (!r.designation.value.trim()) throw new Error(`Ligne ${i + 1} : désignation manquante.`);
        return { designation: r.designation.value.trim(), quantite: q, prix_unitaire: String(p.valeur), compte: r.compte.value, taux_tva: r.taux.value };
      });
      const ret = lireMontant(retenue.value);
      if (!ret.ok) throw new Error(`Retenue : ${ret.erreur}`);
      if (!client.value) throw new Error('Choisissez le client.');
      if (!objet.value.trim()) throw new Error('Indiquez l\'objet de la facture.');
      return { client: client.value, date_facture: date.value, objet: objet.value.trim(), marche: marche.value, activite: activite.value,
        retenue_garantie: String(ret.valeur), lignes: ls };
    }
    function calculer() {
      let ht = 0; let tv = 0;
      for (const r of lignes) {
        const q = Number(String(r.quantite.value).replace(',', '.')) || 0;
        const p = lireMontant(r.prix.value).valeur || 0;
        const l = Math.round(q * p);
        const t = taux.find((x) => x.code === r.taux.value);
        ht += l; tv += t ? Math.round(l * Number(t.taux) / 100) : 0;
      }
      const ret = lireMontant(retenue.value).valeur || 0;
      totaux.replaceChildren(`Total HT ${formatMontant(ht)} · TVA ${formatMontant(tv)} · TTC ${formatMontant(ht + tv)}${ret ? ` · Net à payer ${formatMontant(ht + tv - ret)}` : ''} (estimation, le calcul définitif est fait par la base)`);
    }
    retenue.addEventListener('input', calculer);
    const plus = h('button', { type: 'button', class: 'bouton secondaire' }, 'Ajouter une ligne');
    plus.addEventListener('click', () => ajouterLigne());
    const enregistrer = h('button', { type: 'button', class: 'bouton principal' }, 'Enregistrer le brouillon');
    enregistrer.addEventListener('click', async () => {
      try {
        const nid = await appeler('enregistrer_facture', { p_societe: societe, p_id: existante?.id || null, p: lire() });
        annoncer('Brouillon enregistré.', 'succes');
        window.location.hash = `#/facture/${nid}`;
      } catch (err) { erreur(err); }
    });
    const lab = (t, el) => h('label', { class: 'champ' }, h('span', {}, t), el);
    ajouter(zone, h('p', { class: 'fil' }, h('a', { href: '#/factures' }, 'Factures')), h('h1', {}, existante ? 'Modifier le brouillon' : 'Nouvelle facture'), erreurs,
      h('div', { class: 'grille-formulaire' }, lab('Client', client), lab('Date', date), lab('Objet', objet), lab('Marché', marche), lab('Activité', activite),
        lab('Retenue de garantie (FCFA)', retenue)),
      h('div', { class: 'defilement' }, h('table', { class: 'tableau' }, h('thead', {}, h('tr', {}, ['Désignation', 'Qté', 'Prix unitaire HT', 'Compte', 'TVA', ''].map((t) => h('th', { scope: 'col' }, t)))), corps)),
      h('div', { class: 'actions' }, plus), totaux, h('div', { class: 'actions' }, enregistrer));
    (e.lignes.length ? e.lignes : [{}]).forEach(ajouterLigne);
  }

  async function fiche(fid) {
    const f = await appeler('facture', { p_id: fid });
    if (f.statut === 'brouillon' && ctx.peut('saisie') && window.location.hash.endsWith('/modifier')) return formulaire(f);
    const actions = h('div', { class: 'actions sans-impression' });
    const bouton = (t, cls, fn) => { const b = h('button', { type: 'button', class: `bouton ${cls}` }, t); b.addEventListener('click', fn); ajouter(actions, b); };
    if (f.statut === 'brouillon') {
      if (ctx.peut('saisie')) {
        bouton('Modifier', 'secondaire', () => { window.location.hash = `#/facture/${fid}/modifier`; });
        bouton('Supprimer', 'danger-discret', async () => {
          if (await dialogue({ titre: 'Supprimer ce brouillon ?', bouton: 'Supprimer', danger: true })) {
            try { await appeler('supprimer_facture', { p_id: fid }); window.location.hash = '#/factures'; } catch (err) { erreur(err); }
          }
        });
      }
      if (ctx.peut('validation')) bouton('Émettre la facture', 'principal', async () => {
        if (!await dialogue({ titre: 'Émettre la facture ?', bouton: 'Émettre',
          texte: 'Elle recevra son numéro définitif et l\'écriture de vente sera validée. Elle ne pourra plus être modifiée. Normalisez-la ensuite sur e-MECeF.' })) return;
        try { const n = await appeler('emettre_facture', { p_id: fid }); annoncer(`Facture ${n} émise.`, 'succes'); await afficher(); } catch (err) { erreur(err); }
      });
    } else if (!f.emecef_code && ctx.peut('saisie')) {
      bouton('Saisir le numéro e-MECeF', 'principal', async () => {
        const v = await dialogue({ titre: 'Facture normalisée e-MECeF', texte: 'Recopiez le numéro (ou code) attribué par la DGI à cette facture.',
          champs: [{ nom: 'code', etiquette: 'Numéro / code e-MECeF', requis: true }, { nom: 'date', etiquette: 'Date de normalisation', type: 'date', valeur: aujourdhui() }], bouton: 'Enregistrer' });
        if (!v) return;
        try { await appeler('enregistrer_emecef', { p_id: fid, p_code: v.code, p_date: v.date || null }); annoncer('Numéro e-MECeF enregistré.', 'succes'); await afficher(); } catch (err) { erreur(err); }
      });
    }
    bouton('Imprimer / PDF', 'secondaire', () => window.print());
    const s = f.societe;
    ajouter(zone, h('p', { class: 'fil sans-impression' }, h('a', { href: '#/factures' }, 'Factures')), erreurs, actions,
      h('div', { class: 'document-facture' },
        h('div', { class: 'entete-facture' },
          h('div', {}, h('strong', {}, s.raison_sociale), h('br'), `IFU ${s.ifu || '—'} · RCCM ${s.rccm || '—'}`),
          h('div', {}, h('h1', {}, f.numero ? `Facture ${f.numero}` : 'Facture (brouillon)'), `Date : ${formatDate(f.date_facture)}`)),
        h('p', {}, h('strong', {}, 'Client : '), `${f.nom_client}${f.ifu_client ? ` — IFU ${f.ifu_client}` : ''}`),
        h('p', {}, h('strong', {}, 'Objet : '), f.objet, f.marche ? ` — Marché ${f.marche}` : ''),
        h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
          h('thead', {}, h('tr', {}, ['Désignation', 'Qté', 'Prix unitaire HT', 'TVA', 'Montant HT'].map((t, i) => h('th', { scope: 'col', class: i ? 'nombre' : '' }, t)))),
          h('tbody', {}, f.lignes.map((l) => h('tr', {}, h('td', {}, l.designation), h('td', { class: 'nombre' }, String(Number(l.quantite))),
            h('td', { class: 'nombre' }, formatMontant(l.prix_unitaire)), h('td', { class: 'nombre' }, l.taux_tva ? `${Number(l.taux)} %` : '—'),
            h('td', { class: 'nombre' }, formatMontant(l.montant_ht))))),
          h('tfoot', {}, [['Total HT', f.total_ht], ['TVA', f.total_tva], ['Total TTC', f.total_ttc],
            ...(Number(f.retenue_garantie) ? [['Retenue de garantie', -f.retenue_garantie], ['Net à payer', f.net_a_payer]] : [])]
            .map(([t, v]) => h('tr', {}, h('th', { scope: 'row', colspan: '4' }, t), h('td', { class: 'nombre' }, formatMontant(v))))))),
        h('p', { class: f.emecef_code ? '' : 'avertissement' }, f.emecef_code
          ? `Facture normalisée e-MECeF : ${f.emecef_code}${f.emecef_date ? ` (${formatDate(f.emecef_date)})` : ''}`
          : 'Document interne : la facture à remettre au client est la facture normalisée e-MECeF.')),
      f.ecriture_id ? h('p', { class: 'sans-impression' }, 'Écriture comptable : ', h('a', { href: `#/ecriture/${f.ecriture_id}` }, 'voir')) : null);
  }

  try { await afficher(); } catch (err) { erreur(err); ajouter(zone, erreurs); }
}
