// Lettrage des comptes de tiers : rapprocher des lignes qui se compensent
// (une facture et son règlement), et consulter ou annuler les lettrages.
import { appeler } from '../client.js';
import { h, vider, ajouter, annoncer, blocErreur, dialogue } from '../ui.js';
import { formatMontant, formatMontantOuVide, formatDate } from '../format.js';

export async function vueLettrage(ctx, zone) {
  const x = ctx.exercice;
  const lettrables = ctx.ref.comptes.filter((c) => c.lettrable);
  if (!lettrables.length) {
    ajouter(zone, h('h1', {}, 'Lettrage'),
      h('p', { class: 'vide' }, 'Aucun compte lettrable dans le plan de comptes (comptes clients, fournisseurs…).'));
    return;
  }
  const memo = sessionStorage.getItem('gracias.lettrage.compte');
  const champCompte = h('select', {}, lettrables.map((c) => h('option', { value: c.numero }, `${c.numero} — ${c.libelle}`)));
  if (memo && lettrables.some((c) => c.numero === memo)) champCompte.value = memo;
  const champTiers = h('select', {}, h('option', { value: '' }, 'Tous les tiers'),
    ctx.ref.tiers.map((t) => h('option', { value: t.code }, `${t.code} — ${t.nom}`)));
  const aLettrer = h('section', { class: 'bloc', 'aria-labelledby': 'titre-a-lettrer' });
  const enPlace = h('section', { class: 'bloc', 'aria-labelledby': 'titre-en-place' });
  const peutLettrer = ctx.peut('lettrage');

  async function charger() {
    const compte = champCompte.value;
    const tiers = champTiers.value || null;
    try { sessionStorage.setItem('gracias.lettrage.compte', compte); } catch { /* sans effet */ }
    ajouter(vider(aLettrer), h('p', { class: 'discret' }, 'Chargement…'));
    vider(enPlace);
    try {
      const [lignes, lettrages] = await Promise.all([
        appeler('lignes_non_lettrees', { p_societe: ctx.habilitation.societe_id, p_exercice: x.id, p_compte: compte, p_tiers: tiers }),
        appeler('lettrages', { p_societe: ctx.habilitation.societe_id, p_exercice: x.id, p_compte: compte, p_tiers: tiers }),
      ]);
      afficherALettrer(lignes);
      afficherEnPlace(lettrages);
    } catch (err) { ajouter(vider(aLettrer), blocErreur(err.message)); }
  }

  function afficherALettrer(lignes) {
    vider(aLettrer);
    ajouter(aLettrer, h('h2', { id: 'titre-a-lettrer' }, `Lignes à lettrer (${lignes.length})`));
    if (!lignes.length) {
      ajouter(aLettrer, h('p', { class: 'vide' }, 'Toutes les lignes de ce compte sont lettrées pour cet exercice.'));
      return;
    }
    const choisies = new Set();
    const resume = h('div', { class: 'resume-selection', 'aria-live': 'polite' });
    const erreurs = h('div', { class: 'zone-erreur' });
    const bouton = h('button', { type: 'button', class: 'bouton principal', disabled: true }, 'Lettrer la sélection');

    function majResume() {
      const sel = lignes.filter((l) => choisies.has(l.ligne_id));
      const d = sel.reduce((s, l) => s + Number(l.debit), 0);
      const c = sel.reduce((s, l) => s + Number(l.credit), 0);
      const tiers = new Set(sel.map((l) => l.tiers || ''));
      let message = '';
      if (sel.length >= 2 && tiers.size > 1) message = 'Les lignes choisies concernent plusieurs tiers : un lettrage porte sur un seul tiers.';
      else if (sel.length >= 2 && d !== c) message = `Écart de ${formatMontant(Math.abs(d - c))} FCFA : le lettrage exige débit = crédit (règlement partiel : pas encore géré).`;
      vider(resume);
      ajouter(resume,
        h('div', {}, h('span', { class: 'discret' }, 'Lignes'), h('strong', {}, String(sel.length))),
        h('div', {}, h('span', { class: 'discret' }, 'Débit'), h('strong', { class: 'nombre' }, formatMontant(d))),
        h('div', {}, h('span', { class: 'discret' }, 'Crédit'), h('strong', { class: 'nombre' }, formatMontant(c))),
        h('div', { class: sel.length < 2 ? '' : d === c ? 'equilibre' : 'desequilibre' },
          h('span', { class: 'discret' }, 'Écart'), h('strong', { class: 'nombre' }, formatMontant(Math.abs(d - c)))),
        message ? h('p', { class: 'note' }, message) : null);
      bouton.disabled = !(sel.length >= 2 && d === c && tiers.size === 1);
    }

    bouton.addEventListener('click', async () => {
      vider(erreurs);
      bouton.disabled = true;
      try {
        const r = await appeler('lettrer', { p_lignes: [...choisies] });
        annoncer(`Lettrage ${r.code} enregistré.`, 'succes');
        await charger();
      } catch (err) { ajouter(erreurs, blocErreur(err.message)); bouton.disabled = false; }
    });

    const tableau = h('table', { class: 'tableau tableau-lettrage' },
      h('thead', {}, h('tr', {},
        peutLettrer ? h('th', { scope: 'col' }, h('span', { class: 'visuellement-cache' }, 'Choisir')) : null,
        ['Date', 'Numéro', 'Libellé', 'Tiers', 'Échéance'].map((t) => h('th', { scope: 'col' }, t)),
        ['Débit', 'Crédit'].map((t) => h('th', { scope: 'col', class: 'nombre' }, t)))),
      h('tbody', {}, lignes.map((l) => {
        const caseChoix = peutLettrer ? h('input', { type: 'checkbox', 'aria-label': `Choisir ${l.numero} ${l.libelle}` }) : null;
        if (caseChoix) caseChoix.addEventListener('change', () => {
          if (caseChoix.checked) choisies.add(l.ligne_id); else choisies.delete(l.ligne_id);
          caseChoix.closest('tr').classList.toggle('ligne-choisie', caseChoix.checked);
          majResume();
        });
        return h('tr', { dataset: { ligne: l.ligne_id } },
          caseChoix ? h('td', { class: 'case' }, caseChoix) : null,
          h('td', {}, formatDate(l.date_ecriture)),
          h('td', {}, h('a', { href: `#/ecriture/${l.ecriture_id}`, class: 'numero' }, l.numero)),
          h('td', { class: 'libelle' }, l.libelle),
          h('td', {}, l.tiers || ''),
          h('td', {}, formatDate(l.date_echeance)),
          h('td', { class: 'nombre' }, formatMontantOuVide(l.debit)),
          h('td', { class: 'nombre' }, formatMontantOuVide(l.credit)));
      })));
    ajouter(aLettrer, h('div', { class: 'defilement' }, tableau));
    if (peutLettrer) {
      majResume();
      ajouter(aLettrer, h('div', { class: 'barre-selection' }, resume, erreurs, h('div', { class: 'actions' }, bouton)));
    }
  }

  function afficherEnPlace(lettrages) {
    vider(enPlace);
    ajouter(enPlace, h('h2', { id: 'titre-en-place' }, `Lettrages en place (${lettrages.length})`));
    if (!lettrages.length) { ajouter(enPlace, h('p', { class: 'discret' }, 'Aucun lettrage sur ce compte pour cet exercice.')); return; }
    ajouter(enPlace, h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
      h('thead', {}, h('tr', {},
        ['Code', 'Tiers', 'Écritures'].map((t) => h('th', { scope: 'col' }, t)),
        h('th', { scope: 'col', class: 'nombre' }, 'Montant'), h('th', { scope: 'col' }, 'Lettré par'),
        peutLettrer ? h('th', { scope: 'col' }, h('span', { class: 'visuellement-cache' }, 'Action')) : null)),
      h('tbody', {}, lettrages.map((lt) => {
        const annuler = peutLettrer ? h('button', { type: 'button', class: 'bouton lien' }, 'Délettrer') : null;
        if (annuler) annuler.addEventListener('click', async () => {
          const v = await dialogue({ titre: `Délettrer ${lt.code}`,
            texte: 'Les lignes redeviendront « à lettrer ». Le lettrage annulé reste dans l\'historique.',
            champs: [{ nom: 'motif', etiquette: 'Motif (obligatoire)', requis: true }], bouton: 'Délettrer' });
          if (!v) return;
          try {
            await appeler('delettrer', { p_lettrage: lt.id, p_motif: v.motif });
            annoncer(`Lettrage ${lt.code} annulé.`, 'succes');
            await charger();
          } catch (err) { annoncer(err.message, 'erreur'); }
        });
        return h('tr', {},
          h('td', {}, h('strong', {}, lt.code)), h('td', {}, lt.tiers || ''), h('td', {}, lt.pieces || ''),
          h('td', { class: 'nombre' }, formatMontant(lt.montant)),
          h('td', {}, `${lt.cree_par}, ${new Date(lt.cree_le).toLocaleDateString('fr-FR')}`),
          annuler ? h('td', {}, annuler) : null);
      })))));
  }

  const form = h('form', { class: 'filtres', novalidate: true },
    h('label', { class: 'champ' }, h('span', {}, 'Compte'), champCompte),
    h('label', { class: 'champ' }, h('span', {}, 'Tiers'), champTiers),
    h('button', { type: 'submit', class: 'bouton principal' }, 'Afficher'));
  form.addEventListener('submit', (e) => { e.preventDefault(); charger(); });
  ajouter(zone, h('h1', {}, 'Lettrage'),
    h('p', { class: 'discret' },
      `Exercice ${x.code}. Cochez des lignes qui se compensent (par exemple une facture et son règlement), puis lettrez-les. `,
      'Le lettrage ne modifie aucune écriture.'),
    form, aLettrer, enPlace);
  await charger();
}
