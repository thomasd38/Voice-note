Projet : Voice Notes — Application Web de notes vocales

Tu es un développeur web senior. Tu dois concevoir et développer l'application complète de A à Z.

1. Objectif

Créer une application web très simple permettant de créer rapidement des notes vocales.

L'utilisateur arrive sur le site, voit ses notes existantes et peut appuyer sur un bouton microphone pour créer une nouvelle note.

Le fonctionnement principal est :

1. L'utilisateur appuie sur le bouton 🎙️.
2. L'enregistrement audio démarre.
3. Le bouton indique clairement que l'enregistrement est en cours.
4. L'utilisateur parle.
5. L'utilisateur appuie à nouveau sur le bouton.
6. L'enregistrement s'arrête.
7. L'audio est transcrit automatiquement en texte grâce à un système Speech-to-Text.
8. Une nouvelle note est créée automatiquement.
9. La note contient la transcription et l'audio tant que celui-ci n'a pas dépassé sa durée de conservation.
10. L'utilisateur peut relire l'audio depuis la note.

IMPORTANT :

- Ce n'est PAS un système "maintenir le bouton pour enregistrer".
- Le comportement par défaut est :
  1 clic = démarrer
  1 clic = arrêter
- Prévoir néanmoins dans les paramètres une possibilité de choisir le mode "appui long" ultérieurement.

---

2. Contraintes techniques majeures

L'application doit être :

- 100 % web
- responsive mobile + desktop
- compatible avec GitHub Pages
- déployable comme site statique
- sans backend obligatoire
- sans serveur nécessaire pour la V1
- sans base de données distante nécessaire
- utilisable directement depuis un navigateur
- installable comme PWA

Les données locales doivent être stockées dans IndexedDB.

NE PAS utiliser localStorage pour stocker les fichiers audio.

localStorage peut éventuellement être utilisé uniquement pour de petites préférences utilisateur.

---

3. Stack technique

Choisis une stack moderne mais simple.

Stack recommandée :

- TypeScript
- React + Vite
- CSS moderne ou Tailwind si cela simplifie réellement le projet
- IndexedDB via une petite abstraction propre, par exemple Dexie
- MediaRecorder API pour l'enregistrement
- Web Speech API pour le Speech-to-Text si elle est disponible
- architecture permettant de remplacer facilement le STT par une autre solution plus tard
- Service Worker / PWA

Le projet doit rester simple.

Ne pas ajouter de backend inutile.

Ne pas ajouter Firebase, Supabase, AWS ou autre service cloud dans la V1.

---

4. Stockage des données

Utiliser IndexedDB comme stockage principal.

Créer au minimum deux types de données.

Note

Une note doit contenir par exemple :

- id
- createdAt
- updatedAt
- transcription
- audioBlob
- audioMimeType
- audioDuration
- audioExpiresAt
- title éventuellement
- status de transcription

Exemple conceptuel :

interface Note {
  id: string;
  createdAt: number;
  updatedAt: number;
  transcription: string;
  audioBlob?: Blob;
  audioMimeType?: string;
  audioDuration?: number;
  audioExpiresAt?: number;
  transcriptionStatus: "pending" | "completed" | "error";
}

Adapter la structure si nécessaire.

---

5. Conservation des audios

Par défaut :

Les fichiers audio sont conservés pendant 7 jours.

Après 7 jours :

- supprimer automatiquement le Blob audio d'IndexedDB
- conserver la note
- conserver la transcription
- afficher la note normalement
- ne plus afficher le lecteur audio si l'audio n'existe plus

Exemple :

📝 Acheter des balles de padel

"Il faut que je pense à acheter des balles
avant samedi."

Audio disponible
▶ ━━━━━━━━━ 00:32

Après expiration :

📝 Acheter des balles de padel

"Il faut que je pense à acheter des balles
avant samedi."

Audio expiré

Le nettoyage des anciens audios doit être effectué automatiquement au démarrage de l'application.

Prévoir également une fonction de nettoyage manuelle dans les paramètres.

---

6. Enregistrement audio

Utiliser la "MediaRecorder API".

