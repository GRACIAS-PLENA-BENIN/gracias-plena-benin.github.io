// Formatage et lecture des montants (FCFA entiers), dates et exports.
// Module sans dépendance au navigateur : testé avec node:test.

const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const MONTANT_MAX = 999_999_999_999_999;

/** 1250000 -> « 1 250 000 » (espaces fines insécables). */
export function formatMontant(n) {
  const v = Number(n || 0);
  return fmt.format(v);
}

/** Comme formatMontant, mais chaîne vide pour zéro (colonnes débit/crédit). */
export function formatMontantOuVide(n) {
  return Number(n || 0) === 0 ? '' : formatMontant(n);
}

/** Solde signé (débit - crédit) -> { montant, sens } avec sens « D », « C » ou « ». */
export function sensSolde(solde) {
  const v = Number(solde || 0);
  return { montant: formatMontant(Math.abs(v)), sens: v > 0 ? 'D' : v < 0 ? 'C' : '' };
}

/**
 * Lit un montant saisi : « 1 250 000 », « 1250000 ».
 * Refuse les décimales et les signes : la comptabilité est tenue en FCFA entiers.
 * Renvoie { ok: true, valeur } ou { ok: false, erreur }.
 */
export function lireMontant(texte) {
  const brut = String(texte ?? '').replace(/[\s  ]/g, '');
  if (brut === '') return { ok: true, valeur: 0 };
  if (/[.,]/.test(brut)) return { ok: false, erreur: 'Montant en FCFA sans décimales.' };
  if (!/^\d+$/.test(brut)) return { ok: false, erreur: 'Montant invalide : chiffres uniquement.' };
  const valeur = Number(brut);
  if (!Number.isSafeInteger(valeur) || valeur > MONTANT_MAX) return { ok: false, erreur: 'Montant trop élevé.' };
  return { ok: true, valeur };
}

/** « 2026-01-15 » -> « 15/01/2026 ». */
export function formatDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/** Date du jour au format ISO (fuseau local). */
export function aujourdhui(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Export CSV compatible Excel (séparateur « ; », BOM UTF-8).
 * colonnes : [{ titre, valeur: (ligne) => … }]
 */
export function versCsv(lignes, colonnes) {
  const echapper = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const entete = colonnes.map((c) => echapper(c.titre)).join(';');
  const corps = lignes.map((l) => colonnes.map((c) => echapper(c.valeur(l))).join(';'));
  return '﻿' + [entete, ...corps].join('\r\n') + '\r\n';
}

/** Retire le code technique « GRA-E053 » en tête d'un message d'erreur. */
export function messageLisible(message) {
  return String(message || '').replace(/^GRA-E\d{3}\s+/, '');
}
