# Monetum OTC Desk

## Project Overview
- **Name**: Monetum OTC Desk
- **Goal**: Simulation d'un widget de trading OTC pour les clients Monetum
- **Features**: Chat conversationnel avec agent IA, validation d'ownership de wallet, conversion crypto vers EUR

## URLs
- **Preview**: https://3000-itz17znedcdnw2osef06h-2e77fc33.sandbox.novita.ai
- **Production**: À déployer sur Cloudflare Pages

## Features Completed ✅
1. **Widget OTC Deal** - Interface chat moderne avec branding Monetum
2. **Process complet en 6 étapes**:
   - Vérification identité (nom, email, IBAN)
   - Sélection crypto et réseau
   - Validation ownership wallet (envoi 2.64 USDC)
   - Réception paiement complet
   - Confirmation conversion avec taux et frais (0.5%)
   - Confirmation finale et clôture
3. **Champs sécurisés dynamiques** - Inputs avec indicateurs de sécurité
4. **Agent IA poli et professionnel** - Réponses en anglais, suit le process
5. **Indicateurs de sécurité** - Badges "Secured", "256-bit", "EU Licensed", etc.

## OTC Process Flow
1. Client démarre le chat
2. Agent demande: Nom → Email → IBAN (un par un)
3. Vérification des informations
4. Sélection crypto (USDC, USDT, ETH, BTC, DAI) et réseau
5. Validation ownership: envoi 2.64 USDC sur adresse de validation
6. Paiement complet
7. Confirmation conversion avec tableau récapitulatif
8. Option Cancel (remboursement -1% frais) ou Confirm
9. Clôture ou nouveau deal

## Tech Stack
- **Framework**: Hono (TypeScript)
- **Deployment**: Cloudflare Pages
- **Styling**: TailwindCSS (CDN)
- **Icons**: FontAwesome
- **Font**: Inter (Google Fonts)

## Branding Monetum
- **Couleur primaire**: #6366f1 (Indigo)
- **Couleur secondaire**: #8b5cf6 (Violet)
- **Accent**: #22d3ee (Cyan)
- **Background**: #0a0f1e (Dark blue)
- **Style**: Glass morphism, gradients modernes

## User Guide
1. Cliquer sur "Start OTC Deal"
2. Suivre les instructions de l'agent
3. Remplir les champs demandés (nom, email, IBAN)
4. Sélectionner crypto et réseau
5. Effectuer la validation d'ownership (envoi 2.64 USDC)
6. Effectuer le paiement complet
7. Confirmer ou annuler la conversion
8. Done!

## Development
```bash
npm install
npm run build
npm run dev:sandbox  # Development avec wrangler
```

## Deployment
```bash
npm run deploy:prod  # Deploy to Cloudflare Pages
```

## Status
- **Platform**: Cloudflare Pages
- **Status**: ✅ Active (Preview)
- **Last Updated**: 2024-12-29
