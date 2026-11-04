// Application GRACIAS : état, navigation, mise en page.
import { appeler, connecter, deconnecter, estConnecte, quandDeconnecte, ErreurApi } from './client.js';
import { h, vider, blocErreur, ajouter } from './ui.js';
import { vueEcritures } from './vues/ecritures.js';
import { vueEcriture } from './vues/ecriture.js';
import { vueSaisie } from './vues/saisie.js';
import { vueGrandLivre } from './vues/grand-livre.js';
import { vueBalance } from './vues/balance.js';
import { vueLettrage } from './vues/lettrage.js';
import { vueClotures } from './vues/clotures.js';
import { vueUtilisateurs } from './vues/utilisateurs.js';
import { vueSauvegarde, bandeauSauvegarde } from './vues/sauvegarde.js';
import { vueParametrage } from './vues/parametrage.js';
import { vueMarches } from './vues/marches.js';
import { vueTresorerie } from './vues/tresorerie.js';

const racine = document.getElementById('app');

// Contexte partagé par les écrans.
export const ctx = {
  profil: null,       // api.mon_profil()
  habilitation: null, // société choisie et droits
  ref: null,          // api.donnees_reference()
  exerciceId: null,
  peut(droit) { return Boolean(this.habilitation && this.habilitation.droits.includes(droit)); },
  get exercice() { return (this.ref?.exercices || []).find((x) => x.id === this.exerciceId) || null; },
  async rechargerReference() {
    this.ref = await appeler('donnees_reference', { p_societe: this.habilitation.societe_id });
    if (!this.exercice) this.exerciceId = choisirExercice(this.ref.exercices);
  },
  aller(route) { location.hash = route; },
};

function choisirExercice(exercices) {
  const jour = new Date().toISOString().slice(0, 10);
  const courant = exercices.find((x) => jour >= x.date_debut && jour <= x.date_fin);
  return (courant || exercices.find((x) => x.statut === 'ouvert') || exercices[0] || {}).id || null;
}

// « principal » : visible dans la barre du bas sur téléphone ; les autres sont sous « Plus ».
const MENU = [
  { route: '#/ecritures', titre: 'Écritures', droit: 'lecture', principal: true },
  { route: '#/saisie', titre: 'Nouvelle écriture', droit: 'saisie', principal: true },
  { route: '#/grand-livre', titre: 'Grand livre', droit: 'lecture', principal: true },
  { route: '#/balance', titre: 'Balance', droit: 'lecture', principal: true },
  { route: '#/tresorerie', titre: 'Caisse et banque', droit: 'lecture' },
  { route: '#/lettrage', titre: 'Lettrage', droit: 'lettrage' },
  { route: '#/marches', titre: 'Marchés', droit: 'lecture' },
  { route: '#/parametrage', titre: 'Paramétrage', droit: 'lecture' },
  { route: '#/clotures', titre: 'Exercices et clôtures', droit: 'lecture' },
  { route: '#/utilisateurs', titre: 'Utilisateurs', droit: 'utilisateurs' },
  { route: '#/sauvegarde', titre: 'Sauvegarde', droit: 'sauvegarde' },
];

function routeParDefaut() {
  return ctx.peut('lecture') ? '#/ecritures' : '#/utilisateurs';
}