Le bouton principal doit fonctionner ainsi :

État initial

🎙️
Nouvelle note

Après premier clic

L'enregistrement démarre.

Le bouton devient clairement identifiable comme étant actif :

🔴
Enregistrement...
00:17

Afficher :

- durée actuelle
- état d'enregistrement
- possibilité d'arrêter

Après deuxième clic

Arrêter immédiatement l'enregistrement.

Puis lancer automatiquement la transcription.

---

7. Speech-to-Text

Le Speech-to-Text est une fonctionnalité centrale.

Pour la V1, utiliser la solution native du navigateur lorsque disponible, par exemple "Web Speech API".

Créer une abstraction :

interface SpeechToTextProvider {
  isSupported(): boolean;
  start(): void;
  stop(): void;
  onResult(...): void;
  onError(...): void;
}

Ne jamais coupler toute l'application directement à "SpeechRecognition".

L'objectif est de pouvoir remplacer facilement le provider plus tard.

Prévoir notamment :

WebSpeechProvider

et une architecture permettant éventuellement d'ajouter :

WhisperProvider
CloudSpeechProvider

plus tard.

IMPORTANT :

L'enregistrement audio et le Speech-to-Text doivent être traités comme deux systèmes indépendants.

Le fichier audio doit être enregistré avec "MediaRecorder", tandis que le Speech-to-Text doit fonctionner via son propre provider.

---

8. Gestion des navigateurs incompatibles

L'application doit détecter si le Speech-to-Text est disponible.

Si le navigateur ne supporte pas la fonctionnalité :

Afficher un message clair :

«La transcription automatique n'est pas disponible dans ce navigateur.»

Mais l'enregistrement audio doit quand même pouvoir fonctionner si "MediaRecorder" est disponible.

Dans ce cas :

🎙️ Audio enregistré

La transcription automatique n'est pas disponible.

Ne jamais faire planter l'application.

---

9. Permissions microphone

Lors du premier enregistrement :

- demander la permission microphone via le navigateur
- gérer proprement le refus
- afficher un message explicatif
- permettre à l'utilisateur de réessayer

Exemple :

«L'accès au microphone est nécessaire pour enregistrer une note vocale.»

L'application doit fonctionner uniquement dans un contexte sécurisé HTTPS.

GitHub Pages fournit HTTPS.

---

10. Création de note

Après l'arrêt de l'enregistrement :

1. sauvegarder immédiatement l'audio dans IndexedDB
2. créer la note
3. lancer/terminer la transcription
4. mettre à jour la note avec la transcription
5. afficher automatiquement la nouvelle note en haut de la liste

Pendant la transcription :

📝 Nouvelle note

Transcription en cours...

Puis :

📝 Nouvelle note

"Voici ma nouvelle note vocale."

Si la transcription échoue :

- conserver l'audio
- créer quand même la note
- afficher une erreur compréhensible
- permettre à l'utilisateur de réessayer la transcription ultérieurement si l'architecture du provider le permet

---

11. Interface utilisateur

L'interface doit être extrêmement simple.

Priorité absolue :

ouvrir → voir ses notes → appuyer sur le micro → parler → rappuyer → terminé.

Ne pas surcharger l'écran.

IMPORTANT :

L'application doit proposer deux expériences visuelles distinctes, conçues spécifiquement pour les deux types d'appareils :

- 📱 Design Mobile
- 💻 Design Desktop

Il ne faut PAS simplement prendre le design mobile et l'agrandir sur desktop.

Le responsive doit adapter l'interface en profondeur afin d'exploiter au mieux les caractéristiques de chaque appareil.

---

💻 Design Desktop

Profiter de la largeur et de la hauteur disponibles.

Le desktop peut notamment utiliser :

- une sidebar
- plusieurs colonnes
- une zone de recherche plus large
- une liste de notes plus dense
- une zone de détail pour afficher la note sélectionnée
- davantage d'informations visibles simultanément
- des raccourcis clavier
- des contrôles plus nombreux lorsque cela améliore l'expérience
- une organisation optimisée pour la souris et le clavier

Exemple possible :

