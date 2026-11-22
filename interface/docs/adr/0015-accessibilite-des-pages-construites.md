# ADR-0015 — Accessibilité des pages construites, vérifiée par Emmanuelle

- **Statut** : Accepted
- **Date** : 2026-11-22
- **Décideurs** : responsable d'ADA
- **Sujet** : contrôle RGAA des pages des projets, dans un vrai navigateur

## Contexte
Les modèles vérifiaient l'accessibilité par le lint et par axe-core dans les tests unitaires
(jsdom). Ces outils ne voient ni la page entière ni son affichage : une mesure faite le 2026-11-22
sur les modèles a trouvé dix gabarits sans lien d'évitement (RGAA 12.7), alors que leurs
`AGENTS.md` demandaient de le conserver, une page sans titre principal quand l'API ne répond pas,
un saut de niveau de titre, et un site de documentation qui défile à 320 px.

## Décision
- Chaque modèle avec écran a un contrôle **« Accessibilité RGAA (pages construites) »**, exigé
  avant fusion, fourni par [Emmanuelle](https://github.com/Carolinedanslesnuages/emmanuelle) et
  épinglé à un SHA (vérifié par `check.yml`). Il ouvre les pages dans Chromium : axe-core, lien
  d'évitement, focus visible, 320 px, zoom, espacement du texte, chaque constat rangé par critère.
- Pages vérifiées : le site construit, servi tel quel ; la page de démonstration pour le
  composant ; l'application lancée pour Django. Une application monopage n'est vérifiée que sur
  son accueil (le serveur d'Emmanuelle ne renvoie pas `index.html` pour ses autres adresses).
- Défauts corrigés dans les modèles. Défauts **connus**, inscrits dans `.emmanuelle-reference.json` :
  - fenêtre de l'extension et page de démonstration du composant (12.7) : une seule zone de
    contenu, sans navigation à éviter ;
  - lien d'évitement de VitePress, masqué tant qu'il n'a pas le focus, compté comme texte coupé (10.12) ;
  - administration de Django (`/admin/login/`, 9.1 et 12.7) : gabarits d'origine de Django.

## Conséquences
- **Positives** : un critère vérifié en vrai navigateur ne régresse plus sans bloquer la PR.
- **Négatives** : un job de plus par PR (installation de Chromium) ; tourne sur Ubuntu 24.04 tant
  que le Playwright d'Emmanuelle ne gère pas 26.04.
- **À surveiller** : les défauts connus, à faire disparaître (Emmanuelle signale ceux corrigés).
