# 🎙️ Voice Notes

Application web de **notes vocales** : on appuie sur le micro, on parle, on rappuie — la note est
créée automatiquement avec sa transcription et son audio.

Tout fonctionne **dans le navigateur** : pas de serveur, pas de compte, pas de base de données
distante. Les notes vivent dans IndexedDB, sur votre appareil.

- 🎙️ Un clic pour démarrer, un clic pour arrêter (mode « maintenir » disponible dans les réglages)
- 📝 Transcription automatique via la reconnaissance vocale du navigateur
- 🔊 Audio réécoutable, conservé 7 jours par défaut ; la transcription, elle, reste
- 🔎 Recherche instantanée, insensible à la casse et aux accents (« ecole » trouve « école »)
- 📱 Une interface pensée pour le téléphone, 💻 une autre pensée pour l'ordinateur
- 📦 Installable comme PWA, utilisable hors ligne

---

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Scripts disponibles](#scripts-disponibles)
- [Déploiement sur GitHub Pages](#déploiement-sur-github-pages)
- [Architecture du projet](#architecture-du-projet)
- [Stockage des données](#stockage-des-données)
- [Conservation des audios](#conservation-des-audios)
- [Speech-to-Text](#speech-to-text)
- [Mobile vs desktop](#mobile-vs-desktop)
- [Compatibilité navigateur](#compatibilité-navigateur)
- [Confidentialité](#confidentialité)
- [Limitations connues](#limitations-connues)
- [Tests](#tests)
- [Dépendances](#dépendances)

---

## Démarrage rapide

Pré-requis : **Node.js 20+**.

```bash
npm install
npm run dev
```

L'application est servie sur <http://localhost:5173>.

> Le microphone n'est accessible qu'en **contexte sécurisé** : `localhost` et HTTPS conviennent,
> une IP locale en `http://` non.

## Scripts disponibles

| Script              | Rôle                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `npm run dev`       | Serveur de développement Vite avec rechargement à chaud            |
| `npm run build`     | Vérification TypeScript puis build de production dans `dist/`      |
| `npm run preview`   | Sert le build de production localement                             |
| `npm test`          | Suite de tests Vitest                                              |
| `npm run typecheck` | Vérification TypeScript seule                                      |

Pour tester le build exactement comme sur GitHub Pages (sous un sous-chemin) :

```bash
VITE_BASE_PATH=Voice-note npm run build
VITE_BASE_PATH=Voice-note npm run preview
# → http://localhost:4173/Voice-note/
```

Les icônes de la PWA sont générées par `node scripts/generate-icons.mjs` (à relancer seulement si
le visuel change ; les PNG sont versionnés).

## Déploiement sur GitHub Pages

Le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) fait tout :

```
git push (main) → npm ci → npm test → npm run build → déploiement Pages
```

Une seule chose à faire dans le dépôt : **Settings → Pages → Source : GitHub Actions**.

Le point souvent douloureux — les chemins sous `https://user.github.io/repo/` — est réglé ainsi :

- le workflow passe `VITE_BASE_PATH: ${{ github.event.repository.name }}` au build, donc le base
  path suit toujours le nom réel du dépôt (aucun chemin codé en dur, aucun souci si le dépôt est
  renommé) ;
- `index.html` référence ses ressources en **relatif** (`./manifest.webmanifest`, `./favicon.svg`) ;
- le manifeste utilise `"start_url": "./"` et `"scope": "./"` ;
- le service worker est enregistré sur `import.meta.env.BASE_URL` et sa liste de pré-cache est
  générée au build avec le bon préfixe ;
- l'application n'utilise **pas de routeur** : une seule URL, donc pas de 404 au rafraîchissement.

## Architecture du projet

```
src/
├── components/          Composants d'interface, sans logique métier
│   ├── RecordButton     Bouton micro (modes « clic » et « maintien »)
│   ├── NoteCard         Carte d'une note dans la liste
│   ├── NoteList         Liste groupée par période
│   ├── NoteDetail       Détail : lecture, édition, suppression
│   ├── AudioPlayer      Lecteur audio maison (progression, vitesse)
│   ├── SearchBar        Recherche instantanée
│   ├── SettingsPanel    Réglages, stockage, export
│   ├── Modal / ConfirmDialog / Toaster / EmptyState / Icons
│   └── ProcessingCard   Carte « transcription en cours »
│
├── layouts/             Les deux expériences, mêmes données
│   ├── MobileLayout     📱 une colonne, micro au pouce, détail plein écran
│   ├── DesktopLayout    💻 trois panneaux, clavier, filtres
│   └── layout-props     Contrat commun aux deux layouts
│
├── hooks/               Orchestration React
│   ├── use-notes            CRUD des notes + nettoyage au démarrage
│   ├── use-voice-recorder   Enregistrement + transcription en parallèle
│   ├── use-settings         Préférences
│   ├── use-device           Mobile / tablette / desktop
│   ├── use-keyboard-shortcuts
│   └── use-toasts
│
├── services/            Logique métier, sans React
│   ├── audio/           AudioRecorder : machine à états MediaRecorder
│   ├── speech-to-text/  Contrat SpeechToTextProvider + WebSpeechProvider + registre
│   └── storage/         Dépôt de notes (IndexedDB) + préférences (localStorage)
│
├── db/                  Abstraction IndexedDB (~150 lignes, sans dépendance)
├── types/               Modèles Note / AudioRecord / Settings
├── utils/               Formatage, recherche, identifiants, blobs
├── styles/              Tokens, base, composants, mobile, desktop
└── sw/                  Service worker + enregistrement
```

Trois règles structurent le code :

1. **La logique métier ne connaît pas le layout.** `MobileLayout` et `DesktopLayout` reçoivent
   exactement les mêmes props et appellent les mêmes services.
2. **Seul `services/storage` parle à IndexedDB.** Le jour où une synchronisation cloud arrive, c'est
   ce module qui change.
3. **L'enregistrement audio et la transcription sont deux systèmes séparés** (voir plus bas).

## Stockage des données

Deux object stores dans IndexedDB (`voice-notes`, version 1) :

| Store   | Clé      | Contenu                                                              |
| ------- | -------- | -------------------------------------------------------------------- |
| `notes` | `id`     | Métadonnées + transcription — légères, chargées au démarrage          |
| `audio` | `noteId` | Le son lui-même — lourd, lu à la demande, supprimé à l'expiration     |

Cette séparation est ce qui permet de **supprimer l'audio sans toucher à la note**, et d'afficher
une longue liste sans charger des mégaoctets en mémoire.

```ts
interface Note {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;                    // dérivé de la première phrase
  transcription: string;
  transcriptionStatus: 'pending' | 'completed' | 'error' | 'unavailable';
  transcriptionError?: string;
  hasAudio: boolean;
  audioMimeType?: string;
  audioDuration?: number;
  audioSize?: number;
  audioExpiresAt?: number | null;   // null = conservation illimitée
  audioDeletedAt?: number;
  edited?: boolean;
}
```

L'audio est stocké en `ArrayBuffer` plutôt qu'en `Blob` : toutes les implémentations d'IndexedDB le
gèrent (le stockage de `Blob` a longtemps été défaillant sur Safari), et le `Blob` est reconstruit
avec son type MIME au moment de la lecture.

Les **préférences** (mode d'enregistrement, durée de conservation, langue) sont de petites valeurs :
elles vont dans `localStorage`. Aucun fichier audio n'y est jamais écrit.

## Conservation des audios

Par défaut, un audio est conservé **7 jours** (réglable : 1 jour, 7 jours, 30 jours, toujours).

Au-delà :

- le son est supprimé d'IndexedDB ;
- la note et sa transcription restent, et s'affichent normalement ;
- le lecteur est remplacé par la mention « Audio expiré ».

Le nettoyage tourne **automatiquement au démarrage** de l'application, et peut être déclenché à la
main depuis *Paramètres → Stockage local → Nettoyer les audios expirés*. Changer la durée de
conservation recalcule l'échéance des notes déjà enregistrées.

## Speech-to-Text

L'enregistrement audio et la transcription sont **deux systèmes indépendants** qui tournent en
parallèle : `MediaRecorder` produit le fichier, le provider Speech-to-Text produit le texte. Si le
second échoue ou n'existe pas, on obtient une note avec son audio et sans transcription — jamais une
application cassée.

Tout passe par un contrat unique, jamais par `SpeechRecognition` directement :

```ts
interface SpeechToTextProvider {
  readonly id: string;
  readonly name: string;
  readonly mode: 'live' | 'batch';
  isSupported(): boolean;
  start(options: { lang: string }): Promise<void>;
  stop(): Promise<string>;
  abort(): void;
  onResult(listener): Unsubscribe;
  onError(listener): Unsubscribe;
  transcribe?(blob: Blob, options): Promise<string>;  // providers « batch »
}
```

La V1 fournit `WebSpeechProvider` (Web Speech API, mode `live`). Ajouter un moteur — Whisper local,
API cloud — revient à écrire une classe qui implémente ce contrat et à l'enregistrer :

```ts
// src/services/speech-to-text/registry.ts
registerProvider(new WhisperProvider());
```

La distinction `live` / `batch` porte une conséquence concrète : seul un provider `batch` peut
re-transcrire un audio déjà enregistré, puisqu'il travaille sur le fichier. C'est ce que teste
`canRetranscribe()`.

## Mobile vs desktop

Ce ne sont pas deux tailles du même écran, mais deux mises en scène des mêmes données.

|                  | 📱 Mobile (< 768 px)                          | 💻 Desktop (≥ 1100 px)                             |
| ---------------- | --------------------------------------------- | -------------------------------------------------- |
| Structure        | Une colonne, navigation par vues              | Trois panneaux simultanés                           |
| Micro            | Gros bouton rond (76 px) ancré en bas, au pouce | Bouton au pied de la liste + raccourci `R`         |
| Note ouverte     | Plein écran, avec retour                      | Panneau de détail permanent, la liste reste visible |
| Filtres          | Masqués (recherche seule)                     | Barre latérale dédiée                               |
| Carte de note    | Compacte : titre, extrait, durée              | Plus dense : extrait plus long + lecteur intégré    |
| Suppression      | Depuis le détail                              | Au survol de la carte, ou touche `Suppr`            |
| Messages système | En haut (le bas appartient au micro)          | En bas à droite                                     |

**Tablette (768–1099 px)** : état intermédiaire réel — deux colonnes (liste + détail), la barre
latérale se repliant en une rangée de filtres dans l'en-tête.

Les seuils ne sont pas arbitraires : 768 px est la largeur d'une tablette en portrait ; à partir de
1100 px, 240 px de barre latérale + 380 px de liste + ~480 px de détail tiennent sans serrer.

**Raccourcis clavier** (desktop) : `R` enregistrer / arrêter · `/` rechercher · `↑` `↓` naviguer ·
`Suppr` supprimer · `Échap` annuler ou fermer · `?` afficher l'aide.

## Compatibilité navigateur

| Navigateur           | Enregistrement | Transcription | PWA |
| -------------------- | :------------: | :-----------: | :-: |
| Chrome / Edge (bureau) | ✅ | ✅ | ✅ |
| Chrome Android       | ✅ | ✅ | ✅ |
| Safari iOS / macOS   | ✅ | ✅ (Safari 14.1+) | ✅ (ajout à l'écran d'accueil) |
| Firefox              | ✅ | ❌ (Web Speech API absente) | ✅ |

Quand la transcription n'est pas disponible, l'application le dit clairement et continue de
fonctionner : l'audio est enregistré, et le texte peut être saisi à la main.

L'ensemble exige un **contexte sécurisé (HTTPS)** — ce que GitHub Pages fournit.

## Confidentialité

- Les notes, les transcriptions et les audios restent dans **votre navigateur**. L'application
  n'envoie rien à un serveur : il n'y en a pas.
- Le microphone n'est activé **que pendant un enregistrement que vous lancez**, et le flux est
  libéré dès l'arrêt.
- Une réserve honnête : la Web Speech API est une fonction **du navigateur**, et certains navigateurs
  (Chrome notamment) traitent l'audio de reconnaissance sur leurs serveurs. Désactivez la
  transcription automatique dans les paramètres pour rester strictement hors ligne.

## Limitations connues

- **Firefox ne transcrit pas** : la Web Speech API n'y est pas implémentée.
- **Le microphone doit être partagé** entre l'enregistrement et le moteur de reconnaissance. C'est
  transparent sur Chrome et Edge pour ordinateur ; sur certains appareils (Safari iOS, Chrome
  Android selon les versions), le moteur n'obtient aucun son et la note ressort sans texte.
  L'application démarre donc la reconnaissance **avant** l'enregistrement, détecte le cas, et
  l'explique au lieu de prétendre que rien n'a été dit. En cas de doute :
  *Paramètres → Transcription → **Tester la transcription*** écoute deux fois (moteur seul, puis
  pendant un enregistrement) et indique précisément ce qui bloque.
- **La transcription est « en direct »** : le texte est produit pendant que vous parlez. Un audio
  déjà enregistré ne peut donc pas être re-transcrit tant qu'aucun provider `batch` (Whisper…) n'est
  branché — l'architecture le prévoit, la V1 ne le fournit pas.
- **Parler dans une langue différente du réglage** donne une transcription approximative : la langue
  se change dans les paramètres.
- Les données sont **liées au navigateur et à l'appareil** : pas de synchronisation (c'est l'objet
  des versions ultérieures). L'export JSON permet de récupérer les transcriptions.
- Un navigateur peut effacer le stockage d'un site resté longtemps inutilisé, ou en navigation
  privée. L'application détecte l'indisponibilité d'IndexedDB et prévient l'utilisateur.
- L'espace disque affiché est une **estimation** fournie par le navigateur.

## Tests

```bash
npm test
```

87 tests couvrent ce qui doit l'être : stockage IndexedDB (création, modification, suppression),
expiration et nettoyage des audios, recherche et accents, préférences, machine à états de
l'enregistrement, orchestration enregistrement + transcription, et la traduction des erreurs en
messages compréhensibles.

Les APIs navigateur sont traitées comme il faut : IndexedDB tourne pour de vrai via
`fake-indexeddb`, tandis que `MediaRecorder`, `getUserMedia` et `SpeechRecognition` sont remplacés
par des doublures qui permettent de simuler un refus de permission, un enregistrement trop court,
un microphone déjà occupé ou un moteur de reconnaissance qui ne reçoit aucun son.

`src/hooks/use-voice-recorder.test.ts` est le test d'intégration à connaître : magnétophone,
provider et hook réels, seules les deux APIs navigateur sont simulées. Il verrouille l'ordre
d'acquisition du microphone et garantit qu'un audio est toujours enregistré, même quand la
transcription échoue.

## Dépendances

Le projet en compte quatre en production… enfin, deux : `react` et `react-dom`.

| Choix | Justification |
| ----- | ------------- |
| **React + TypeScript + Vite** | Socle demandé, build rapide, types utiles sur un modèle de données partagé |
| **Pas de Dexie** | Deux object stores et quelques requêtes : `src/db/indexed-db.ts` fait le travail en ~150 lignes |
| **Pas de Tailwind** | Une vingtaine de composants et un système de tokens CSS suffisent |
| **Pas de `vite-plugin-pwa`** | Le service worker est écrit à la main ; un plugin de ~60 lignes dans `vite.config.ts` y injecte la liste des assets |
| **Pas de librairie d'icônes** | Quatorze icônes SVG inline, quelques centaines d'octets |
| **Pas de librairie de dates** | `Intl.DateTimeFormat` fait le travail en français |

Côté développement : `vitest`, `jsdom`, `fake-indexeddb` et `@testing-library/react` pour les
tests, `@types/node` pour la configuration de build.

---

Le cahier des charges d'origine est conservé dans
[`docs/CAHIER-DES-CHARGES.md`](docs/CAHIER-DES-CHARGES.md).