┌──────────────────────────────────────────────────────────────────┐
│ 🎙️ Voice Notes                                      ⚙️ Settings │
├───────────────┬──────────────────────────────┬───────────────────┤
│               │ 🔎 Rechercher...             │                   │
│ Toutes        │                              │  📝 Note          │
│ Aujourd'hui   │ Aujourd'hui                  │                   │
│ Cette semaine │                              │  Idée pour le jeu │
│               │ ┌──────────────────────────┐ │                   │
│               │ │ 📝 Idée pour mon jeu     │ │  "Ajouter un      │
│               │ │                          │ │   système de      │
│               │ │ Ajouter un système...    │ │   fusion..."      │
│               │ │ ▶ 00:32                 │ │                   │
│               │ └──────────────────────────┘ │  ▶ ━━━━━ 00:32   │
│               │                              │                   │
│               │ ┌──────────────────────────┐ │                   │
│               │ │ 📝 Courses               │ │                   │
│               │ │                          │ │                   │
│               │ │ Acheter du lait...       │ │                   │
│               │ └──────────────────────────┘ │                   │
│               │                              │                   │
│               │              🎙️              │                   │
│               │         Nouvelle note        │                   │
└───────────────┴──────────────────────────────┴───────────────────┘

Cet exemple est indicatif.

Tu peux proposer une meilleure organisation si elle améliore réellement l'expérience desktop.

Le desktop doit exploiter activement :

- la grande largeur d'écran
- la grande hauteur d'écran
- la souris
- le clavier
- les raccourcis clavier
- les panneaux latéraux
- les espaces disponibles
- l'affichage simultané de plusieurs informations

---

12. Design Mobile

Le mobile doit avoir son propre design, pensé spécifiquement pour un écran tactile de petite taille.

NE PAS simplement réduire ou empiler le design desktop.

Priorités :

- utilisation à une main
- bouton microphone facilement accessible avec le pouce
- gros bouton circulaire
- navigation tactile
- cartes de notes compactes
- texte lisible
- informations essentielles visibles immédiatement
- interface sans éléments inutiles
- interactions adaptées au tactile

Le bouton microphone doit être suffisamment grand pour éviter les erreurs de clic.

L'interface mobile doit privilégier :

Liste des notes
      ↓
Note sélectionnée
      ↓
Microphone

avec une navigation simple entre les différentes vues.

Exemple indicatif :

┌─────────────────────────┐
│ 🎙️ Voice Notes      ⚙️ │
├─────────────────────────┤
│ 🔎 Rechercher...        │
│                         │
│ Aujourd'hui             │
│                         │
│ ┌─────────────────────┐ │
│ │ 📝 Idée pour le jeu │ │
│ │                     │ │
│ │ Ajouter un système  │ │
│ │ de fusion...        │ │
│ │                     │ │
│ │ ▶ 00:32             │ │
│ └─────────────────────┘ │
│                         │
│ ┌─────────────────────┐ │
│ │ 📝 Courses          │ │
│ │                     │ │
│ │ Acheter du lait...  │ │
│ │                     │ │
│ │ ▶ 00:18             │ │
│ └─────────────────────┘ │
│                         │
│                         │
│          🎙️             │
│     Nouvelle note       │
└─────────────────────────┘

Cet exemple est indicatif.

---

13. Liste des notes

Afficher les notes :

- plus récentes en premier
- regroupées éventuellement par :
  - Aujourd'hui
  - Hier
  - Cette semaine
  - Plus ancien

Chaque note affiche :

- date/heure
- transcription
- lecteur audio si disponible
- durée audio
- éventuellement titre généré automatiquement à partir de la première phrase

Exemple :

📝 Idée pour mon application

"Ajouter une fonction pour rechercher
dans toutes les notes..."

▶ 00:27
Aujourd'hui · 12:41

Sur desktop, exploiter l'espace disponible pour afficher davantage d'informations simultanément.

Sur mobile, privilégier les informations essentielles.

---

14. Recherche

Ajouter une barre de recherche.

La recherche doit fonctionner dans les transcriptions.

Exemple :

🔎 rechercher...

