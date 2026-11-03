// Contrôles de saisie côté interface (aide immédiate à l'utilisateur).
// La base de données reste l'autorité : elle refait tous les contrôles.
// Module sans dépendance au navigateur : testé avec node:test.
import { lireMontant } from './format.js';

/** Ligne vide (formulaire) */
export function ligneVide() {
  return { compte: '', tiers: '', libelle: '', debit: '', credit: '', sections: {} };
}

/** Une ligne est-elle totalement vide (à ignorer) ? */
export function estVide(l) {
  return !String(l.compte || '').trim() && !String(l.tiers || '').trim() && !String(l.libelle || '').trim()
    && !String(l.debit || '').trim() && !String(l.credit || '').trim();
}

/** Totaux débit / crédit / écart des lignes (montants invalides comptés à zéro). */
export function calculerTotaux(lignes) {
  let debit = 0;
  let credit = 0;
  for (const l of lignes) {
    const d = lireMontant(l.debit);
    const c = lireMontant(l.credit);
    if (d.ok) debit += d.valeur;
    if (c.ok) credit += c.valeur;
  }
  return { debit, credit, ecart: debit - credit };
}

/**
 * Contrôle d'une saisie.
 * ref : { comptes: [{numero, exige_tiers, ventilation_obligatoire}], tiers: [{code}],
 *         axes: [{code, obligatoire, sections:[{code}]}], exercices: [...] }
 * Renvoie { brouillard: [messages bloquants pour enregistrer],
 *           validation: [messages bloquants supplémentaires pour valider] }.
 */
export function verifierSaisie(entete, lignes, ref) {
  const brouillard = [];
  const validation = [];
  const comptes = new Map((ref.comptes || []).map((c) => [c.numero, c]));
  const tiers = new Set((ref.tiers || []).map((t) => t.code));
  const axesObligatoires = (ref.axes || []).filter((a) => a.obligatoire);

  if (!entete.journal) brouillard.push('Choisissez un journal.');
  if (!entete.date) brouillard.push('Indiquez la date de l\'écriture.');
  else {
    const ouvert = (ref.exercices || []).some((x) => x.statut === 'ouvert'
      && (x.periodes || []).some((p) => p.statut === 'ouverte' && entete.date >= p.date_debut && entete.date <= p.date_fin));
    if (!ouvert) brouillard.push('La date doit se situer dans une période ouverte.');
  }
  if (!String(entete.libelle || '').trim()) brouillard.push('Indiquez le libellé de l\'écriture.');

  const utiles = lignes.map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => !estVide(l));
  if (utiles.length === 0) brouillard.push('Ajoutez au moins une ligne.');

  for (const { l, n } of utiles) {
    const numero = String(l.compte || '').trim();
    const c = comptes.get(numero);
    if (!numero) brouillard.push(`Ligne ${n} : choisissez un compte.`);
    else if (!c) brouillard.push(`Ligne ${n} : le compte ${numero} n'existe pas ou n'est pas utilisable.`);
    const d = lireMontant(l.debit);
    const cr = lireMontant(l.credit);
    if (!d.ok) brouillard.push(`Ligne ${n} : débit — ${d.erreur}`);
    if (!cr.ok) brouillard.push(`Ligne ${n} : crédit — ${cr.erreur}`);
    if (d.ok && cr.ok) {
      if (d.valeur > 0 && cr.valeur > 0) brouillard.push(`Ligne ${n} : un montant au débit OU au crédit, pas les deux.`);
      if (d.valeur === 0 && cr.valeur === 0) brouillard.push(`Ligne ${n} : indiquez un montant.`);
    }
    const codeTiers = String(l.tiers || '').trim();
    if (codeTiers && !tiers.has(codeTiers)) brouillard.push(`Ligne ${n} : le tiers ${codeTiers} est inconnu.`);
    if (c && c.exige_tiers && !codeTiers) brouillard.push(`Ligne ${n} : le compte ${numero} exige un tiers (client, fournisseur…).`);
    if (c && c.ventilation_obligatoire) {
      for (const a of axesObligatoires) {
        if (!(l.sections || {})[a.code]) validation.push(`Ligne ${n} : choisissez « ${a.libelle || a.code} » (analytique obligatoire pour ce compte).`);
      }
    }
  }

  const { debit, credit, ecart } = calculerTotaux(utiles.map(({ l }) => l));
  if (utiles.length === 1) validation.push('Une écriture comporte au moins deux lignes.');
  if (ecart !== 0) validation.push(`Écriture déséquilibrée : écart de ${Math.abs(ecart).toLocaleString('fr-FR')} FCFA.`);
  if (debit === 0 && credit === 0 && utiles.length > 0) validation.push('Le total de l\'écriture est nul.');
  return { brouillard, validation };
}

/** Construit l'objet attendu par api.saisir_ecriture / api.modifier_brouillard. */
export function versRequete(societeId, entete, lignes, cleIdempotence) {
  return {
    societe_id: societeId,
    journal: entete.journal,
    date: entete.date,
    libelle: String(entete.libelle || '').trim(),
    reference_piece: String(entete.reference_piece || '').trim(),
    cle_idempotence: cleIdempotence || undefined,
    lignes: lignes.filter((l) => !estVide(l)).map((l) => {
      const montant = lireMontant(l.debit).valeur || lireMontant(l.credit).valeur || 0;
      return {
        compte: String(l.compte || '').trim(),
        tiers: String(l.tiers || '').trim() || undefined,
        libelle: String(l.libelle || '').trim() || undefined,
        debit: lireMontant(l.debit).valeur || 0,
        credit: lireMontant(l.credit).valeur || 0,
        ventilations: Object.entries(l.sections || {})
          .filter(([, section]) => section)
          .map(([axe, section]) => ({ axe, section, montant })),
      };
    }),
  };
}

/** Transforme une écriture renvoyée par api.ecriture en lignes de formulaire. */
export function lignesDepuisEcriture(ecriture) {
  return (ecriture.lignes || []).map((l) => {
    const sections = {};
    for (const v of l.ventilations || []) sections[v.axe] = v.section;
    return {
      compte: l.compte, tiers: l.tiers || '', libelle: l.libelle || '',
      debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '', sections,
    };
  });
}