// ---------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------
function ecranConnexion(message) {
  const erreur = h('div', { class: 'zone-erreur' }, message ? blocErreur(message) : null);
  const bouton = h('button', { type: 'submit', class: 'bouton principal large' }, 'Se connecter');
  const form = h('form', { class: 'connexion-carte', novalidate: true },
    h('div', { class: 'marque' }, h('span', { class: 'marque-sceau', 'aria-hidden': 'true' }, 'G'), h('span', {}, 'GRACIAS')),
    h('h1', {}, 'Connexion'),
    h('p', { class: 'discret' }, 'Comptabilité et gestion de la société.'),
    h('label', { class: 'champ' }, h('span', {}, 'Adresse e-mail'),
      h('input', { name: 'email', type: 'email', autocomplete: 'username', required: true })),
    h('label', { class: 'champ' }, h('span', {}, 'Mot de passe'),
      h('input', { name: 'motdepasse', type: 'password', autocomplete: 'current-password', required: true })),
    erreur, bouton);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.elements.email.value.trim();
    const mdp = form.elements.motdepasse.value;
    vider(erreur);
    if (!email || !mdp) { ajouter(erreur, blocErreur('Saisissez votre adresse e-mail et votre mot de passe.')); return; }
    bouton.disabled = true;
    bouton.textContent = 'Connexion…';
    try {
      await connecter(email, mdp);
      await demarrer();
    } catch (err) {
      ajouter(erreur, blocErreur(err.message));
      bouton.disabled = false;
      bouton.textContent = 'Se connecter';
    }
  });
  ajouter(vider(racine), h('main', { class: 'page-connexion' }, form));
  form.elements.email.focus();
}

// ---------------------------------------------------------------------
// Mise en page principale
// ---------------------------------------------------------------------
let zoneContenu;
let majRappel = () => {};
document.addEventListener('gracias:sauvegarde', () => majRappel());

function selecteurExercice() {
  if (!ctx.ref.exercices.length) return null;
  const s = h('select', { 'aria-label': 'Exercice', class: 'selecteur-exercice' },
    ctx.ref.exercices.map((x) => h('option', { value: x.id, selected: x.id === ctx.exerciceId ? true : undefined },
      `Exercice ${x.code}${x.statut === 'cloture' ? ' (clôturé)' : ''}`)));
  s.addEventListener('change', () => { ctx.exerciceId = s.value; afficherRoute(); });
  return s;
}

function bandeauPlan() {
  if (!ctx.peut('lecture')) return null;
  const nonValides = (ctx.ref.comptes || []).filter((c) => c.statut_validation !== 'valide').length;
  if (!nonValides) return null;
  return h('div', { class: 'bandeau-avertissement', role: 'note' },
    h('strong', {}, 'Plan comptable non validé. '),
    `${nonValides} compte(s) utilisable(s) proviennent d'un plan de démonstration ou restent à vérifier. `,
    'N\'enregistrez pas de données réelles tant que le plan officiel n\'est pas intégré et validé.');
}

function miseEnPage() {
  const entrees = MENU.filter((m) => ctx.peut(m.droit));
  const lien = (m) => h('a', { href: m.route, dataset: { route: m.route } }, m.titre);
  const secondaires = entrees.filter((m) => !m.principal);
  const plus = secondaires.length && entrees.some((m) => m.principal)
    ? h('li', { class: 'menu-plus' }, h('details', {},
        h('summary', {}, 'Plus'),
        h('ul', {}, secondaires.map((m) => h('li', {}, lien(m))))))
    : null;
  const nav = h('nav', { class: 'navigation', 'aria-label': 'Navigation principale' },
    h('ul', {},
      entrees.map((m) => h('li', { class: m.principal || !plus ? '' : 'secondaire' }, lien(m))),
      plus));
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) for (const d of nav.querySelectorAll('details[open]')) d.open = false;
  });
  const entete = h('header', { class: 'entete' },
    h('div', { class: 'marque' }, h('span', { class: 'marque-sceau', 'aria-hidden': 'true' }, 'G'),
      h('span', { class: 'marque-societe' }, ctx.habilitation.raison_sociale)),
    selecteurExercice(),
    h('div', { class: 'utilisateur' },
      h('span', { class: 'utilisateur-nom' }, ctx.profil.utilisateur.nom, ' ', h('span', { class: 'role' }, libelleRole(ctx.habilitation.role))),
      h('button', { class: 'bouton lien', onclick: async () => { await deconnecter(); ecranConnexion(); } }, 'Se déconnecter')));
  zoneContenu = h('main', { id: 'contenu', class: 'contenu', tabindex: '-1' });
  const zoneRappel = h('div', {});
  ajouter(vider(racine), entete, nav, h('div', { class: 'cadre' }, bandeauPlan(), zoneRappel, zoneContenu));
  majRappel = async () => ajouter(vider(zoneRappel), await bandeauSauvegarde(ctx));
  majRappel();
}

