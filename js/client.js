// Accès à l'authentification et à l'API.
// Protocole identique à Supabase (Auth + PostgREST) : le même code fonctionne
// avec le serveur de développement et avec un projet Supabase.
import { messageLisible } from './format.js';

const config = window.GRACIAS_CONFIG || { url: '', cleAnon: '' };
const CLE_SESSION = 'gracias.session';

export class ErreurApi extends Error {
  constructor(statut, code, message) {
    super(messageLisible(message));
    this.statut = statut;
    this.code = code;
    this.messageBrut = message;
  }
}

let session = null;
try { session = JSON.parse(sessionStorage.getItem(CLE_SESSION) || 'null'); } catch { session = null; }
let surDeconnexion = () => {};

export function quandDeconnecte(fn) { surDeconnexion = fn; }
export function estConnecte() { return Boolean(session && session.access_token); }

function memoriser(s) {
  session = s;
  try {
    if (s) sessionStorage.setItem(CLE_SESSION, JSON.stringify(s));
    else sessionStorage.removeItem(CLE_SESSION);
  } catch { /* stockage indisponible : la session reste en mémoire */ }
}

function entetes(avecJeton) {
  const h = { 'Content-Type': 'application/json', 'Accept': 'application/json',
              'Content-Profile': 'api', 'Accept-Profile': 'api' };
  if (config.cleAnon) h.apikey = config.cleAnon;
  if (avecJeton && session) h.Authorization = `Bearer ${session.access_token}`;
  // Ancienne clé « anon » (format JWT) : aussi envoyée comme jeton ; nouvelle clé « publishable » (sb_publishable_…) :
  // uniquement dans l'en-tête apikey, car elle n'est pas un jeton.
  else if (config.cleAnon && config.cleAnon.split('.').length === 3) h.Authorization = `Bearer ${config.cleAnon}`;
  return h;
}

async function lireReponse(r) {
  const texte = await r.text();
  if (!texte) return null;
  try { return JSON.parse(texte); } catch { return texte; }
}

export async function connecter(email, motDePasse) {
  let r;
  try {
    r = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: entetes(false), body: JSON.stringify({ email, password: motDePasse }),
    });
  } catch {
    throw new ErreurApi(0, 'reseau', 'Connexion au serveur impossible. Vérifiez votre accès à internet.');
  }
  const corps = await lireReponse(r);
  if (!r.ok) {
    const msg = corps && (corps.error_description || corps.msg || corps.message);
    throw new ErreurApi(r.status, corps && corps.error, msg || 'Connexion refusée.');
  }
  memoriser(corps);
  return corps;
}

async function renouveler() {
  if (!session || !session.refresh_token) return false;
  try {
    const r = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: entetes(false), body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!r.ok) return false;
    memoriser(await r.json());
    return true;
  } catch { return false; }
}

export async function deconnecter() {
  const s = session;
  memoriser(null);
  if (s) {
    try {
      await fetch(`${config.url}/auth/v1/logout`, { method: 'POST',
        headers: { ...entetes(false), Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ refresh_token: s.refresh_token }) });
    } catch { /* déconnexion locale suffisante */ }
  }
}

/** Appelle la fonction api.<nom> avec des paramètres nommés. */
export async function appeler(nom, parametres = {}) {
  const sessionDeDepart = session;
  // Une réponse 401 ne ferme la session que si c'est encore celle qui a lancé la requête
  // (évite un faux « session expirée » après une déconnexion volontaire).
  const expirer = () => {
    if (session && session === sessionDeDepart) { memoriser(null); surDeconnexion(); }
  };
  if (session && session.expires_at && session.expires_at - Date.now() / 1000 < 60) {
    if (!(await renouveler())) { expirer(); throw new ErreurApi(401, 'session', 'Session expirée : reconnectez-vous.'); }
  }
  let r;
  try {
    r = await fetch(`${config.url}/rest/v1/rpc/${nom}`, {
      method: 'POST', headers: entetes(true), body: JSON.stringify(parametres),
    });
  } catch {
    throw new ErreurApi(0, 'reseau', 'Serveur injoignable. Vérifiez votre connexion : rien n\'a été enregistré.');
  }
  const corps = await lireReponse(r);
  if (r.status === 401) {
    expirer();
    throw new ErreurApi(401, corps && corps.code, 'Session expirée : reconnectez-vous.');
  }
  if (!r.ok) throw new ErreurApi(r.status, corps && corps.code, (corps && corps.message) || `Erreur ${r.status}.`);
  return corps;
}
