import { creerApp } from './app.ts';
import { ouvrirBase } from './base.ts';

const base = ouvrirBase(process.env.FICHIER_BASE ?? 'donnees/app.db');
const port = Number(process.env.PORT ?? 3000);

creerApp(base).listen(port, () => {
  console.log(`API prête sur http://localhost:${port}/api`);
});
