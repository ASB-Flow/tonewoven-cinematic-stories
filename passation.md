# Passation

Dernière mise à jour : 30 octobre 2026. Échanges avec l'utilisateur en français, avec les accents.

---

## Objectif

Plateforme web (app Lovable : React, Vite, TypeScript, shadcn/ui, Supabase) qui produit des vidéos et des voix off.

Fonction principale ajoutée : la page **Short FR** (`/short-dubbing`). On colle un lien YouTube Short et on récupère un **MP4 doublé en français** :

1. Le serveur vocal local télécharge la vidéo (yt-dlp, H.264 de préférence).
2. Demucs sépare la voix de la musique et des bruitages.
3. faster-whisper transcrit la voix isolée, avec le titre de la vidéo comme contexte, puis découpe le texte en phrases horodatées.
4. La fonction Supabase `translate-text` traduit les lignes numérotées `[n]`, puis on les remet en face de leurs horaires.
5. La voix française est générée au choix :
   - **Voix d'origine** : clonage avec Chatterbox à partir d'environ 20 s de l'orateur. Une case de consentement est obligatoire.
   - **Ma voix** : une voix enregistrée dans le navigateur ou importée.
   - **Voix standard** : edge-tts, voix Microsoft en ligne. C'est rapide et sans modèle à télécharger.