Si l'utilisateur tape :

padel

Afficher uniquement les notes contenant "padel".

La recherche doit être :

- instantanée
- insensible à la casse
- idéalement tolérante aux accents français

Exemple :

"école" doit pouvoir être retrouvé facilement.

---

15. Lecture audio

Chaque note ayant encore son audio doit proposer un lecteur audio.

Ne pas obligatoirement utiliser le lecteur HTML natif si son apparence est trop mauvaise.

Créer si nécessaire un lecteur custom minimal :

▶ ━━━━━━━━━━━━━ 00:12 / 00:32

Fonctions :

- lecture
- pause
- progression
- durée
- éventuellement vitesse 1x / 1.5x / 2x

Mais rester simple.

Le lecteur doit être adapté au mobile et au desktop.

---

16. Suppression

Chaque note doit pouvoir être supprimée.

Demander une confirmation avant suppression.

La suppression doit supprimer :

- la note
- l'audio associé

de IndexedDB.

---

17. Modification de transcription

L'utilisateur doit pouvoir modifier manuellement la transcription.

Exemple :

"Il faut acheter des balle de padel."

[Modifier]

↓

"Il faut acheter des balles de padel."

La version corrigée doit être sauvegardée dans IndexedDB.

---

18. Paramètres

Créer une page/panneau Settings.

Prévoir :

Enregistrement

Mode :

- Appuyer pour démarrer / appuyer pour arrêter — PAR DÉFAUT
- Maintenir pour enregistrer

Audio

Conservation :

- 7 jours — PAR DÉFAUT

Prévoir éventuellement :

- 1 jour
- 7 jours
- 30 jours
- Toujours

Mais la valeur par défaut doit rester 7 jours.

Transcription

- Transcription automatique : ON par défaut
- langue : Français par défaut

La langue doit pouvoir être changée plus tard.

---

19. Gestion du stockage

Ajouter dans les paramètres une section :

Stockage local

Notes : 127
Audios : 23
Espace audio estimé : 18,4 Mo

[ Nettoyer les audios expirés ]

Ne pas prétendre connaître précisément l'espace disque si le navigateur ne fournit pas cette information.

Si nécessaire, afficher :

«Estimation de l'espace utilisé.»

---

20. Export / sauvegarde

Même si ce n'est pas le cœur de la V1, prévoir une architecture permettant un export futur.

Idéalement ajouter :

Exporter mes notes

avec export JSON des métadonnées/transcriptions.

Si l'audio est encore disponible, prévoir la possibilité future d'inclure les fichiers audio.

Ne pas complexifier inutilement la V1.

---

21. PWA

Transformer l'application en Progressive Web App.

Prévoir :

- manifest
- icône
- nom de l'application
- mode standalone
- service worker
- cache des fichiers statiques

Objectif :

Sur Android :

Ajouter à l'écran d'accueil

et obtenir une expérience proche d'une petite application native.

---

22. GitHub Pages

Le projet doit être directement déployable sur GitHub Pages.

Créer une configuration GitHub Actions permettant :

git push
   ↓
GitHub Actions
   ↓
npm install
   ↓
npm run build
   ↓
déploiement GitHub Pages

Configurer correctement :

- Vite base path
- routing si nécessaire
- assets
- PWA
- GitHub Pages

Éviter les problèmes classiques de chemins "/".

L'application doit fonctionner même lorsqu'elle est servie depuis :

https://username.github.io/repository-name/

et pas uniquement depuis "/".

---

23. Pas de backend

IMPORTANT :

La V1 ne doit avoir :

- aucun serveur
- aucune API propriétaire obligatoire
- aucune base de données distante
- aucune authentification obligatoire

Toutes les données utilisateur restent dans le navigateur.

L'utilisateur doit pouvoir utiliser l'application immédiatement.

---

24. Architecture du code

Le code doit être propre et maintenable.

Séparer au minimum :

src/
├── components/
│   ├── VoiceRecorder
│   ├── RecordButton
│   ├── NoteCard
│   ├── AudioPlayer
│   ├── SearchBar
│   └── Settings
│
├── services/
│   ├── audio/
│   ├── speech-to-text/
│   └── storage/
│
├── db/
│   └── indexed-db
│
├── hooks/
│
├── types/
│
├── utils/
│
└── pages/

