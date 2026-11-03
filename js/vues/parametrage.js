// Paramétrage : clients et fournisseurs (tiers), comptes, journaux.
import { appeler } from '../client.js';
import { h, vider, ajouter, annoncer, blocErreur, dialogue } from '../ui.js';

const TYPES_TIERS = [
  { valeur: 'client', libelle: 'Client' }, { valeur: 'fournisseur', libelle: 'Fournisseur' },
  { valeur: 'salarie', libelle: 'Salarié' }, { valeur: 'associe', libelle: 'Associé' }, { valeur: 'autre', libelle: 'Autre' },
];
const TYPES_JOURNAL = [
  { valeur: 'achats', libelle: 'Achats' }, { valeur: 'ventes', libelle: 'Ventes' },
  { valeur: 'tresorerie', libelle: 'Trésorerie (banque, caisse)' }, { valeur: 'operations_diverses', libelle: 'Opérations diverses' },
];
const COLLECTIF_PAR_DEFAUT = { client: '4111', fournisseur: '4011' };
const libelleType = (liste, v) => (liste.find((x) => x.valeur === v) || {}).libelle || v;
const ONGLETS = [['tiers', 'Clients et fournisseurs'], ['comptes', 'Comptes'], ['journaux', 'Journaux']];

export async function vueParametrage(ctx, zone) {
  const societe = ctx.habilitation.societe_id;
  const modifiable = ctx.peut('parametrage');
  let onglet = 'tiers';
  try { onglet = sessionStorage.getItem('gracias.param.onglet') || 'tiers'; } catch { /* sans effet */ }
  const erreurs = h('div', { class: 'zone-erreur' });
  const contenu = h('div', {});
  const barre = h('div', { class: 'filtres', role: 'tablist' });

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
    vider(barre);
    for (const [cle, titre] of ONGLETS) {
      const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(cle === onglet),
        class: cle === onglet ? 'bouton principal' : 'bouton secondaire' }, titre);
      b.addEventListener('click', () => { onglet = cle; try { sessionStorage.setItem('gracias.param.onglet', cle); } catch { /* */ } afficher(); });
      ajouter(barre, b);
    }
    ajouter(vider(contenu), h('p', { class: 'discret' }, 'Chargement…'));
    const p = await appeler('parametrage', { p_societe: societe });
    vider(contenu);
    if (onglet === 'tiers') afficherTiers(p);
    else if (onglet === 'comptes') afficherComptes(p);
    else afficherJournaux(p);
  }

  const colonnesComptes = (p, filtre) => p.comptes.filter((c) => c.actif && c.imputable && filtre(c))
    .map((c) => ({ valeur: c.numero, libelle: `${c.numero} — ${c.libelle}` }));

  // ----- Tiers --------------------------------------------------------------
  function formulaireTiers(p, t) {
    const collectifs = colonnesComptes(p, (c) => c.classe === 4);
    return dialogue({
      titre: t ? `Modifier ${t.code}` : 'Nouveau client ou fournisseur',
      champs: [
        ...(t ? [] : [{ nom: 'code', etiquette: 'Code court (ex. CLI-SONEB, FRS-CIMBENIN)', requis: true }]),
        { nom: 'nom', etiquette: 'Nom ou raison sociale', valeur: t?.nom, requis: true },
        { nom: 'type', etiquette: 'Type', type: 'select', options: TYPES_TIERS, valeur: t?.type || 'client' },
        { nom: 'compte_collectif', etiquette: 'Compte collectif', type: 'select',
          options: [{ valeur: '', libelle: '(aucun)' }, ...collectifs], valeur: t ? (t.compte_collectif || '') : '4111' },
        { nom: 'ifu', etiquette: 'IFU (facultatif)', valeur: t?.ifu || '' },
        ...(t ? [{ nom: 'actif', etiquette: 'Actif (utilisable en saisie)', type: 'checkbox', valeur: t.actif }] : []),
      ],
      bouton: t ? 'Enregistrer' : 'Créer',
    });
  }
  function afficherTiers(p) {
    const ajout = h('button', { type: 'button', class: 'bouton principal' }, 'Nouveau client ou fournisseur');
    ajout.addEventListener('click', async () => {
      const v = await formulaireTiers(p, null);
      if (!v) return;
      if (!v.compte_collectif && COLLECTIF_PAR_DEFAUT[v.type]) v.compte_collectif = COLLECTIF_PAR_DEFAUT[v.type];
      await executer(() => appeler('creer_tiers', { p_societe: societe, p: v }), `Tiers ${v.code.toUpperCase()} créé.`);
    });
    ajouter(contenu,
      h('p', { class: 'discret' }, 'Chaque client ou fournisseur est rattaché à son compte collectif (4111 Clients, 4011 Fournisseurs…). ',
        'À la saisie, indiquez son code sur la ligne de ce compte : le grand livre et le lettrage se font alors par tiers.'),
      modifiable ? h('div', { class: 'actions' }, ajout) : null,
      p.tiers.length ? h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
        h('thead', {}, h('tr', {}, ['Code', 'Nom', 'Type', 'Compte', 'IFU', 'État', ''].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, p.tiers.map((t) => {
          const b = modifiable ? h('button', { type: 'button', class: 'bouton lien' }, 'Modifier') : null;
          if (b) b.addEventListener('click', async () => {
            const v = await formulaireTiers(p, t);
            if (v) await executer(() => appeler('modifier_tiers', { p_societe: societe, p_code: t.code, p: v }), `Tiers ${t.code} mis à jour.`);
          });
          return h('tr', { class: t.actif ? '' : 'ligne-inactive' }, h('td', {}, h('strong', {}, t.code)), h('td', {}, t.nom),
            h('td', {}, libelleType(TYPES_TIERS, t.type)), h('td', {}, t.compte_collectif || ''), h('td', {}, t.ifu || ''),
            h('td', {}, t.actif ? 'Actif' : 'Désactivé'), h('td', {}, b));
        }))))
        : h('p', { class: 'vide' }, 'Aucun client ni fournisseur pour le moment.'));
  }

  // ----- Comptes ------------------------------------------------------------
  function afficherComptes(p) {
    const recherche = h('input', { type: 'search', placeholder: 'Numéro ou libellé (ex. 521, banque, carburant)', 'aria-label': 'Rechercher un compte' });
    const liste = h('div', {});
    const ajout = h('button', { type: 'button', class: 'bouton principal' }, 'Créer un sous-compte');
    ajout.addEventListener('click', async () => {
      const v = await dialogue({ titre: 'Créer un sous-compte',
        texte: ['Les comptes de 2 à 4 chiffres sont ceux du plan SYSCOHADA officiel. Vous pouvez créer des sous-comptes de 5 chiffres ou plus pour détailler, '
                + 'par exemple 52111 « Banque BOA » et 52112 « Banque Ecobank » sous 5211 Banques en monnaie nationale.'],
        champs: [{ nom: 'numero', etiquette: 'Numéro (5 chiffres ou plus, commençant par un compte de 4 chiffres existant)', requis: true },
                 { nom: 'libelle', etiquette: 'Libellé', requis: true }],
        bouton: 'Créer' });
      if (v) await executer(() => appeler('creer_compte', { p_societe: societe, p: v }), `Compte ${v.numero} créé.`);
    });
    function remplir() {
      const q = recherche.value.trim().toLowerCase();
      const trouves = q ? p.comptes.filter((c) => c.numero.startsWith(q) || c.libelle.toLowerCase().includes(q)) : p.comptes.filter((c) => !c.officiel);
      vider(liste);
      if (!trouves.length) {
        ajouter(liste, h('p', { class: 'vide' }, q ? 'Aucun compte trouvé.' : 'Aucun sous-compte créé par la société. Recherchez un compte pour l\'afficher.'));
        return;
      }
      ajouter(liste, h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
        h('thead', {}, h('tr', {}, ['Compte', 'Libellé', 'Saisie', 'Tiers', 'Lettrable', ''].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, trouves.slice(0, 150).map((c) => {
          const b = modifiable && c.imputable ? h('button', { type: 'button', class: 'bouton lien' }, 'Modifier') : null;
          if (b) b.addEventListener('click', async () => {
            const v = await dialogue({ titre: `Compte ${c.numero}`,
              texte: c.officiel ? 'Compte du plan officiel : son libellé ne peut pas être modifié.' : null,
              champs: [...(c.officiel ? [] : [{ nom: 'libelle', etiquette: 'Libellé', valeur: c.libelle, requis: true }]),
                       { nom: 'exige_tiers', etiquette: 'Un tiers (client, fournisseur…) est obligatoire sur ce compte', type: 'checkbox', valeur: c.exige_tiers },
                       { nom: 'lettrable', etiquette: 'Lettrable (rapprochement facture / règlement)', type: 'checkbox', valeur: c.lettrable },
                       { nom: 'actif', etiquette: 'Actif (utilisable en saisie)', type: 'checkbox', valeur: c.actif }],
              bouton: 'Enregistrer' });
            if (v) await executer(() => appeler('modifier_compte', { p_societe: societe, p_numero: c.numero, p: v }), `Compte ${c.numero} mis à jour.`);
          });
          return h('tr', { class: c.actif ? '' : 'ligne-inactive' }, h('td', {}, h('strong', {}, c.numero)), h('td', { class: 'libelle' }, c.libelle),
            h('td', {}, c.imputable ? 'Oui' : 'Regroupement'), h('td', {}, c.exige_tiers ? 'Obligatoire' : ''),
            h('td', {}, c.lettrable ? 'Oui' : ''), h('td', {}, b));
        })))),
        trouves.length > 150 ? h('p', { class: 'discret' }, `${trouves.length} comptes : précisez la recherche.`) : null);
    }
    let minuterie;
    recherche.addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(remplir, 200); });
    ajouter(contenu,
      h('p', { class: 'discret' }, `Plan SYSCOHADA révisé (JO OHADA du 15/02/2017) : ${p.comptes.filter((c) => c.officiel).length} comptes officiels, `
        + `${p.comptes.filter((c) => !c.officiel).length} sous-compte(s) de la société.`),
      h('div', { class: 'filtres' }, recherche, modifiable ? ajout : null), liste);
    remplir();
  }

  // ----- Journaux -----------------------------------------------------------
  function afficherJournaux(p) {
    const tresorerie = colonnesComptes(p, (c) => c.classe === 5);
    const ajout = h('button', { type: 'button', class: 'bouton principal' }, 'Nouveau journal');
    ajout.addEventListener('click', async () => {
      const v = await dialogue({ titre: 'Nouveau journal',
        texte: 'Un journal de trésorerie par compte bancaire ou caisse : par exemple BQ2 pour un second compte en banque.',
        champs: [{ nom: 'code', etiquette: 'Code (lettres et chiffres, 6 au plus)', requis: true },
                 { nom: 'libelle', etiquette: 'Libellé', requis: true },
                 { nom: 'type', etiquette: 'Type', type: 'select', options: TYPES_JOURNAL, valeur: 'tresorerie' },
                 { nom: 'compte_tresorerie', etiquette: 'Compte de banque ou de caisse (trésorerie uniquement)', type: 'select',
                   options: [{ valeur: '', libelle: '(aucun)' }, ...tresorerie], valeur: '' }],
        bouton: 'Créer' });
      if (v) await executer(() => appeler('creer_journal', { p_societe: societe, p: v }), `Journal ${v.code.toUpperCase()} créé.`);
    });
    ajouter(contenu, modifiable ? h('div', { class: 'actions' }, ajout) : null,
      h('div', { class: 'defilement' }, h('table', { class: 'tableau' },
        h('thead', {}, h('tr', {}, ['Code', 'Libellé', 'Type', 'Compte', 'État', ''].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, p.journaux.map((j) => {
          const b = modifiable && j.type !== 'a_nouveaux' ? h('button', { type: 'button', class: 'bouton lien' }, 'Modifier') : null;
          if (b) b.addEventListener('click', async () => {
            const v = await dialogue({ titre: `Journal ${j.code}`,
              champs: [{ nom: 'libelle', etiquette: 'Libellé', valeur: j.libelle, requis: true },
                       { nom: 'actif', etiquette: 'Actif (utilisable en saisie)', type: 'checkbox', valeur: j.actif }],
              bouton: 'Enregistrer' });
            if (v) await executer(() => appeler('modifier_journal', { p_societe: societe, p_code: j.code, p: v }), `Journal ${j.code} mis à jour.`);
          });
          return h('tr', { class: j.actif ? '' : 'ligne-inactive' }, h('td', {}, h('strong', {}, j.code)), h('td', {}, j.libelle),
            h('td', {}, j.type === 'a_nouveaux' ? 'À-nouveaux' : libelleType(TYPES_JOURNAL, j.type)),
            h('td', {}, j.compte_tresorerie || ''), h('td', {}, j.actif ? 'Actif' : 'Désactivé'), h('td', {}, b));
        })))));
  }

  ajouter(zone, h('h1', {}, 'Paramétrage'),
    modifiable ? null : h('p', { class: 'note' }, 'Consultation seule : la modification est réservée au gérant et au comptable.'),
    barre, erreurs, contenu);
  await afficher();
}
