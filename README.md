<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SnapMark Studio (PixelStamp) 📸

**SnapMark Studio** est une solution complète de marquage d'images (filigrane) conçue pour apposer des logos et des dates de manière dynamique et performante. L'application propose deux canaux d'utilisation complémentaires : une **interface web interactive** pour le traitement par lot côté client, et un **bot Telegram** pour un marquage rapide en déplacement.

Visualisez votre application dans AI Studio : https://ai.studio/apps/86d96f6f-e80f-4e2d-8384-f00c4a7e4181

---

## 🚀 Fonctionnalités Clés

### 💻 Application Web (Traitement par Lot)
- **Traitement local ultra-rapide** : Tout le rendu s'effectue directement dans le navigateur via l'API HTML5 Canvas, sans envoyer vos photos sur un serveur tiers.
- **Sélection de dossiers** : Importez un dossier complet contenant des dizaines d'images instantanément.
- **Marquage multi-logos** : Importez et configurez jusqu'à deux logos en parallèle pour créer un marquage en duo.
- **Personnalisation précise** :
  - Ajustement de l'emplacement (9 positions cardinales et centrales).
  - Contrôle fin de l'opacité et de la taille du logo (en %).
- **Horodatage intelligent** : Ajoutez la date de votre choix avec un effet d'ombrage pour une lisibilité maximale sur n'importe quel arrière-plan.
- **Export ZIP** : Téléchargez l'ensemble des images renommées et marquées dans une archive compressée en un clic.
- **Persistance locale** : Vos configurations et logos importés restent sauvegardés dans le navigateur via `localStorage`.

### 🤖 Bot Telegram (Traitement Mobile)
- **Traitement instantané** : Envoyez simplement une ou plusieurs photos pour recevoir instantanément leur version filigranée.
- **Gestion des logos à la volée** : Envoyez jusqu'à 2 fichiers images (PNG/JPG) au bot pour définir vos logos personnalisés en temps réel.
- **Moteur Sharp** : Utilise le module de traitement d'image haute performance `sharp` côté serveur.

---

## 🛠️ Stack Technique

- **Frontend** : React 19, TypeScript, Vite 6, Tailwind CSS v4, Framer Motion (animations), Lucide React (icônes).
- **Backend & Serveur** : Node.js, Express, Telegraf (Bot Telegram), Sharp (manipulation d'images serveur).
- **Utilitaires** : JSZip, FileSaver.

---

## ⚙️ Configuration & Installation

### Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure recommandée)
- Un token de bot Telegram (obtenu via [@BotFather](https://t.me/BotFather)) pour utiliser la fonctionnalité Bot.

### Étape 1 : Cloner et installer les dépendances
```bash
npm install
```

### Étape 2 : Configuration des variables d'environnement
Créez un fichier `.env` ou `.env.local` à la racine du projet en vous inspirant du fichier `.env.example` :

```env
# Token de votre Bot Telegram obtenu via @BotFather
TELEGRAM_BOT_TOKEN="votre_token_telegram_ici"

# URL de l'application (injectée automatiquement dans AI Studio)
APP_URL="http://localhost:3000"

# Clé API Gemini (Optionnel, requis si fonctionnalités d'IA activées)
GEMINI_API_KEY="votre_cle_api_gemini"
```

### Étape 3 : Lancer l'application
Pour démarrer l'application en mode développement (serveur Express + Vite middleware) :
```bash
npm run dev
```
Ouvrez votre navigateur à l'adresse [http://localhost:3000](http://localhost:3000).

---

## 📁 Structure du Projet

```text
├── src/
│   ├── App.tsx          # Logique principale de l'application web & Canvas
│   ├── main.tsx         # Point d'entrée React
│   ├── index.css        # Styles globaux & Thème Tailwind v4
│   ├── logo.png         # Logo par défaut utilisé pour le filigrane
│   └── favicon.svg      # Favicon et logo de secours
├── server.ts            # Serveur Express, intégration Vite et bot Telegram
├── index.html           # Document HTML principal
├── package.json         # Dépendances et scripts de build
└── tsconfig.json        # Configuration TypeScript
```

---

## 📝 Licence
Ce projet est sous licence Apache-2.0. Voir le fichier de code pour plus de détails.