Adapter cette structure si une autre organisation est meilleure.

La logique métier ne doit pas dépendre du layout mobile ou desktop.

Les deux designs doivent utiliser les mêmes services et les mêmes données.

---

25. Gestion des erreurs

Toutes les erreurs doivent être gérées proprement.

Cas à gérer :

- microphone refusé
- microphone indisponible
- MediaRecorder non supporté
- Speech Recognition non supporté
- erreur Speech-to-Text
- transcription vide
- utilisateur arrêtant rapidement l'enregistrement
- IndexedDB indisponible
- quota IndexedDB dépassé
- audio corrompu
- erreur de lecture audio

L'application ne doit jamais afficher une erreur technique incompréhensible à l'utilisateur.

---

26. Design général

Le design doit être :

- moderne
- minimaliste
- propre
- rapide
- accessible
- peu de couleurs
- peu de boutons
- priorité au microphone

IMPORTANT :

Créer une véritable expérience :

📱 Mobile

et une véritable expérience :

💻 Desktop

Le desktop ne doit pas être considéré comme une simple version agrandie du mobile.

Le mobile ne doit pas être considéré comme une simple version réduite du desktop.

Les deux expériences doivent être pensées séparément en fonction du contexte d'utilisation.

Desktop

Exploiter :

- grande largeur
- grande hauteur
- souris
- clavier
- raccourcis clavier
- panneaux
- colonnes
- affichage simultané de plusieurs informations

Mobile

Exploiter :

- tactile
- interactions au doigt
- utilisation à une main
- petite surface disponible
- navigation adaptée au téléphone
- bouton microphone facilement accessible

Les deux expériences doivent néanmoins partager :

- la même logique métier
- les mêmes données
- les mêmes fonctionnalités
- le même système IndexedDB
- le même système Speech-to-Text
- le même système d'enregistrement

Utiliser une architecture permettant d'avoir des composants ou layouts différents lorsque cela améliore réellement l'expérience.

Ne pas créer deux applications différentes : il s'agit d'une seule application avec deux expériences utilisateur adaptées au contexte d'utilisation.

Prévoir un breakpoint pertinent pour basculer entre les expériences Mobile et Desktop, mais ne pas choisir ce breakpoint arbitrairement.

Tester le rendu sur différentes tailles d'écran.

Prévoir également un comportement intermédiaire pour les tablettes et écrans de taille moyenne.

---

États visuels

Prévoir un état visuel très clair :

Idle

🎙️

Recording

🔴

Processing

⏳

Done

📝

Le bouton microphone doit rester l'élément d'action principal sur les deux plateformes, mais son placement et sa présentation peuvent être différents entre mobile et desktop.

---

27. Accessibilité

Respecter les bonnes pratiques :

- boutons accessibles
- labels
- navigation clavier
- contraste suffisant
- focus visible
- textes alternatifs
- ARIA lorsque nécessaire
- ne pas dépendre uniquement de la couleur pour indiquer un état

---

28. Confidentialité

Afficher clairement dans l'interface que :

«Vos notes sont stockées localement dans ce navigateur.»

Ne jamais envoyer les données ailleurs dans la V1.

Le microphone ne doit être utilisé que lorsque l'utilisateur lance explicitement un enregistrement.

---

29. Important concernant le Speech-to-Text

Le système doit distinguer :

Audio recording

et :

Speech-to-Text

L'audio doit être enregistré avec "MediaRecorder".

Le Speech-to-Text doit être géré indépendamment.

Cela permettra plus tard de remplacer Web Speech API par Whisper ou un autre moteur sans réécrire toute l'application.

---

30. Expérience utilisateur complète

Voici le scénario principal à implémenter parfaitement :

Étape 1

L'utilisateur ouvre le site.

Il voit :

Aucune note

Appuyez sur le microphone pour créer votre première note.

Étape 2

Il appuie sur :

🎙️

Étape 3

Le microphone démarre.

