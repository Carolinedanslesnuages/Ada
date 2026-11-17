import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import BlocMarque from './BlocMarque.vue'
import './style.css'

/** Thème de VitePress aux couleurs de l'État : police Marianne, bleu France, bloc-marque. */
const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'nav-bar-title-before': () => h(BlocMarque) }),
}

export default theme
