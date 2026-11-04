// Pièces justificatives d'une écriture : liste, ajout (PDF, photo), ouverture.
/* global FileReader, createImageBitmap, atob */
import { appeler } from './client.js';
import { h, vider, ajouter, annoncer, blocErreur, dialogue } from './ui.js';

const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const TAILLE_MAX = 5 * 1024 * 1024;

const taille = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

function lireBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    r.readAsDataURL(blob);
  });
}

// Les photos volumineuses sont réduites (2000 pixels au plus, JPEG) pour rester légères.
async function preparer(fichier) {
  if (!fichier.type.startsWith('image/') || fichier.size <= 1024 * 1024) return { blob: fichier, type: fichier.type, nom: fichier.name };
  const image = await createImageBitmap(fichier);
  const echelle = Math.min(1, 2000 / Math.max(image.width, image.height));
  const toile = document.createElement('canvas');
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height);
  const blob = await new Promise((resolve) => toile.toBlob(resolve, 'image/jpeg', 0.85));
  return { blob, type: 'image/jpeg', nom: fichier.name.replace(/\.[^.]+$/, '') + '.jpg' };
}

export async function blocPieces(ctx, ecriture) {
  const zone = h('section', { class: 'bloc', 'aria-labelledby': 'titre-pieces' });
  const erreurs = h('div', { class: 'zone-erreur' });
  const peutAjouter = ctx.peut('saisie');
  const brouillard = ecriture.statut === 'brouillard';
  const choix = h('input', { type: 'file', accept: TYPES.join(','), class: 'visuellement-cache', id: `piece-${ecriture.id}` });

  async function afficher() {
    const pieces = await appeler('pieces', { p_ecriture: ecriture.id });
    vider(zone);
    ajouter(zone, h('h2', { id: 'titre-pieces' }, `Pièces justificatives (${pieces.length})`), erreurs);
    if (!pieces.length) ajouter(zone, h('p', { class: 'discret' }, 'Aucune pièce jointe à cette écriture.'));
    else {
      ajouter(zone, h('ul', { class: 'liste' }, pieces.map((p) => {
        const ouvrir = h('button', { type: 'button', class: 'bouton lien' }, p.nom);
        ouvrir.addEventListener('click', async () => {
          const fenetre = window.open('', '_blank');
          try {
            const c = await appeler('piece_contenu', { p_piece: p.id });
            const octets = Uint8Array.from(atob(c.contenu), (x) => x.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([octets], { type: c.type }));
            if (fenetre) fenetre.location = url; else window.location.assign(url);
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          } catch (err) { if (fenetre) fenetre.close(); ajouter(vider(erreurs), blocErreur(err.message)); }
        });
        let retirer = null;
        if (brouillard && peutAjouter) {
          retirer = h('button', { type: 'button', class: 'bouton danger-discret petit' }, 'Retirer');
          retirer.addEventListener('click', async () => {
            const ok = await dialogue({ titre: 'Retirer cette pièce ?', texte: `« ${p.nom} » sera retirée du brouillard (l'opération reste tracée).`, bouton: 'Retirer', danger: true });
            if (!ok) return;
            try { await appeler('retirer_piece', { p_piece: p.id }); annoncer('Pièce retirée.'); await afficher(); } catch (err) { ajouter(vider(erreurs), blocErreur(err.message)); }
          });
        }
        return h('li', {}, ouvrir, h('span', { class: 'discret' }, ` — ${taille(p.taille)}, ajoutée par ${p.cree_par} le ${new Date(p.cree_le).toLocaleDateString('fr-FR')} `), retirer);
      })));
    }
    if (peutAjouter) {
      const label = h('label', { for: choix.id, class: 'bouton secondaire', tabindex: '0' }, 'Joindre une pièce (PDF, photo)');
      label.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choix.click(); } });
      ajouter(zone, h('div', { class: 'actions' }, label, choix),
        h('p', { class: 'discret' }, brouillard ? 'Formats : PDF, JPEG, PNG. 5 Mo au plus par fichier.'
          : 'Écriture validée : vous pouvez ajouter des pièces, mais plus les retirer.'));
    }
  }

  choix.addEventListener('change', async () => {
    const f = choix.files[0];
    choix.value = '';
    if (!f) return;
    vider(erreurs);
    if (!TYPES.includes(f.type)) { ajouter(erreurs, blocErreur('Format non accepté : PDF, JPEG ou PNG uniquement.')); return; }
    try {
      const p = await preparer(f);
      if (p.blob.size > TAILLE_MAX) throw new Error('Fichier trop volumineux (5 Mo au plus). Réduisez le scan.');
      annoncer('Envoi de la pièce…');
      await appeler('ajouter_piece', { p_ecriture: ecriture.id, p_nom: p.nom, p_type: p.type, p_contenu: await lireBase64(p.blob) });
      annoncer('Pièce jointe.', 'succes');
      await afficher();
    } catch (err) { ajouter(erreurs, blocErreur(err.message)); }
  });

  await afficher();
  return zone;
}