function libelleRole(r) {
  return { gerant: 'gérant', comptable: 'comptable', saisie: 'saisie', lecture: 'lecture', administrateur: 'administrateur' }[r] || r;
}

function marquerMenu(route) {
  for (const a of racine.querySelectorAll('.navigation a')) {
    if (!a.dataset.route) continue;
    if (route.startsWith(a.dataset.route)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

// Chaque affichage d'écran se fait dans son propre conteneur : si l'utilisateur change
// d'écran avant la fin du chargement, l'écran précédent (devenu détaché) ne peut plus
// se mélanger au nouveau.
let numeroAffichage = 0;
async function afficherRoute() {
  if (!ctx.habilitation) return;
  const numero = ++numeroAffichage;
  const route = location.hash || routeParDefaut();
  const [, ecran, param] = route.split('/');
  marquerMenu(`#/${ecran}`);
  const zone = h('div', { class: 'ecran' });
  ajouter(vider(zoneContenu), zone);
  try {
    if (!ctx.peut('lecture')) await vueUtilisateurs(ctx, zone); // administrateur technique
    else if (ecran === 'ecriture' && param) await vueEcriture(ctx, zone, param);
    else if (ecran === 'saisie' && ctx.peut('saisie')) await vueSaisie(ctx, zone, param || null);
    else if (ecran === 'grand-livre') await vueGrandLivre(ctx, zone);
    else if (ecran === 'utilisateurs' && ctx.peut('utilisateurs')) await vueUtilisateurs(ctx, zone);
    else if (ecran === 'sauvegarde' && ctx.peut('sauvegarde')) await vueSauvegarde(ctx, zone);
    else if (ecran === 'balance') await vueBalance(ctx, zone);
    else if (ecran === 'lettrage' && ctx.peut('lettrage')) await vueLettrage(ctx, zone);
    else if (ecran === 'clotures') await vueClotures(ctx, zone);
    else if (ecran === 'parametrage') await vueParametrage(ctx, zone);
    else if (ecran === 'marches') await vueMarches(ctx, zone);
    else if (ecran === 'tresorerie') await vueTresorerie(ctx, zone, param ? decodeURIComponent(param) : undefined);
    else if (ecran === 'marche' && param) await vueMarches(ctx, zone, decodeURIComponent(param));
    else await vueEcritures(ctx, zone);
  } catch (err) {
    if (err instanceof ErreurApi && err.statut === 401) return;
    ajouter(zone, blocErreur(err.message || String(err)));
  }
  if (numero === numeroAffichage) zoneContenu.focus({ preventScroll: true });
}

async function demarrer() {
  try {
    ctx.profil = await appeler('mon_profil');
  } catch (err) {
    ecranConnexion(err.statut === 401 ? null : err.message);
    return;
  }
  const habs = ctx.profil.habilitations.filter((x) => x.droits && (x.droits.includes('lecture') || x.droits.includes('utilisateurs')));
  if (!habs.length) {
    await deconnecter();
    ecranConnexion('Votre compte n\'a accès à aucune comptabilité. Contactez le gérant.');
    return;
  }
  ctx.habilitation = habs[0];
  if (ctx.peut('lecture')) await ctx.rechargerReference();
  else ctx.ref = { exercices: [], comptes: [], tiers: [], journaux: [], axes: [] };
  miseEnPage();
  await afficherRoute();
}

quandDeconnecte(() => ecranConnexion('Votre session a expiré. Reconnectez-vous.'));
window.addEventListener('hashchange', afficherRoute);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (estConnecte()) demarrer(); else ecranConnexion();
