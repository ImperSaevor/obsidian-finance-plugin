# Finance — Plugin Obsidian

Gérez vos finances personnelles directement dans Obsidian : comptes, transactions, catégories, budgets, récurrences, prévisions et graphiques.

## Fonctionnalités

- **Comptes** : courant, épargne, crédit, espèces, investissement
- **Transactions** : revenus, dépenses, transferts, calculs par liens, duplication
- **Catégories** : globales ou par compte, avec sous-catégories
- **Budgets mensuels** par catégorie avec suivi des dépassements
- **Transactions récurrentes** : génération automatique au chargement
- **Prévisions** : projection de solde sur 12 mois
- **Graphiques** : solde, revenus vs dépenses, répartition par catégorie
- **Filtres et tri** : recherche, dates, tags, groupement, pagination
- **Actions groupées** : suppression et recatégorisation en lot
- **Notes Obsidian** : lien bidirectionnel, notes auto par transaction
- **Import CSV** et **export/import JSON** pour sauvegarde et migration

## Installation

1. Copiez `main.js`, `manifest.json` et `styles.css` dans `.obsidian/plugins/obsidian-finance-plugin/`
2. Activez le plugin dans les paramètres Obsidian

### Développement

```bash
npm install
npm run dev          # watch + sync coffres dev
npm run build:dev    # compilation unique
npm test             # tests unitaires
npm run lint         # vérification ESLint
```

## Commandes

| Commande | Description |
|----------|-------------|
| Ouvrir la gestion des finances | Ouvre la vue principale |
| Dépense rapide | Saisie minimale d'une dépense |
| Rechercher une transaction | Palette floue sur toutes les transactions |
| Importer des transactions (CSV) | Import depuis relevé bancaire |
| Exporter / Importer JSON | Sauvegarde complète des données |
| Générer les transactions récurrentes | Force la génération des échéances |
| Synchroniser les notes de transaction | Met à jour les notes auto |

## Blocs Markdown

### Résumé d'un compte

````markdown
```finance
ID_DU_COMPTE
```
````

### Embed d'une transaction

````markdown
```finance-tx
ID_TRANSACTION
```
````

## Données

Les données sont stockées dans `Finance/finance-data.json` (configurable). En cas de corruption, une sauvegarde `finance-data.corrupt.*.json` est créée automatiquement.

## Import CSV

Colonnes reconnues (noms flexibles) :

- **date** — `2024-06-15` ou `15/06/2024`
- **description** / libellé
- **montant** — négatif = dépense
- optionnel : type, catégorie, tags

## Paramètres

- Dossier de données, devise, format de date
- Transactions par page
- Notes liées et notes auto par transaction
- Export/import JSON depuis l'onglet paramètres

## Licence

MIT
