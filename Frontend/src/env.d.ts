/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /**
     * Categorías del catálogo cacheadas por request (ya con el respaldo local
     * aplicado). La escribe el primer componente que las necesita —la home o
     * el panel de categorías— y la reutilizan el resto durante el mismo
     * render.
     */
    categorias?: import("./lib/categorias").CategoriaVista[];
  }
}
