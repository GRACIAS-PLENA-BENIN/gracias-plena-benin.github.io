// Exercices, clôtures de périodes et d'exercice, report des soldes (à-nouveaux).
import { appeler } from '../client.js';
import { h, vider, ajouter, annoncer, blocErreur, dialogue } from '../ui.js';
import { formatMontant, formatDate } from '../format.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const nomPeriode = (p) => {
  const [a, m] = p.date_debut.split('-');
  return `${MOIS[Number(m) - 1]} ${a}`;
};
const lendemain = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const finUnAn = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export async function vueClotures(ctx, zone) {
  const etat = await appeler('etat_exercices', { p_societe: ctx.habilitation.societe_id });
  const x = etat.exercices.find((e) => e.id === ctx.exerciceId) || etat.exercices[0];
  if (!x) { ajouter(zone, h('h1', {}, 'Exercices et clôtures'), h('p', { class: 'vide' }, 'Aucun exercice.')); return; }
  const suivant = etat.exercices.find((e) => e.precedent && e.precedent.id === x.id) || null;
  const erreurs = h('div', { class: 'zone-erreur' });

  async function apres(message) {
    annoncer(message, 'succes');
    await ctx.rechargerReference();
    vider(zone);
    await vueClotures(ctx, zone);
  }
  async function executer(fn, bouton) {
    vider(erreurs);
    if (bouton) bouton.disabled = true;
    try { await fn(); } catch (err) {
      ajouter(erreurs, blocErreur(err.message));
      if (bouton) bouton.disabled = false;
      erreurs.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // --- Périodes ------------------------------------------------------------
  const premiereOuverte = x.periodes.find((p) => p.statut === 'ouverte');
  const lignesPeriodes = x.periodes.map((p) => {
    let action = null;
    if (p === premiereOuverte && x.statut === 'ouvert' && ctx.peut('cloture')) {
      if (Number(p.brouillards) > 0) {
        action = h('span', { class: 'note' }, `${p.brouillards} brouillard(s) à valider ou supprimer avant la clôture`);
      } else {
        action = h('button', { type: 'button', class: 'bouton secondaire petit' }, `Clôturer ${nomPeriode(p)}`);
        action.addEventListener('click', async () => {
          const v = await dialogue({
            titre: `Clôturer ${nomPeriode(p)} ?`,
            texte: ['La clôture est définitive : plus aucune écriture ne pourra être enregistrée du '
                    + `${formatDate(p.date_debut)} au ${formatDate(p.date_fin)}, et la période ne pourra pas être rouverte.`,
                    'Une erreur découverte plus tard se corrigera par contrepassation dans une période ouverte.'],
            champs: [{ nom: 'confirmation', etiquette: `Pour confirmer, recopiez : ${nomPeriode(p)}`, attendu: nomPeriode(p), requis: true }],
            bouton: 'Clôturer définitivement', danger: true });
          if (v) await executer(async () => { await appeler('cloturer_periode', { p_periode: p.id }); await apres(`Période ${nomPeriode(p)} clôturée.`); }, action);
        });
      }
    }
    return h('tr', { class: p.statut === 'cloturee' ? 'ligne-cloturee' : '' },
      h('td', {}, nomPeriode(p)),
      h('td', {}, p.statut === 'cloturee' ? h('span', { class: 'pastille-close' }, 'Clôturée') : h('span', { class: 'pastille-ouverte' }, 'Ouverte')),
      h('td', { class: 'nombre' }, String(p.validees)),
      h('td', { class: 'nombre' }, Number(p.brouillards) ? h('a', { href: '#/ecritures' }, String(p.brouillards)) : '0'),
      h('td', {}, p.cloture_le ? `${p.cloture_par}, ${new Date(p.cloture_le).toLocaleDateString('fr-FR')}` : ''),
      h('td', {}, action));
  });

  // --- Clôture de l'exercice ------------------------------------------------
  let blocExercice = null;
  if (x.statut === 'cloture') {
    blocExercice = h('p', { class: 'controle-ok' }, `Exercice ${x.code} clôturé le ${new Date(x.cloture_le).toLocaleDateString('fr-FR')} par ${x.cloture_par}.`);
  } else if (!premiereOuverte && ctx.peut('cloture')) {
    const b = h('button', { type: 'button', class: 'bouton danger' }, `Clôturer l'exercice ${x.code}`);
    b.addEventListener('click', async () => {
      const v = await dialogue({ titre: `Clôturer l'exercice ${x.code} ?`,
        texte: ['Toutes les périodes sont clôturées. La clôture de l\'exercice est définitive.',
                'Vérifiez auparavant que les à-nouveaux vers l\'exercice suivant sont à jour.'],
        champs: [{ nom: 'confirmation', etiquette: `Pour confirmer, recopiez : ${x.code}`, attendu: x.code, requis: true }],
        bouton: 'Clôturer l\'exercice', danger: true });
      if (v) await executer(async () => { await appeler('cloturer_exercice', { p_exercice: x.id }); await apres(`Exercice ${x.code} clôturé.`); }, b);
    });
    blocExercice = h('div', {}, h('p', {}, 'Toutes les périodes sont clôturées.'), b);
  } else {
    blocExercice = h('p', { class: 'discret' }, 'L\'exercice pourra être clôturé quand toutes ses périodes le seront.');
  }

  // --- À-nouveaux -------------------------------------------------------------
  const blocAN = h('div', {});
  if (!suivant) {
    ajouter(blocAN, h('p', {}, `Aucun exercice ne suit ${x.code}. Le report des soldes se fait vers l'exercice suivant.`));
    if (ctx.peut('parametrage') && x.id === etat.exercices[0].id) {
      const debut = lendemain(x.date_fin);
      const b = h('button', { type: 'button', class: 'bouton secondaire' }, 'Créer l\'exercice suivant');
      b.addEventListener('click', async () => {
        const v = await dialogue({ titre: 'Créer l\'exercice suivant',
          texte: `Il commencera le ${formatDate(debut)}. Les périodes mensuelles sont créées automatiquement.`,
          champs: [{ nom: 'code', etiquette: 'Code de l\'exercice', valeur: debut.slice(0, 4), requis: true },
                   { nom: 'fin', etiquette: 'Date de fin', type: 'date', valeur: finUnAn(debut), requis: true }],
          bouton: 'Créer' });
        if (v) await executer(async () => {
          await appeler('creer_exercice', { p_societe: ctx.habilitation.societe_id, p_code: v.code, p_date_debut: debut, p_date_fin: v.fin });
          await apres(`Exercice ${v.code.toUpperCase()} créé.`);
        }, b);
      });
      ajouter(blocAN, b);
    }
  } else {
    const parametre = etat.compte_resultat_benefice && etat.compte_resultat_perte;
    ajouter(blocAN, h('p', {},
      `Vers l'exercice ${suivant.code} : `,
      suivant.a_nouveaux
        ? h('span', {}, 'à-nouveaux enregistrés (', h('a', { href: `#/ecriture/${suivant.a_nouveaux.id}` }, suivant.a_nouveaux.numero), ').')
        : h('strong', {}, 'pas encore générés.')));
    ajouter(blocAN, h('p', { class: 'discret' },
      'Le report reprend les soldes des comptes de bilan (classes 1 à 5), le détail des créances et dettes non lettrées, ',
      'et le résultat de l\'exercice. L\'affectation du résultat décidée par les associés reste une écriture à saisir ensuite.'));
    if (!etat.journal_a_nouveaux) ajouter(blocAN, blocErreur('Aucun journal de type « à-nouveaux » : il doit être créé avant le report.'));
    if (!parametre) {
      ajouter(blocAN, h('p', { class: 'note' }, 'Comptes de résultat non paramétrés (compte du bénéfice et compte de la perte).'));
      if (ctx.peut('parametrage')) {
        const classe1 = ctx.ref.comptes.filter((c) => c.classe === 1).map((c) => ({ valeur: c.numero, libelle: `${c.numero} — ${c.libelle}` }));
        const b = h('button', { type: 'button', class: 'bouton secondaire' }, 'Paramétrer les comptes de résultat');
        b.addEventListener('click', async () => {
          if (classe1.length < 2) { annoncer('Il faut au moins deux comptes de classe 1 utilisables dans le plan.', 'erreur'); return; }
          const v = await dialogue({ titre: 'Comptes de résultat',
            texte: 'Choisissez les comptes qui recevront le résultat dans les à-nouveaux. À valider avec le plan comptable officiel.',
            champs: [{ nom: 'benefice', etiquette: 'Compte du bénéfice', type: 'select', options: classe1, valeur: classe1[0].valeur },
                     { nom: 'perte', etiquette: 'Compte de la perte', type: 'select', options: classe1, valeur: classe1[1].valeur }],
            bouton: 'Enregistrer' });
          if (v) await executer(async () => {
            await appeler('parametrer_comptes_resultat', { p_societe: ctx.habilitation.societe_id, p_benefice: v.benefice, p_perte: v.perte });
            await apres('Comptes de résultat enregistrés.');
          }, b);
        });
        ajouter(blocAN, b);
      }
    } else if (ctx.peut('a_nouveaux') && suivant.statut === 'ouvert') {
      ajouter(blocAN, h('p', { class: 'discret' },
        `Résultat : bénéfice au compte ${etat.compte_resultat_benefice}, perte au compte ${etat.compte_resultat_perte}.`));
      const b = h('button', { type: 'button', class: suivant.a_nouveaux ? 'bouton secondaire' : 'bouton principal' },
        suivant.a_nouveaux ? 'Régénérer les à-nouveaux' : `Générer les à-nouveaux vers ${suivant.code}`);
      b.addEventListener('click', async () => {
        if (suivant.a_nouveaux) {
          const v = await dialogue({ titre: 'Régénérer les à-nouveaux',
            texte: 'À utiliser si des écritures ont été ajoutées ou contrepassées dans l\'exercice après le report. '
                   + 'Les à-nouveaux actuels sont contrepassés (rien n\'est effacé), puis recalculés.',
            champs: [{ nom: 'motif', etiquette: 'Motif (obligatoire)', requis: true }], bouton: 'Régénérer' });
          if (v) await executer(async () => {
            const r = await appeler('regenerer_a_nouveaux', { p_source: x.id, p_cible: suivant.id, p_motif: v.motif });
            await apres(`À-nouveaux régénérés : ${r.numero}.`);
          }, b);
        } else {
          const v = await dialogue({ titre: `Générer les à-nouveaux vers ${suivant.code} ?`,
            texte: `Une écriture validée sera créée au ${formatDate(suivant.date_debut)}. Les brouillards de ${x.code} doivent avoir été traités.`,
            bouton: 'Générer' });
          if (v) await executer(async () => {
            const r = await appeler('generer_a_nouveaux', { p_source: x.id, p_cible: suivant.id });
            await apres(`À-nouveaux enregistrés : ${r.numero}.`);
          }, b);
        }
      });
      ajouter(blocAN, b);
    }
  }

  const resultat = Number(x.resultat);
  ajouter(zone,
    h('h1', {}, `Exercice ${x.code}`),
    h('dl', { class: 'infos' },
      h('div', {}, h('dt', {}, 'Période'), h('dd', {}, `du ${formatDate(x.date_debut)} au ${formatDate(x.date_fin)}`)),
      h('div', {}, h('dt', {}, 'Statut'), h('dd', {}, x.statut === 'cloture' ? 'Clôturé' : 'Ouvert')),
      h('div', {}, h('dt', {}, 'Résultat provisoire'),
        h('dd', {}, `${formatMontant(Math.abs(resultat))} FCFA ${resultat > 0 ? '(bénéfice)' : resultat < 0 ? '(perte)' : ''}`,
          h('span', { class: 'note-inline' }, 'Calculé sur les écritures validées des classes 6 à 8. Ce n\'est pas un résultat définitif : '
            + 'il ne tient pas compte des travaux d\'inventaire non encore saisis.')))),
    erreurs,
    h('section', { class: 'bloc' }, h('h2', {}, 'Périodes'),
      h('div', { class: 'defilement' }, h('table', { class: 'tableau tableau-periodes' },
        h('thead', {}, h('tr', {},
          ['Mois', 'Statut'].map((t) => h('th', { scope: 'col' }, t)),
          ['Validées', 'Brouillards'].map((t) => h('th', { scope: 'col', class: 'nombre' }, t)),
          h('th', { scope: 'col' }, 'Clôturée par'), h('th', { scope: 'col' }, h('span', { class: 'visuellement-cache' }, 'Action')))),
        h('tbody', {}, lignesPeriodes))),
      h('p', { class: 'discret' }, 'Les périodes se clôturent dans l\'ordre, une par une. Seul le gérant peut clôturer.')),
    h('section', { class: 'bloc' }, h('h2', {}, 'Clôture de l\'exercice'), blocExercice),
    h('section', { class: 'bloc' }, h('h2', {}, 'Report des soldes (à-nouveaux)'), blocAN));
}
