// Gestion des utilisateurs : membres, rôles, invitations par adresse e-mail.
import { appeler } from '../client.js';
import { h, vider, ajouter, annoncer, blocErreur, dialogue } from '../ui.js';

export const ROLES = {
  gerant: { libelle: 'Gérant', description: 'Tous les droits, dont la clôture des périodes et la gestion des utilisateurs.' },
  comptable: { libelle: 'Comptable', description: 'Saisie, validation, contrepassation, lettrage, à-nouveaux, paramétrage. Pas de clôture.' },
  saisie: { libelle: 'Agent de saisie', description: 'Saisie et correction de ses propres brouillards. Ne valide pas.' },
  lecture: { libelle: 'Lecture seule', description: 'Consultation des écritures, du grand livre et de la balance.' },
  administrateur: { libelle: 'Administrateur technique', description: 'Gère les accès (sauf le rôle de gérant). Ne voit pas la comptabilité.' },
};

export async function vueUtilisateurs(ctx, zone) {
  const donnees = await appeler('utilisateurs', { p_societe: ctx.habilitation.societe_id });
  const jeSuisGerant = donnees.mon_role === 'gerant';
  const rolesAttribuables = Object.entries(ROLES)
    .filter(([cle]) => cle !== 'gerant' || jeSuisGerant)
    .map(([valeur, r]) => ({ valeur, libelle: r.libelle }));
  const erreurs = h('div', { class: 'zone-erreur' });

  async function recharger(message) {
    if (message) annoncer(message, 'succes');
    vider(zone);
    await vueUtilisateurs(ctx, zone);
  }

  // --- Membres --------------------------------------------------------------
  const membres = donnees.membres.map((m) => {
    const moi = m.utilisateur_id === donnees.moi;
    const modifiable = !moi && (jeSuisGerant || m.role !== 'gerant');
    let action = null;
    if (moi) action = h('span', { class: 'discret' }, 'vous');
    else if (modifiable) {
      action = h('button', { type: 'button', class: 'bouton lien' }, 'Modifier');
      action.addEventListener('click', async () => {
        const v = await dialogue({ titre: `Accès de ${m.nom}`,
          champs: [{ nom: 'role', etiquette: 'Rôle', type: 'select', options: rolesAttribuables, valeur: m.role },
                   { nom: 'actif', etiquette: 'Accès actif', type: 'checkbox', valeur: m.actif }],
          bouton: 'Enregistrer' });
        if (!v) return;
        vider(erreurs);
        try {
          await appeler('modifier_habilitation', { p_societe: ctx.habilitation.societe_id, p_utilisateur: m.utilisateur_id,
                                                    p_role: v.role, p_actif: v.actif });
          await recharger(`Accès de ${m.nom} mis à jour.`);
        } catch (err) { ajouter(erreurs, blocErreur(err.message)); }
      });
    }
    return h('tr', { class: m.actif ? '' : 'ligne-inactive' },
      h('td', { 'data-titre': 'Nom' }, h('strong', {}, m.nom)),
      h('td', { 'data-titre': 'E-mail' }, m.email || ''),
      h('td', { 'data-titre': 'Rôle' }, ROLES[m.role]?.libelle || m.role),
      h('td', { 'data-titre': 'Accès' }, m.actif ? 'Actif' : 'Désactivé'),
      h('td', {}, action));
  });

  // --- Invitations en attente ---------------------------------------------------
  const invitations = donnees.invitations.map((i) => {
    const annuler = (jeSuisGerant || i.role !== 'gerant') ? h('button', { type: 'button', class: 'bouton lien' }, 'Annuler') : null;
    if (annuler) annuler.addEventListener('click', async () => {
      const ok = await dialogue({ titre: 'Annuler l\'invitation ?', texte: `${i.nom} (${i.email}) n'aura pas accès à GRACIAS.`, bouton: 'Annuler l\'invitation', danger: true });
      if (!ok) return;
      try { await appeler('annuler_invitation', { p_id: i.id }); await recharger('Invitation annulée.'); } catch (err) { ajouter(erreurs, blocErreur(err.message)); }
    });
    return h('tr', {},
      h('td', { 'data-titre': 'Nom' }, i.nom), h('td', { 'data-titre': 'E-mail' }, i.email),
      h('td', { 'data-titre': 'Rôle' }, ROLES[i.role]?.libelle || i.role),
      h('td', { 'data-titre': 'Invitée le' }, new Date(i.cree_le).toLocaleDateString('fr-FR')), h('td', {}, annuler));
  });

  // --- Formulaire d'invitation ---------------------------------------------------
  const champNom = h('input', { name: 'nom', type: 'text', autocomplete: 'off', required: true });
  const champEmail = h('input', { name: 'email', type: 'email', autocomplete: 'off', required: true });
  const champRole = h('select', { name: 'role' }, rolesAttribuables.map((r) => h('option', { value: r.valeur }, r.libelle)));
  champRole.value = 'saisie';
  const aide = h('p', { class: 'discret aide-role' });
  const majAide = () => { aide.textContent = ROLES[champRole.value].description; };
  champRole.addEventListener('change', majAide);
  majAide();
  const bouton = h('button', { type: 'submit', class: 'bouton principal' }, 'Inviter');
  const form = h('form', { class: 'formulaire-invitation', novalidate: true },
    h('div', { class: 'grille-invitation' },
      h('label', { class: 'champ' }, h('span', {}, 'Nom et prénom'), champNom),
      h('label', { class: 'champ' }, h('span', {}, 'Adresse e-mail'), champEmail),
      h('label', { class: 'champ' }, h('span', {}, 'Rôle'), champRole)),
    aide, h('div', { class: 'actions' }, bouton));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    vider(erreurs);
    if (!champNom.value.trim() || !champEmail.value.trim()) { ajouter(erreurs, blocErreur('Indiquez le nom et l\'adresse e-mail.')); return; }
    bouton.disabled = true;
    try {
      await appeler('inviter_utilisateur', { p_societe: ctx.habilitation.societe_id, p_email: champEmail.value,
                                              p_nom: champNom.value, p_role: champRole.value });
      await recharger(`Invitation enregistrée pour ${champEmail.value.trim().toLowerCase()}.`);
    } catch (err) { ajouter(erreurs, blocErreur(err.message)); bouton.disabled = false; }
  });

  ajouter(zone,
    h('h1', {}, 'Utilisateurs'),
    erreurs,
    h('section', { class: 'bloc' }, h('h2', {}, 'Personnes ayant accès'),
      h('div', { class: 'defilement' }, h('table', { class: 'tableau tableau-membres' },
        h('thead', {}, h('tr', {}, ['Nom', 'E-mail', 'Rôle', 'Accès'].map((t) => h('th', { scope: 'col' }, t)),
          h('th', { scope: 'col' }, h('span', { class: 'visuellement-cache' }, 'Action')))),
        h('tbody', {}, membres)))),
    donnees.invitations.length ? h('section', { class: 'bloc' }, h('h2', {}, 'Invitations en attente'),
      h('div', { class: 'defilement' }, h('table', { class: 'tableau tableau-membres' },
        h('thead', {}, h('tr', {}, ['Nom', 'E-mail', 'Rôle', 'Invitée le'].map((t) => h('th', { scope: 'col' }, t)),
          h('th', { scope: 'col' }, h('span', { class: 'visuellement-cache' }, 'Action')))),
        h('tbody', {}, invitations)))) : null,
    h('section', { class: 'bloc' }, h('h2', {}, 'Inviter une personne'),
      h('p', {}, 'L\'invitation est activée à la première connexion de la personne avec cette adresse e-mail. ',
        'Son compte de connexion (adresse et mot de passe) se crée séparément dans le service d\'authentification : ',
        'voir le guide de déploiement.'),
      form),
    h('section', { class: 'bloc' }, h('h2', {}, 'Rôles'),
      h('dl', { class: 'roles' }, Object.values(ROLES).map((r) => h('div', {}, h('dt', {}, r.libelle), h('dd', {}, r.description))))));
}
