// Caisse et banque : soldes, encaissements, décaissements, virements, rapprochement.
/* global crypto */
import { appeler } from '../client.js';
import { h, vider, ajouter, annoncer, blocErreur, dialogue } from '../ui.js';
import { formatMontant, formatMontantOuVide, formatDate, lireMontant, aujourdhui } from '../format.js';

const cle = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

export async function vueTresorerie(ctx, zone, compte) {
  const societe = ctx.habilitation.societe_id;
  const erreurs = h('div', { class: 'zone-erreur' });

  async function executer(fn, message) {
    vider(erreurs);
    try { await fn(); annoncer(message, 'succes'); await afficher(); } catch (err) {
      ajouter(erreurs, blocErreur(err.message)); erreurs.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Enregistre (et valide si possible) une écriture de trésorerie.
  async function enregistrer(journal, date, libelle, piece, lignes, valider) {
    const id = await appeler('saisir_ecriture', { p: { societe_id: societe, journal, date, libelle, reference_piece: piece || '',
      cle_idempotence: cle(), lignes } });
    if (valider) return appeler('valider_ecriture', { p_id: id });
    return null;
  }

  function montantObligatoire(texte) {
    const r = lireMontant(texte);
    if (!r.ok) throw new Error(r.erreur);
    if (!r.valeur) throw new Error('Indiquez un montant.');
    return r.valeur;
  }

  async function operation(t, sens) {
    const ref = ctx.ref;
    const axes = ref.axes || [];
    const champs = [
      { nom: 'date', etiquette: 'Date', type: 'date', valeur: aujourdhui(), requis: true },
      { nom: 'libelle', etiquette: 'Libellé (ex. Règlement facture 012 SONEB)', requis: true },
      { nom: 'montant', etiquette: 'Montant (FCFA)', requis: true },
      { nom: 'compte', etiquette: sens === 'entree'
        ? 'Compte de contrepartie (ex. 4111 client, 7011 vente au comptant, 4621 apport…)'
        : 'Compte de contrepartie (ex. 4011 fournisseur, 6052 eau-électricité, 6611 salaires…)', requis: true },
      { nom: 'tiers', etiquette: 'Client / fournisseur (si le compte l\'exige)', type: 'select',
        options: [{ valeur: '', libelle: '(aucun)' }, ...(ref.tiers || []).map((x) => ({ valeur: x.code, libelle: `${x.code} — ${x.nom}` }))], valeur: '' },
      ...axes.map((a) => ({ nom: `axe_${a.code}`, etiquette: `${a.libelle} (charges et produits)`, type: 'select',
        options: [{ valeur: '', libelle: '(aucun)' }, ...a.sections.map((x) => ({ valeur: x.code, libelle: x.libelle }))], valeur: '' })),
      { nom: 'piece', etiquette: 'N° de pièce (reçu, chèque, facture…)' },
    ];
    if (ctx.peut('validation')) champs.push({ nom: 'valider', etiquette: 'Valider immédiatement', type: 'checkbox', valeur: true });
    const v = await dialogue({ titre: `${sens === 'entree' ? 'Encaissement' : 'Décaissement'} — ${t.libelle}`, champs, bouton: 'Enregistrer' });
    if (!v) return;
    await executer(async () => {
      const montant = montantObligatoire(v.montant);
      const numero = v.compte.trim().split(/\s/)[0];
      const c = (ref.comptes || []).find((x) => x.numero === numero);
      if (!c) throw new Error(`Compte ${numero} inconnu ou non utilisable en saisie.`);
      const ventilations = (c.classe >= 6 || c.ventilation_obligatoire)
        ? axes.filter((a) => v[`axe_${a.code}`]).map((a) => ({ axe: a.code, section: v[`axe_${a.code}`], montant })) : [];
      const contre = { compte: numero, tiers: v.tiers || undefined, debit: sens === 'sortie' ? montant : 0, credit: sens === 'entree' ? montant : 0, ventilations };
      const tres = { compte: t.compte, debit: sens === 'entree' ? montant : 0, credit: sens === 'sortie' ? montant : 0 };
      const n = await enregistrer(t.journal, v.date, v.libelle.trim(), v.piece, sens === 'entree' ? [tres, contre] : [contre, tres], v.valider);
      if (!n) annoncer('Brouillard enregistré : à valider dans Écritures.');
    }, 'Opération enregistrée.');
  }

  async function virement(liste, source) {
    const autres = liste.filter((x) => x.compte !== source.compte && x.actif);
    if (!autres.length) return ajouter(vider(erreurs), blocErreur('Aucun autre compte de trésorerie.'));
    const v = await dialogue({ titre: `Virement depuis ${source.libelle}`,
      texte: 'Exemple : retrait en banque pour alimenter la caisse.',
      champs: [{ nom: 'vers', etiquette: 'Vers', type: 'select', options: autres.map((x) => ({ valeur: x.compte, libelle: `${x.compte} — ${x.libelle}` })), valeur: autres[0].compte },
        { nom: 'date', etiquette: 'Date', type: 'date', valeur: aujourdhui(), requis: true },
        { nom: 'montant', etiquette: 'Montant (FCFA)', requis: true },
        { nom: 'piece', etiquette: 'N° de pièce (chèque, bordereau…)' }],
      bouton: 'Enregistrer' });
    if (!v) return;
    await executer(async () => {
      const montant = montantObligatoire(v.montant);
      await enregistrer(source.journal, v.date, `Virement ${source.compte} vers ${v.vers}`, v.piece,
        [{ compte: v.vers, debit: montant, credit: 0 }, { compte: source.compte, debit: 0, credit: montant }], ctx.peut('validation'));
    }, 'Virement enregistré.');
  }

  async function afficher() {
    vider(zone);
    const liste = await appeler('tresorerie', { p_societe: societe });
    if (compte) return afficherCompte(liste.find((x) => x.compte === compte));
    ajouter(zone, h('h1', {}, 'Caisse et banque'), erreurs);
    if (!liste.length) return ajouter(zone, h('p', {}, 'Aucun journal de trésorerie : créez-en un dans Paramétrage > Journaux.'));
    const total = liste.reduce((s, x) => s + Number(x.solde), 0);
    ajouter(zone, h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
      h('thead', {}, h('tr', {}, ['Compte', 'Solde comptable', 'À pointer', 'Dernier rapprochement', ''].map((t, i) =>
        h('th', { scope: 'col', class: i === 1 ? 'nombre' : '' }, t)))),
      h('tbody', {}, liste.map((t) => {
        const actions = h('div', { class: 'actions sans-impression' });
        if (ctx.peut('saisie') && t.actif) {
          for (const [txt, fn] of [['Encaissement', () => operation(t, 'entree')], ['Décaissement', () => operation(t, 'sortie')], ['Virement', () => virement(liste, t)]]) {
            const b = h('button', { type: 'button', class: 'bouton secondaire petit' }, txt);
            b.addEventListener('click', fn);
            ajouter(actions, b);
          }
        }
        const negatif = t.caisse && Number(t.solde) < 0;
        const dr = t.dernier_rapprochement;
        return h('tr', {},
          h('td', { 'data-titre': 'Compte' }, h('a', { href: `#/tresorerie/${t.compte}` }, `${t.compte} — ${t.libelle}`), h('br'),
            h('span', { class: 'discret' }, `Journal ${t.journal}${t.brouillards ? ` · ${t.brouillards} brouillard(s) non compté(s)` : ''}`)),
          h('td', { 'data-titre': 'Solde', class: 'nombre' }, formatMontant(t.solde),
            negatif ? h('div', { class: 'erreur' }, 'Caisse négative : opération manquante ou erronée') : null),
          h('td', { 'data-titre': 'À pointer' }, String(t.non_pointees)),
          h('td', { 'data-titre': 'Dernier rapprochement' }, dr ? `${formatDate(dr.date)}${Number(dr.ecart) ? ` · écart ${formatMontant(dr.ecart)}` : ' · concordant'}` : '—'),
          h('td', {}, actions));
      })),
      h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, 'Trésorerie totale'), h('td', { class: 'nombre' }, formatMontant(total)), h('td', { colspan: '3' }))))),
    h('p', { class: 'discret' }, 'Soldes issus des écritures validées. Débit = argent disponible. Chaque opération crée une écriture dans le journal du compte.'));
  }

  async function afficherCompte(t) {
    ajouter(zone, h('p', { class: 'fil' }, h('a', { href: '#/tresorerie' }, 'Caisse et banque')));
    if (!t) return ajouter(zone, blocErreur('Compte de trésorerie introuvable.'));
    ajouter(zone, h('h1', {}, `${t.compte} — ${t.libelle}`), h('p', {}, `Solde comptable : `, h('strong', {}, formatMontant(t.solde))), erreurs);
    const ex = ctx.exercice;
    const du = h('input', { type: 'date', value: ex ? ex.date_debut : '' });
    const au = h('input', { type: 'date', value: ex ? ex.date_fin : '' });
    const voir = h('button', { type: 'button', class: 'bouton secondaire' }, 'Afficher');
    const imprimer = h('button', { type: 'button', class: 'bouton secondaire' }, 'Imprimer / PDF');
    imprimer.addEventListener('click', () => window.print());
    const tableau = h('div', {});
    async function mouvements() {
      vider(tableau);
      const r = await appeler('mouvements_tresorerie', { p_societe: societe, p_compte: t.compte, p_du: du.value || null, p_au: au.value || null, p_non_pointes: false });
      let solde = Number(r.solde_initial);
      ajouter(tableau, h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
        h('thead', {}, h('tr', {}, ['Date', 'N°', 'Libellé', 'Entrée', 'Sortie', 'Solde', 'Pointé'].map((x, i) =>
          h('th', { scope: 'col', class: i >= 3 && i <= 5 ? 'nombre' : '' }, x)))),
        h('tbody', {}, h('tr', {}, h('td', { colspan: '5' }, 'Solde au début de la période'), h('td', { class: 'nombre' }, formatMontant(solde)), h('td', {})),
          r.mouvements.map((m) => { solde += Number(m.debit) - Number(m.credit); return h('tr', {},
            h('td', { 'data-titre': 'Date' }, formatDate(m.date)), h('td', { 'data-titre': 'N°' }, h('a', { href: `#/ecriture/${m.ecriture}` }, m.numero)),
            h('td', { 'data-titre': 'Libellé' }, m.libelle), h('td', { 'data-titre': 'Entrée', class: 'nombre' }, formatMontantOuVide(m.debit)),
            h('td', { 'data-titre': 'Sortie', class: 'nombre' }, formatMontantOuVide(m.credit)), h('td', { 'data-titre': 'Solde', class: 'nombre' }, formatMontant(solde)),
            h('td', { 'data-titre': 'Pointé' }, m.pointe_le ? formatDate(m.pointe_le) : '')); })))));
    }
    voir.addEventListener('click', () => mouvements().catch((e) => ajouter(vider(erreurs), blocErreur(e.message))));
    ajouter(zone, h('h2', {}, 'Mouvements'), h('div', { class: 'filtres sans-impression' },
      h('label', { class: 'champ' }, h('span', {}, 'Du'), du), h('label', { class: 'champ' }, h('span', {}, 'Au'), au), voir, imprimer), tableau);
    await mouvements();
    if (ctx.peut('lecture')) await blocRapprochement(t);
  }

  async function blocRapprochement(t) {
    const histo = await appeler('rapprochements', { p_societe: societe, p_compte: t.compte });
    const dejaPointe = histo.length ? Number(histo[0].solde_pointe) : 0;
    const titre = t.caisse ? 'Arrêté de caisse (comptage)' : 'Rapprochement bancaire';
    const bloc = h('section', { class: 'bloc sans-impression' }, h('h2', {}, titre));
    ajouter(zone, bloc);
    if (ctx.peut('lettrage')) {
      const r = await appeler('mouvements_tresorerie', { p_societe: societe, p_compte: t.compte, p_du: null, p_au: null, p_non_pointes: true });
      const date = h('input', { type: 'date', value: aujourdhui(), name: 'date_releve' });
      const soldeReleve = h('input', { type: 'text', inputmode: 'numeric', name: 'solde_releve', placeholder: 'ex. 1 250 000' });
      const resume = h('p', { 'aria-live': 'polite' });
      const coches = r.mouvements.map((m) => ({ m, c: h('input', { type: 'checkbox', 'aria-label': `Pointer ${m.libelle}` }) }));
      const maj = () => {
        const pointe = dejaPointe + coches.filter((x) => x.c.checked).reduce((s, x) => s + Number(x.m.debit) - Number(x.m.credit), 0);
        const rel = lireMontant(soldeReleve.value.replace(/^-/, ''));
        const releve = rel.ok ? (soldeReleve.value.trim().startsWith('-') ? -rel.valeur : rel.valeur) : null;
        resume.replaceChildren(`Solde des lignes pointées : ${formatMontant(pointe)}`,
          releve !== null && soldeReleve.value.trim() ? ` · Écart avec le ${t.caisse ? 'comptage' : 'relevé'} : ${formatMontant(releve - pointe)}` : '');
      };
      const selonDate = () => { for (const x of coches) { x.c.disabled = Boolean(date.value) && x.m.date > date.value; if (x.c.disabled) x.c.checked = false; } maj(); };
      coches.forEach((x) => x.c.addEventListener('change', maj));
      date.addEventListener('change', selonDate);
      soldeReleve.addEventListener('input', maj);
      selonDate();
      const enregistrer = h('button', { type: 'button', class: 'bouton principal' }, 'Enregistrer le rapprochement');
      enregistrer.addEventListener('click', async () => {
        const brut = soldeReleve.value.trim();
        const rel = lireMontant(brut.replace(/^-/, ''));
        if (!brut || !rel.ok) return ajouter(vider(erreurs), blocErreur(`Indiquez le solde du ${t.caisse ? 'comptage' : 'relevé'} (FCFA).`));
        const valeur = brut.startsWith('-') ? -rel.valeur : rel.valeur;
        await executer(() => appeler('rapprocher', { p_societe: societe, p_compte: t.compte, p_date: date.value, p_solde_releve: valeur,
          p_lignes: coches.filter((x) => x.c.checked).map((x) => x.m.ligne), p_commentaire: null }), 'Rapprochement enregistré.');
      });
      ajouter(bloc, h('p', { class: 'discret' }, t.caisse
        ? 'Comptez l\'argent en caisse, saisissez le montant, cochez les opérations qui correspondent à l\'argent compté.'
        : 'Cochez les opérations qui figurent sur le relevé bancaire, puis saisissez le solde final du relevé (en négatif si découvert).'),
      h('div', { class: 'filtres' }, h('label', { class: 'champ' }, h('span', {}, t.caisse ? 'Date du comptage' : 'Date du relevé'), date),
        h('label', { class: 'champ' }, h('span', {}, t.caisse ? 'Montant compté' : 'Solde du relevé'), soldeReleve)),
      r.mouvements.length ? h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
        h('thead', {}, h('tr', {}, ['', 'Date', 'Libellé', 'Entrée', 'Sortie'].map((x, i) => h('th', { scope: 'col', class: i >= 3 ? 'nombre' : '' }, x)))),
        h('tbody', {}, coches.map(({ m, c }) => h('tr', {}, h('td', {}, c), h('td', {}, formatDate(m.date)), h('td', {}, m.libelle),
          h('td', { class: 'nombre' }, formatMontantOuVide(m.debit)), h('td', { class: 'nombre' }, formatMontantOuVide(m.credit))))))) :
        h('p', { class: 'discret' }, 'Toutes les opérations validées sont pointées.'),
      resume, h('div', { class: 'actions' }, enregistrer),
      h('p', { class: 'discret' }, 'Un écart n\'est jamais corrigé automatiquement : passez l\'écriture manquante (frais bancaires, agios…) puis refaites le rapprochement.'));
    }
    if (histo.length) {
      const annuler = ctx.peut('lettrage') ? h('button', { type: 'button', class: 'bouton danger-discret petit' }, 'Annuler le dernier') : null;
      annuler?.addEventListener('click', async () => {
        const ok = await dialogue({ titre: 'Annuler le dernier rapprochement ?', texte: 'Ses lignes redeviendront à pointer. L\'annulation est tracée.', bouton: 'Annuler le rapprochement', danger: true });
        if (ok) await executer(() => appeler('annuler_rapprochement', { p_societe: societe, p_compte: t.compte }), 'Rapprochement annulé.');
      });
      ajouter(bloc, h('h3', {}, 'Historique'), h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
        h('thead', {}, h('tr', {}, ['Date', 'Solde relevé', 'Solde pointé', 'Écart', 'Lignes', 'Par'].map((x, i) => h('th', { scope: 'col', class: i >= 1 && i <= 3 ? 'nombre' : '' }, x)))),
        h('tbody', {}, histo.map((x) => h('tr', {}, h('td', {}, formatDate(x.date)), h('td', { class: 'nombre' }, formatMontant(x.solde_releve)),
          h('td', { class: 'nombre' }, formatMontant(x.solde_pointe)), h('td', { class: 'nombre' }, formatMontant(x.ecart)),
          h('td', {}, String(x.lignes)), h('td', {}, x.par)))))), annuler);
    }
  }

  await afficher();
}
