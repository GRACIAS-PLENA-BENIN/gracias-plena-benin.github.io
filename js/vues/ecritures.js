// Liste des écritures de l'exercice (brouillards et validées).
import { appeler } from '../client.js';
import { h, vider, blocErreur, ajouter } from '../ui.js';
import { formatMontant, formatDate } from '../format.js';

export async function vueEcritures(ctx, zone) {
  const filtres = { statut: sessionStorage.getItem('gracias.filtre.statut') || '', journal: '', recherche: '' };
  const liste = h('div', { class: 'liste-ecritures' });
  const integrite = h('p', { class: 'integrite discret' });

  const champStatut = h('select', { 'aria-label': 'Statut' },
    h('option', { value: '' }, 'Toutes'),
    h('option', { value: 'brouillard' }, 'Brouillards'),
    h('option', { value: 'validee' }, 'Validées'));
  champStatut.value = filtres.statut;
  const champJournal = h('select', { 'aria-label': 'Journal' },
    h('option', { value: '' }, 'Tous les journaux'),
    ctx.ref.journaux.map((j) => h('option', { value: j.code }, `${j.code} — ${j.libelle}`)));
  const champRecherche = h('input', { type: 'search', placeholder: 'Libellé, numéro ou pièce', 'aria-label': 'Rechercher' });

  async function charger() {
    filtres.statut = champStatut.value;
    filtres.journal = champJournal.value;
    filtres.recherche = champRecherche.value.trim();
    try { sessionStorage.setItem('gracias.filtre.statut', filtres.statut); } catch { /* sans effet */ }
    ajouter(vider(liste), h('p', { class: 'discret' }, 'Chargement…'));
    try {
      const lignes = await appeler('ecritures', {
        p_societe: ctx.habilitation.societe_id, p_exercice: ctx.exerciceId,
        p_statut: filtres.statut || null, p_journal: filtres.journal || null, p_recherche: filtres.recherche || null,
      });
      afficher(lignes);
    } catch (err) {
      ajouter(vider(liste), blocErreur(err.message));
    }
  }

  function afficher(lignes) {
    vider(liste);
    if (!lignes.length) {
      ajouter(liste, h('div', { class: 'vide' },
        h('p', {}, filtres.statut || filtres.journal || filtres.recherche
          ? 'Aucune écriture ne correspond à ces critères.'
          : 'Aucune écriture dans cet exercice.'),
        ctx.peut('saisie') ? h('a', { class: 'bouton principal', href: '#/saisie' }, 'Saisir une écriture') : null));
      return;
    }
    const tableau = h('table', { class: 'tableau tableau-ecritures' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Date'), h('th', { scope: 'col' }, 'Numéro'), h('th', { scope: 'col' }, 'Journal'),
        h('th', { scope: 'col' }, 'Libellé'), h('th', { scope: 'col' }, 'Pièce'),
        h('th', { scope: 'col', class: 'nombre' }, 'Montant'))),
      h('tbody', {}, lignes.map((e) => h('tr', { class: e.statut === 'brouillard' ? 'ligne-brouillard' : '' },
        h('td', { 'data-titre': 'Date' }, formatDate(e.date_ecriture)),
        h('td', { 'data-titre': 'Numéro' },
          e.numero ? h('a', { href: `#/ecriture/${e.id}`, class: 'numero' }, e.numero)
                   : h('a', { href: `#/ecriture/${e.id}`, class: 'etiquette-brouillard' }, 'Brouillard')),
        h('td', { 'data-titre': 'Journal' }, e.journal),
        h('td', { 'data-titre': 'Libellé', class: 'libelle' }, e.libelle,
          e.contrepassee ? h('span', { class: 'mention' }, ' contrepassée') : null,
          e.est_contrepassation ? h('span', { class: 'mention' }, ' contrepassation') : null),
        h('td', { 'data-titre': 'Pièce' }, e.reference_piece || ''),
        h('td', { 'data-titre': 'Montant', class: 'nombre' }, formatMontant(e.total))))));
    ajouter(liste, h('div', { class: 'defilement' }, tableau),
      lignes.length >= 200 ? h('p', { class: 'discret' }, 'Seules les 200 écritures les plus récentes sont affichées : affinez la recherche.') : null);
  }

  let minuterie;
  champRecherche.addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(charger, 300); });
  champStatut.addEventListener('change', charger);
  champJournal.addEventListener('change', charger);

  ajouter(zone, 
    h('div', { class: 'titre-page' },
      h('h1', {}, 'Écritures'),
      ctx.peut('saisie') ? h('a', { class: 'bouton principal', href: '#/saisie' }, 'Nouvelle écriture') : null),
    h('div', { class: 'filtres' }, champStatut, champJournal, champRecherche),
    liste, integrite);
  await charger();

  appeler('controle_integrite', { p_societe: ctx.habilitation.societe_id })
    .then((c) => {
      integrite.textContent = c.chaine_audit_intacte && Number(c.ecritures_desequilibrees) === 0
        ? `Contrôle d'intégrité : journal d'audit intact (${c.lignes_audit_verifiees} opérations), aucune écriture déséquilibrée.`
        : 'Contrôle d\'intégrité : ANOMALIE détectée. Ne saisissez plus rien et contactez l\'administrateur.';
      if (!(c.chaine_audit_intacte && Number(c.ecritures_desequilibrees) === 0)) integrite.className = 'integrite erreur';
    })
    .catch(() => { integrite.textContent = ''; });
}
