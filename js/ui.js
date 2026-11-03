// Petits outils d'affichage. Tout le texte est inséré avec textContent :
// aucune donnée n'est interprétée comme du HTML (protection contre l'injection).

/** Crée un élément : h('button', { class: 'x', onclick: fn }, 'Texte', enfant…) */
export function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const e of enfants.flat(Infinity)) {
    if (e === null || e === undefined || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return el;
}

export function vider(el) { el.replaceChildren(); return el; }

/** Ajoute des enfants à un élément en dépliant les listes et en ignorant les valeurs vides. */
export function ajouter(el, ...enfants) {
  for (const e of enfants.flat(Infinity)) {
    if (e === null || e === undefined || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return el;
}

let zoneMessages;
/** Message temporaire (succès, information) annoncé aux lecteurs d'écran. */
export function annoncer(texte, type = 'info') {
  if (!zoneMessages) {
    zoneMessages = h('div', { class: 'messages', role: 'status', 'aria-live': 'polite' });
    document.body.append(zoneMessages);
  }
  const m = h('div', { class: `message message-${type}` }, texte);
  while (zoneMessages.children.length >= 2) zoneMessages.firstElementChild.remove();
  zoneMessages.append(m);
  setTimeout(() => m.remove(), type === 'erreur' ? 8000 : 4000);
}

/** Bloc d'erreur affiché dans la page (persistant jusqu'à la prochaine action). */
export function blocErreur(texte) {
  return h('div', { class: 'erreur', role: 'alert' }, texte);
}

/**
 * Boîte de dialogue modale.
 * champs : [{ nom, etiquette, type ('text', 'date', 'email', 'select', 'checkbox'…), valeur, requis,
 *             options: [{ valeur, libelle }] (pour 'select'),
 *             attendu: texte à recopier exactement (confirmation d'une action irréversible) }]
 * Renvoie une promesse : objet des valeurs (booléen pour une case à cocher), ou null si annulé.
 */
export function dialogue({ titre, texte, champs = [], bouton = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    const valeurs = {};
    const erreur = h('div', { class: 'zone-erreur' });
    const champ = (c) => {
      if (c.type === 'checkbox') {
        return h('label', { class: 'champ-case' },
          h('input', { name: c.nom, type: 'checkbox', checked: c.valeur ? true : undefined }), h('span', {}, c.etiquette));
      }
      const saisie = c.type === 'select'
        ? h('select', { name: c.nom }, (c.options || []).map((o) =>
            h('option', { value: o.valeur, selected: o.valeur === c.valeur ? true : undefined }, o.libelle)))
        : h('input', { name: c.nom, type: c.type || 'text', value: c.valeur || '', required: c.requis ? true : undefined,
                       autocomplete: 'off' });
      return h('label', { class: 'champ' }, h('span', {}, c.etiquette), saisie);
    };
    const form = h('form', { method: 'dialog', class: 'dialogue-corps', novalidate: true },
      h('h2', {}, titre),
      texte ? (Array.isArray(texte) ? texte.map((t) => h('p', {}, t)) : h('p', {}, texte)) : null,
      champs.map(champ),
      erreur,
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'bouton secondaire', onclick: () => { d.close(); resolve(null); } }, 'Annuler'),
        h('button', { type: 'submit', class: danger ? 'bouton danger' : 'bouton principal' }, bouton)));
    const d = h('dialog', { class: 'dialogue' }, form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      erreur.replaceChildren();
      for (const c of champs) {
        const el = form.elements[c.nom];
        valeurs[c.nom] = c.type === 'checkbox' ? el.checked : el.value;
        if (c.requis && c.type !== 'checkbox' && !String(el.value).trim()) {
          erreur.append(blocErreur(`Champ obligatoire : ${c.etiquette}.`));
          el.focus();
          return;
        }
        if (c.attendu !== undefined && String(el.value).trim() !== c.attendu) {
          erreur.append(blocErreur(`Recopiez exactement « ${c.attendu} » pour confirmer.`));
          el.focus();
          return;
        }
      }
      d.close();
      resolve(valeurs);
    });
    d.addEventListener('cancel', () => resolve(null));
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
    const premier = form.querySelector('input, select');
    if (premier) premier.focus();
  });
}

/** Déclenche le téléchargement d'un fichier texte. */
export function telecharger(nom, contenu, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = h('a', { href: url, download: nom });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