🔴
00:03
Enregistrement...

Étape 4

L'utilisateur parle :

«"Penser à acheter une nouvelle raquette de padel."»

Étape 5

Il appuie à nouveau.

L'enregistrement s'arrête.

Étape 6

Afficher :

📝 Transcription...

"Penser à acheter une nouvelle raquette de padel."

Étape 7

La note apparaît en haut :

📝 Penser à acheter une nouvelle raquette de padel

"Penser à acheter une nouvelle raquette de padel."

▶ 00:05

Aujourd'hui · 12:45

Étape 8

Pendant 7 jours, l'audio peut être réécouté.

Après 7 jours :

📝 Penser à acheter une nouvelle raquette de padel

"Penser à acheter une nouvelle raquette de padel."

Audio expiré

La transcription reste disponible.

---

31. Qualité du projet

Tu dois produire une application réellement fonctionnelle, pas une simple maquette.

Avant de considérer le projet terminé :

- lancer le projet localement
- vérifier l'enregistrement microphone
- vérifier IndexedDB
- vérifier la transcription
- vérifier la création automatique des notes
- vérifier la recherche
- vérifier la lecture audio
- vérifier la suppression
- vérifier l'expiration des audios
- vérifier les paramètres
- vérifier le design mobile
- vérifier le design desktop
- vérifier les tailles intermédiaires/tablettes
- vérifier le build production
- vérifier le déploiement GitHub Pages
- vérifier la PWA
- vérifier le fonctionnement sur plusieurs navigateurs lorsque possible

Corriger les erreurs rencontrées.

---

32. Tests

Ajouter des tests pertinents pour :

- stockage IndexedDB
- création/suppression de note
- recherche
- expiration des audios
- paramètres
- logique d'enregistrement
- gestion des erreurs

Les APIs navigateur comme microphone et Speech Recognition peuvent être mockées dans les tests.

---

33. README

Créer un README complet expliquant :

- ce qu'est l'application
- installation
- développement local
- build
- déploiement GitHub Pages
- fonctionnement du stockage
- fonctionnement du Speech-to-Text
- compatibilité navigateur
- limitations connues
- fonctionnement de la conservation audio
- architecture du projet
- différence entre l'expérience mobile et desktop

---

34. Règle importante concernant les dépendances

N'ajoute pas une dépendance simplement parce qu'elle existe.

Privilégier les APIs natives du navigateur lorsque cela suffit.

Chaque dépendance doit avoir une justification.

L'application doit rester légère et rapide.

---

35. Règle importante concernant le futur

Même si la V1 est 100 % locale, le code doit être suffisamment bien structuré pour permettre plus tard :

V1
Local only
     ↓
V2
Compte utilisateur
     ↓
V3
Synchronisation cloud
     ↓
V4
Whisper / IA
     ↓
V5
Résumé automatique
Tags automatiques
Recherche sémantique

Mais NE PAS implémenter ces fonctionnalités maintenant.

Concentre-toi sur une V1 parfaitement fonctionnelle.

---

36. Critère final

À la fin, je dois pouvoir :

1. ouvrir l'application sur GitHub Pages
2. appuyer sur le microphone
3. parler
4. rappuyer sur le microphone
5. obtenir automatiquement la transcription
6. voir la note dans ma liste
7. réécouter l'audio
8. rechercher la note
9. modifier la transcription
10. supprimer la note
11. retrouver mes notes en revenant sur le site
12. conserver l'audio pendant 7 jours
13. avoir automatiquement la transcription conservée après expiration de l'audio
14. utiliser exactement la même application sur téléphone et ordinateur
15. bénéficier d'une interface spécifiquement conçue pour le téléphone
16. bénéficier d'une interface spécifiquement conçue pour le PC

Le résultat doit être simple, rapide et agréable à utiliser.

Commence par analyser le projet, puis crée toute l'architecture et implémente l'application complète.

Ne t'arrête pas à une proposition d'architecture : développe réellement l'application.

Une fois l'application développée, teste-la, corrige les problèmes et vérifie que le build de production fonctionne correctement pour GitHub Pages.# Voice-note