6. Chaque phrase est calée sur son horaire (accélérée jusqu'à ×1,35 au maximum), puis mixée avec la musique d'origine.
7. Les sous-titres français sont incrustés, ajoutés en piste, ou désactivés. Le fichier `.srt` reste téléchargeable.

Le Dashboard sert aussi à gérer les projets : traduction enregistrée, audio réel, page de détail, statuts fiables.

---

## Problématique

- **Machine** : RTX 4070 Laptop (8 Go), mais **PyTorch CPU** est installé (torch 2.6.0+cpu), car CUDA est trop lourd à télécharger. La RAM libre est très faible et la connexion lente (35 à 94 Ko/s vers Hugging Face).
- **Chatterbox (clonage) n'est pas téléchargé.** Le téléchargement a été tué par manque de mémoire, après environ 256 Mo sur 3 Go. Les voix « d'origine » et « Ma voix » ne marchent donc pas encore. La voix standard (edge-tts) fonctionne.
- **Lenteur** :
  - Short de 46 s : environ 2 min pour séparer et transcrire.
  - Doublage en voix standard : 3 s, ou 10 s avec les sous-titres incrustés.
  - Clonage sur CPU : 10 à 20 min par minute de vidéo.
- **Transcription** : vérifiée sur https://www.youtube.com/shorts/4f0arzKisI0 (Myles Munroe). Il reste une erreur : « What about the part where it says we scatter? » est transcrit « Look at the part where it says, we gather. » D'où l'idée de l'étape de relecture.
- **Push GitHub refusé (403)** sur `ASB-Flow/tonewoven-cinematic-stories` :
  - Le compte enregistré sur le PC est `alberto1622`, avec un jeton OAuth `gho_` de Git Credential Manager qui a le droit `repo`.
  - Selon l'API GitHub, ce compte a `push: false`, n'est pas membre de l'organisation et n'a aucune invitation en attente.
  - Le dépôt est public.
  - Le problème est donc côté organisation : soit le rôle accordé n'est pas Write, soit l'invitation est partie vers un autre compte, soit l'org bloque l'application OAuth Git Credential Manager.
- **Licences** : openmontage et VoiceStudio sont sous AGPL-3.0 ; OmniVoice et NLLB sont non commerciaux (CC-BY-NC). Seules des idées en ont été reprises, pas de code. voicebox (MIT) peut être réutilisé.
- **Règles à respecter** :
  - Ne pas lire ni commiter `.env`.
  - `rm -rf` est interdit : utiliser trash.
  - Commiter ou pousser seulement à la demande ; sur `main`, créer une branche d'abord.
  - Ne pas relancer les téléchargements ou serveurs tués par manque de mémoire sans accord.
  - Cloner la voix d'une personne réelle exige son autorisation.

---

## Fichier important

Le serveur vocal tourne en local, sur `http://localhost:8765`, et se lance depuis le dossier `voice-server` (la commande est dans `voice-server/README.md`).

| Fichier | Rôle |
|---|---|
| `voice-server/server.py` | Serveur vocal FastAPI : routes `/health`, `/voices`, `/jobs`, `/jobs/youtube`, `/jobs/{id}/dub`, `/jobs/{id}/subtitles`, `/jobs/{id}/reference` |
| `voice-server/pyproject.toml`, `uv.lock` | Dépendances, gérées avec uv : torch CPU, chatterbox-tts, faster-whisper, demucs, yt-dlp, edge-tts, fastapi |
| `voice-server/README.md` | Installation, variables (`WHISPER_MODEL`, `DEMUCS_MODEL`, `VOICE_SERVER_ORIGINS`, `VOICE_SERVER_HOSTS`), section Sécurité. Node, Deno ou Bun est requis pour yt-dlp |
| `src/pages/ShortDubbing.tsx` | Page Short FR : lien YouTube, 3 modes de voix, sous-titres, musique conservée, téléchargement du MP4 et du .srt |
| `src/lib/voiceServer.ts` | Client du serveur vocal : `transcribeYouTube`, `dubVideo`, `getSubtitles`, `numberSegments`, `parseNumberedTranslation`, `STANDARD_VOICES` |
| `src/test/voiceServer.test.ts`, `src/test/audio.test.ts` | Tests vitest (9 au total, tous verts) |
| `src/pages/Dashboard.tsx`, `ProjectDetail.tsx`, `CreateProject.tsx`, `components/VoicePicker.tsx`, `lib/audio.ts` | Dashboard et projets |
| `supabase/functions/_shared/security.ts` + `translate-text`, `elevenlabs-tts`, `youtube-transcript` | Fonctions Supabase sécurisées |
| `supabase/migrations/20261025120000_secure_credits_and_storage.sql`, `20261025130000_project_outputs.sql` | Migrations des crédits, du stockage et des sorties de projet |

Sécurité du serveur vocal (commit `9211dc0`) :
- **Sites et hôtes** : refus (403) des sites absents de `VOICE_SERVER_ORIGINS` et des hôtes autres que localhost, ce qui bloque le DNS rebinding.
- **Accès réseau privé** : passe par l'option Starlette `allow_private_network`.
- **ffmpeg** : il ne lit que les fichiers locaux et les pipes (`-protocol_whitelist file,pipe`), et les fichiers envoyés doivent être des conteneurs média connus. Les playlists HLS et les listes concat sont refusées.

Git :
- Branche **`v1.0.0`** : commits `0a5540e` (doublage + Dashboard + sécurité Supabase) puis `9211dc0` (sécurité du serveur vocal).
- Branche `feature/short-dubbing` : contient seulement `0a5540e`.
- Hors commit : `.env` (secret) et `prompt.md` (pas à nous).

---

## Ce qui a raté

- **Téléchargement de Chatterbox** :
  - D'abord bloqué par hf-xet (fichier `.incomplete` figé).
  - Relancé avec `HF_HUB_DISABLE_XET=1`, puis tué par Claude Code faute de mémoire.
- **Push GitHub** : erreur 403 persistante malgré l'accès annoncé (voir Problématique).
- **Erreurs de transcription restantes** : « scatter » est compris comme « gather ». Whisper `small` sur CPU a ses limites ; `large-v3-turbo` serait meilleur mais pèse environ 1,6 Go.
- **yt-dlp** : les sous-titres YouTube renvoient une erreur 429 (Too Many Requests), donc ils ne servent pas de référence.
- **Problèmes rencontrés puis corrigés** :
  - Vidéo AV1 illisible : on force maintenant H.264.
  - Sous-titres verticaux trop gros : 20 caractères par ligne et taille de police 10.
  - Majuscules du titre recopiées par Whisper : corrigé par `whisper_context`.
  - Pré-vol CORS « Private-Network » rejeté en 400 : corrigé.
- **Anciens chantiers en attente** :
  - Edge functions et migrations non déployées sur Supabase (projet `axcljxcxnnjgyetwaslr`).
  - `package-lock.json` désynchronisé.
  - Projet Supabase de référence pas encore choisi.
  - Email admin codé en dur dans une migration.
- **Ancien projet `transcript-video`** : il ne marche plus, car il utilise l'API de moviepy 1.x alors que la version installée est la 2.2.1.

---

## Prochaine étape

1. **Débloquer le push** : avec le compte propriétaire d'ASB-Flow, vérifier le rôle Write de `alberto1622` (Settings → Collaborators), l'invitation acceptée et la politique OAuth (approuver Git Credential Manager). Puis lancer `git push -u origin v1.0.0` et ouvrir une PR vers `main`.
2. **Étape de relecture** (proposée, pas encore validée) : avant le doublage, afficher les phrases transcrites et traduites pour pouvoir les corriger. Cela rattrape les erreurs de Whisper et de traduction.
3. **Chatterbox** : relancer le téléchargement seulement à la demande, applications fermées et sur une bonne connexion (`HF_HUB_DISABLE_XET=1`). Puis tester les modes « Voix d'origine » et « Ma voix ».
4. **Optionnel, avec une bonne connexion** :
   - `WHISPER_MODEL=large-v3-turbo`, pour une transcription plus juste ;
   - torch CUDA (environ 2,4 Go), pour utiliser la RTX 4070 ;
   - reprendre des idées de voicebox : temperature 0.8, repetition_penalty 2.0, fondu entre les morceaux, Kokoro.
5. **Supabase** : déployer les fonctions (avec `_shared`) et appliquer les deux migrations.
6. **Test de bout en bout dans le navigateur** : lancer le serveur vocal et Vite sur le port 8080, doubler https://www.youtube.com/shorts/4f0arzKisI0 en voix standard avec sous-titres incrustés.
