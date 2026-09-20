import crypto from "crypto";

/**
 * Longitud de la contraseña temporal que genera el sistema.
 *
 * Es larga porque nadie tiene que recordarla: el trabajador la recibe, entra
 * una vez y la cambia. El coste de que sea incómoda es cero.
 */
export const LARGO_CLAVE_GENERADA = 16;

/**
 * Mínimo de la contraseña que el usuario elige para sí mismo.
 *
 * Vive aquí, y no suelto en un esquema, porque lo usan dos sitios que deben
 * coincidir: la validación Zod del endpoint y (si algún día se añade) la del
 * propio modelo. Antes estaba solo en el script de CLI que se retiró; al
 * quitarlo había que reinstalarla en algún sitio o la política se perdía.
 */
export const LARGO_MINIMO_PASSWORD = 12;

/**
 * Contraseña aleatoria legible: sin caracteres ambiguos (O/0, l/1/I) para que
 * se pueda dictar por teléfono o copiar de un papel sin equivocarse.
 *
 * Usa `crypto.randomBytes`, no `Math.random`: esta cadena es una credencial
 * temporal con acceso al panel, y `Math.random` no es criptográficamente
 * seguro. El módulo del alfabeto (64, potencia de dos) no introduce sesgo.
 */
export const generarClaveTemporal = (): string => {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(LARGO_CLAVE_GENERADA);
  return Array.from(bytes, (byte) => alfabeto[byte % alfabeto.length]).join("");
};
