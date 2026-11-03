// Saisie (ou modification d'un brouillard) d'une écriture.
import { appeler } from '../client.js';
import { h, vider, annoncer, blocErreur, ajouter } from '../ui.js';
import { formatMontant, lireMontant, aujourdhui } from '../format.js';
import { ligneVide, calculerTotaux, verifierSaisie, versRequete, lignesDepuisEcriture } from '../saisie-logique.js';

export async function vueSaisie(ctx, zone, idBrouillard) {
  const ref = ctx.ref;
  const comptes = new Map(ref.comptes.map((c) => [c.numero, c]));
  const cle = crypto.randomUUID(); // anti-doublon : une même saisie ne crée qu'une écriture
  let entete;
  let lignes;
  let avertissementRepartition = null;

  if (idBrouillard) {
    const e = await appeler('ecriture', { p_id: idBrouillard });
    if (e.statut !== 'brouillard') {
      ajouter(zone, blocErreur(`L'écriture ${e.numero} est validée : elle ne peut plus être modifiée. Utilisez la contrepassation.`));
      return;
    }
    entete = { journal: e.journal, date: e.date, libelle: e.libelle, reference_piece: e.reference_piece || '' };
    lignes = lignesDepuisEcriture(e);
    const reparties = e.lignes.some((l) => {
      const axes = l.ventilations.map((v) => v.axe);
      return new Set(axes).size !== axes.length;
    });
    if (reparties) avertissementRepartition = 'Ce brouillard contient une répartition analytique sur plusieurs sections : cet écran ne gère qu\'une section par axe. Enregistrer remplacerait la répartition.';
  } else {
    entete = { journal: '', date: dateDefaut(ctx), libelle: '', reference_piece: '' };
    lignes = [ligneVide(), ligneVide()];
  }

  // Listes de choix (saisie assistée au clavier)
  const listeComptes = h('datalist', { id: 'liste-comptes' },
    ref.comptes.map((c) => h('option', { value: c.numero }, `${c.numero} — ${c.libelle}`)));
  const listeTiers = h('datalist', { id: 'liste-tiers' },
    ref.tiers.map((t) => h('option', { value: t.code }, `${t.code} — ${t.nom}`)));

  // En-tête
  const champJournal = h('select', { name: 'journal', required: true },
    h('option', { value: '' }, 'Choisir…'),
    ref.journaux.filter((j) => j.type !== 'a_nouveaux').map((j) => h('option', { value: j.code }, `${j.code} — ${j.libelle}`)));
  champJournal.value = entete.journal;
  const champDate = h('input', { name: 'date', type: 'date', required: true, value: entete.date });
  const champLibelle = h('input', { name: 'libelle', type: 'text', required: true, maxlength: '200', value: entete.libelle,
                                   placeholder: 'Ex. : Vente de fournitures au client Alpha' });
  const champPiece = h('input', { name: 'reference_piece', type: 'text', maxlength: '60', value: entete.reference_piece,
                                 placeholder: 'N° de facture, reçu…' });

  const corpsLignes = h('div', { class: 'lignes-saisie' });
  const totaux = h('div', { class: 'totaux', 'aria-live': 'polite' });
  const problemes = h('div', { class: 'zone-erreur' });
  const boutonBrouillard = h('button', { type: 'button', class: 'bouton secondaire' }, 'Enregistrer le brouillard');
  const boutonValider = ctx.peut('validation') ? h('button', { type: 'button', class: 'bouton principal' }, 'Enregistrer et valider') : null;

  function lireEntete() {
    return { journal: champJournal.value, date: champDate.value, libelle: champLibelle.value, reference_piece: champPiece.value };
  }

  function rendreLigne(l, i) {
    const compte = comptes.get(String(l.compte).trim());
    const champCompte = h('input', { type: 'text', list: 'liste-comptes', value: l.compte, inputmode: 'numeric',
      'aria-label': `Ligne ${i + 1} : compte`, placeholder: 'Compte', class: 'champ-compte' });
    const nomCompte = h('span', { class: 'nom-compte discret' }, compte ? compte.libelle : '');
    const champTiers = h('input', { type: 'text', list: 'liste-tiers', value: l.tiers, 'aria-label': `Ligne ${i + 1} : tiers`,
      placeholder: compte && compte.exige_tiers ? 'Tiers (obligatoire)' : 'Tiers', class: 'champ-tiers' });
    const champLib = h('input', { type: 'text', value: l.libelle, 'aria-label': `Ligne ${i + 1} : libellé`,
      placeholder: 'Libellé de la ligne (facultatif)', maxlength: '200', class: 'champ-libelle' });
    const champD = h('input', { type: 'text', inputmode: 'numeric', value: l.debit, 'aria-label': `Ligne ${i + 1} : débit`,
      placeholder: 'Débit', class: 'montant montant-debit' });
    const champC = h('input', { type: 'text', inputmode: 'numeric', value: l.credit, 'aria-label': `Ligne ${i + 1} : crédit`,
      placeholder: 'Crédit', class: 'montant montant-credit' });

    const analytique = h('div', { class: 'analytique' });
    function rendreAnalytique() {
      vider(analytique);
      const c = comptes.get(String(l.compte).trim());
      if (!c || ref.axes.length === 0) return;
      for (const a of ref.axes) {
        const requis = a.obligatoire && c.ventilation_obligatoire;
        if (!requis && !c.ventilation_obligatoire && c.classe <= 5) continue;
        const s = h('select', { 'aria-label': `Ligne ${i + 1} : ${a.libelle}` },
          h('option', { value: '' }, requis ? `${a.libelle} (obligatoire)` : `${a.libelle} (facultatif)`),
          a.sections.map((x) => h('option', { value: x.code }, x.libelle)));
        s.value = (l.sections || {})[a.code] || '';
        s.addEventListener('change', () => { l.sections = { ...(l.sections || {}), [a.code]: s.value }; majEtat(); });
        ajouter(analytique, s);
      }
    }
    rendreAnalytique();

    champCompte.addEventListener('input', () => {
      l.compte = champCompte.value.split(/\s/)[0];
      const c = comptes.get(l.compte.trim());
      nomCompte.textContent = c ? c.libelle : '';
      champTiers.placeholder = c && c.exige_tiers ? 'Tiers (obligatoire)' : 'Tiers';
      rendreAnalytique();
      majEtat();
    });
    champTiers.addEventListener('input', () => { l.tiers = champTiers.value.split(/\s/)[0]; majEtat(); });
    champLib.addEventListener('input', () => { l.libelle = champLib.value; });
    const surMontant = (champ, cleMontant, autre, cleAutre) => {
      champ.addEventListener('input', () => {
        l[cleMontant] = champ.value;
        if (champ.value.trim() && autre.value.trim()) { autre.value = ''; l[cleAutre] = ''; }
        majEtat();
      });
      champ.addEventListener('blur', () => {
        const m = lireMontant(champ.value);
        if (m.ok && m.valeur) { champ.value = formatMontant(m.valeur); l[cleMontant] = champ.value; }
      });
    };
    surMontant(champD, 'debit', champC, 'credit');
    surMontant(champC, 'credit', champD, 'debit');

    const supprimer = h('button', { type: 'button', class: 'bouton icone', 'aria-label': `Supprimer la ligne ${i + 1}`,
      title: 'Supprimer la ligne' }, '×');
    supprimer.addEventListener('click', () => {
      lignes.splice(i, 1);
      if (lignes.length === 0) lignes.push(ligneVide());
      rendreLignes();
    });

    return h('div', { class: 'ligne-saisie' },
      h('span', { class: 'rang', 'aria-hidden': 'true' }, String(i + 1)),
      h('div', { class: 'cellule-compte' }, champCompte, nomCompte),
      champTiers, champLib, champD, champC, supprimer, analytique);
  }

  function rendreLignes() {
    ajouter(vider(corpsLignes), 
      h('div', { class: 'ligne-saisie entete-lignes', 'aria-hidden': 'true' },
        h('span', {}), h('span', {}, 'Compte'), h('span', {}, 'Tiers'), h('span', {}, 'Libellé'),
        h('span', { class: 'nombre' }, 'Débit'), h('span', { class: 'nombre' }, 'Crédit'), h('span', {})),
      lignes.map(rendreLigne));
    majEtat();
  }

  function contrepartieProposee() {
    const { ecart } = calculerTotaux(lignes);
    return ecart;
  }

  function majEtat() {
    const { debit, credit, ecart } = calculerTotaux(lignes);
    ajouter(vider(totaux), 
      h('div', {}, h('span', { class: 'discret' }, 'Total débit'), h('strong', { class: 'nombre' }, formatMontant(debit))),
      h('div', {}, h('span', { class: 'discret' }, 'Total crédit'), h('strong', { class: 'nombre' }, formatMontant(credit))),
      h('div', { class: ecart === 0 ? 'equilibre' : 'desequilibre' },
        h('span', { class: 'discret' }, ecart === 0 ? 'Équilibrée' : 'Écart'),
        h('strong', { class: 'nombre' }, ecart === 0 ? '0' : formatMontant(Math.abs(ecart)))));
  }

  function afficherProblemes(liste) {
    vider(problemes);
    if (liste.length) ajouter(problemes, h('div', { class: 'erreur', role: 'alert' },
      h('p', {}, 'À corriger :'), h('ul', {}, liste.map((m) => h('li', {}, m)))));
  }

  async function enregistrer(valider) {
    const ent = lireEntete();
    const verif = verifierSaisie(ent, lignes, ref);
    const bloquants = valider ? [...verif.brouillard, ...verif.validation] : verif.brouillard;
    afficherProblemes(bloquants);
    if (bloquants.length) { problemes.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    for (const b of [boutonBrouillard, boutonValider]) if (b) b.disabled = true;
    let id = idBrouillard;
    try {
      const requete = versRequete(ctx.habilitation.societe_id, ent, lignes, idBrouillard ? undefined : cle);
      if (idBrouillard) await appeler('modifier_brouillard', { p_id: idBrouillard, p: requete });
      else id = await appeler('saisir_ecriture', { p: requete });
      if (valider) {
        const numero = await appeler('valider_ecriture', { p_id: id });
        annoncer(`Écriture validée : ${numero}.`, 'succes');
      } else {
        annoncer('Brouillard enregistré. Il n\'a pas encore d\'effet comptable.', 'succes');
      }
      ctx.aller(`#/ecriture/${id}`);
    } catch (err) {
      if (id && !idBrouillard) {
        // Le brouillard est enregistré mais la validation a été refusée par la base.
        annoncer(`Validation refusée : ${err.message} Le brouillard est enregistré ; corrigez-le puis validez.`, 'erreur');
        ctx.aller(`#/ecriture/${id}`);
        return;
      }
      afficherProblemes([err.message]);
      for (const b of [boutonBrouillard, boutonValider]) if (b) b.disabled = false;
    }
  }

  boutonBrouillard.addEventListener('click', () => enregistrer(false));
  if (boutonValider) boutonValider.addEventListener('click', () => enregistrer(true));

  const boutonAjouter = h('button', { type: 'button', class: 'bouton secondaire' }, 'Ajouter une ligne');
  boutonAjouter.addEventListener('click', () => {
    const l = ligneVide();
    const ecart = contrepartieProposee();
    if (ecart > 0) l.credit = formatMontant(ecart);
    else if (ecart < 0) l.debit = formatMontant(-ecart);
    lignes.push(l);
    rendreLignes();
    const champs = corpsLignes.querySelectorAll('.champ-compte');
    champs[champs.length - 1].focus();
  });

  ajouter(zone, 
    h('p', { class: 'fil' }, h('a', { href: '#/ecritures' }, 'Écritures')),
    h('h1', {}, idBrouillard ? 'Modifier le brouillard' : 'Nouvelle écriture'),
    avertissementRepartition ? h('div', { class: 'bandeau-avertissement' }, avertissementRepartition) : null,
    listeComptes, listeTiers,
    h('form', { class: 'formulaire-saisie', novalidate: true, onsubmit: (e) => e.preventDefault() },
      h('div', { class: 'grille-entete' },
        h('label', { class: 'champ' }, h('span', {}, 'Journal'), champJournal),
        h('label', { class: 'champ' }, h('span', {}, 'Date'), champDate),
        h('label', { class: 'champ large' }, h('span', {}, 'Libellé'), champLibelle),
        h('label', { class: 'champ' }, h('span', {}, 'N° de pièce'), champPiece)),
      corpsLignes,
      h('div', { class: 'sous-lignes' }, boutonAjouter),
      h('div', { class: 'barre-validation' }, totaux, problemes,
        h('div', { class: 'actions' }, boutonBrouillard, boutonValider))));
  rendreLignes();
  champJournal.focus();
}

function dateDefaut(ctx) {
  const jour = aujourdhui();
  const x = ctx.exercice;
  if (!x) return jour;
  if (jour >= x.date_debut && jour <= x.date_fin) return jour;
  const ouverte = (x.periodes || []).find((p) => p.statut === 'ouverte');
  return ouverte ? ouverte.date_debut : x.date_debut;
}
