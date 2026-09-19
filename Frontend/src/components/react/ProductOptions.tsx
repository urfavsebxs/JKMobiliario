import { useState, useEffect, useCallback } from "react";
import { useStore } from "@nanostores/react";
import type { Product, ProductVariant } from "../../lib/types";
import { colorMueble, setColorMueble } from "../../lib/colorMueble";
import { fijarMedidas, medidasMueble } from "../../lib/medidasMueble";
import { proxyImageUrl } from "../../lib/images";
import { descuentoAplicable, formatPrice, precioConDescuento, precioTexto } from "../../lib/precio";

interface ProductOptionsProps {
  product: Product;
}

/**
 * Una variante coincide por tamaño. El color solo filtra cuando ambos lados
 * lo definen: variantes sin color (precio por tamaño) o productos sin colores
 * seleccionados coinciden igualmente.
 */
function coincideVariante(
  variant: ProductVariant,
  selectedSize: string,
  selectedColor: string,
): boolean {
  return (
    variant.size === selectedSize &&
    (!variant.color || !selectedColor || variant.color === selectedColor)
  );
}

export default function ProductOptions({ product }: ProductOptionsProps) {
  const [selectedSize, setSelectedSize] = useState<string>(
    product.sizes[0] || ""
  );
  const [selectedColor, setSelectedColor] = useState<string>(
    product.colors[0]?.name || ""
  );
  const [currentStock, setCurrentStock] = useState<number>(product.stock);
  const [customWidth, setCustomWidth] = useState<string>("");
  const [customDepth, setCustomDepth] = useState<string>("");
  const [customHeight, setCustomHeight] = useState<string>("");
  const [additionalNotes, setAdditionalNotes] = useState<string>("");
  // Sin tallas predefinidas el cliente siempre parte de sus propias medidas.
  const [isCustomSize, setIsCustomSize] = useState<boolean>(
    product.sizes.length === 0
  );

  // Color de acabado y medidas compartidos con el visor 3D.
  const colorElegido = useStore(colorMueble);
  const medidas = useStore(medidasMueble);

  const hasVariants = product.variants && product.variants.length > 0;

  useEffect(() => {
    if (!hasVariants || !selectedSize) return;
    const variant = product.variants.find((v) =>
      coincideVariante(v, selectedSize, selectedColor)
    );
    if (variant) {
      setCurrentStock(variant.stock);
    }
  }, [selectedSize, selectedColor, product.variants, hasVariants]);

  // Si el color elegido en el visor 3D coincide con uno del catálogo,
  // sincronizamos el selector para no perder variante ni stock.
  useEffect(() => {
    if (!colorElegido) return;
    const coincide = product.colors.find(
      (color) => color.hex.toLowerCase() === colorElegido.hex.toLowerCase()
    );
    if (coincide) setSelectedColor(coincide.name);
  }, [colorElegido, product.colors]);

  // Publica en el store las medidas personalizadas que escribe el cliente,
  // para que el visor 3D las refleje en vivo.
  useEffect(() => {
    if (!isCustomSize) {
      fijarMedidas(null);
      return;
    }
    fijarMedidas({
      ancho: Number(customWidth),
      alto: Number(customHeight),
      profundo: Number(customDepth),
    });
  }, [isCustomSize, customWidth, customHeight, customDepth]);

  // Recoge los cambios hechos desde el visor 3D (mismo store compartido).
  // Comparamos numéricamente para no pisar el texto mientras se escribe.
  useEffect(() => {
    setCustomWidth((valor) =>
      Number(valor || 0) === (medidas?.ancho ?? 0) ? valor : (medidas?.ancho?.toString() ?? "")
    );
    setCustomDepth((valor) =>
      Number(valor || 0) === (medidas?.profundo ?? 0) ? valor : (medidas?.profundo?.toString() ?? "")
    );
    setCustomHeight((valor) =>
      Number(valor || 0) === (medidas?.alto ?? 0) ? valor : (medidas?.alto?.toString() ?? "")
    );
    if (medidas) setIsCustomSize(true);
  }, [medidas]);

  const currentVariant = hasVariants
    ? product.variants.find((v) =>
        coincideVariante(v, selectedSize, selectedColor)
      )
    : undefined;

  const displayPrice = currentVariant?.price || product.price;

  const descuento = descuentoAplicable(product.discountPercent);
  const aplicaDescuento = descuento > 0 && displayPrice > 0;
  const precioFinal = aplicaDescuento
    ? precioConDescuento(displayPrice, product.discountPercent)
    : displayPrice;

  // La variante más barata que el precio base ya se compara tachando el precio
  // de catálogo. Con descuento activo, el tachado pasa a ser el precio efectivo
  // antes del porcentaje, para que el badge -X % sea consistente con las cifras.
  const varianteMasBarata = Boolean(
    currentVariant?.price && currentVariant.price < product.price
  );
  const precioOriginal = aplicaDescuento
    ? displayPrice
    : varianteMasBarata
      ? product.price
      : null;

  // ─── Datos para el carrito (los lee el widget desde `data-*`) ─────
  const colorCarrito = colorElegido?.nombre ?? selectedColor;
  const colorHexCarrito =
    colorElegido?.hex ??
    product.colors.find((color) => color.name === selectedColor)?.hex ??
    "";

  const partesMedida: string[] = [];
  if (customWidth.trim()) partesMedida.push(`Ancho ${customWidth.trim()} cm`);
  if (customDepth.trim()) partesMedida.push(`Largo ${customDepth.trim()} cm`);
  if (customHeight.trim()) partesMedida.push(`Alto ${customHeight.trim()} cm`);
  const medidaCarrito = isCustomSize
    ? partesMedida.join(" · ") || "A medida"
    : selectedSize || "";

  const precioCarrito = precioFinal > 0 ? String(precioFinal) : "";

  /**
   * Construye el mensaje de WhatsApp con las especificaciones del producto
   * y redirige al usuario a WhatsApp para iniciar el chat con el bot de N8N.
   */
  const handleWhatsAppClick = useCallback(() => {
    const whatsappNumber = import.meta.env.PUBLIC_WHATSAPP_NUMBER || "";

    // Construir la línea de dimensiones (el visor 3D escribe en el mismo store)
    let dimensionLine = "";
    if (isCustomSize) {
      const numero = (texto: string) => {
        const n = Number(texto);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };
      const ancho = medidas?.ancho ?? numero(customWidth);
      const largo = medidas?.profundo ?? numero(customDepth);
      const alto = medidas?.alto ?? numero(customHeight);

      const parts: string[] = [];
      if (ancho) parts.push(`Ancho: ${ancho} cm`);
      if (largo) parts.push(`Largo: ${largo} cm`);
      if (alto) parts.push(`Alto: ${alto} cm`);
      dimensionLine = parts.length > 0 ? parts.join(" | ") : "A medida (sin especificar)";
    } else {
      dimensionLine = product.dimensions || selectedSize || "No especificado";
    }

    // Color final: el elegido en el visor 3D tiene prioridad sobre el catálogo.
    const colorTexto = colorElegido
      ? `${colorElegido.nombre} (${colorElegido.hex})`
      : selectedColor;

    // Construir el mensaje completo
    const messageLines: string[] = [
      `*Solicitud de cotización - JKMobiliario*`,
      ``,
      `🗄️ *Producto:* ${product.name}`,
      `📐 *Dimensiones:* ${dimensionLine}`,
    ];

    if (selectedSize && !isCustomSize) {
      messageLines.push(`📏 *Medida seleccionada:* ${selectedSize}`);
    }

    if (colorTexto) {
      messageLines.push(`🎨 *Color:* ${colorTexto}`);
    }

    messageLines.push(`💰 *Precio base:* ${precioTexto(displayPrice)}`);

    if (additionalNotes.trim()) {
      messageLines.push(``, `📝 *Notas adicionales:* ${additionalNotes.trim()}`);
    }

    messageLines.push(
      ``,
      `¿Podrían confirmar disponibilidad y tiempo de entrega? ¡Gracias!`
    );

    const fullMessage = messageLines.join("\n");
    const encodedMessage = encodeURIComponent(fullMessage);

    // Construir la URL de WhatsApp
    let whatsappUrl: string;
    if (whatsappNumber) {
      // WhatsApp Business API link — inicia chat directo con el número configurado
      whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
    } else {
      // Fallback: WhatsApp Web sin número específico (el usuario deberá ingresar el contacto manualmente)
      whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    }

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }, [
    product,
    selectedSize,
    selectedColor,
    colorElegido,
    medidas,
    displayPrice,
    isCustomSize,
    customWidth,
    customDepth,
    customHeight,
    additionalNotes,
  ]);

  return (
    <div className="space-y-6">
      {/* Precio */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-bold text-gray-900">
          {/* Con descuento, un final de 0 es "$ 0" (precio real); "Cotización"
              queda reservado a productos sin precio base. */}
          {aplicaDescuento ? formatPrice(precioFinal) : precioTexto(precioFinal)}
        </span>
        {precioOriginal !== null && (
          <span className="text-lg text-gray-400 line-through">
            <span className="sr-only">Precio original: </span>
            {formatPrice(precioOriginal)}
          </span>
        )}
        {aplicaDescuento && (
          <span className="rounded-full bg-jk-gold-deep px-2 py-0.5 text-xs font-semibold text-white">
            <span className="sr-only">Descuento del </span>-{descuento} %
          </span>
        )}
      </div>

      {/* Stock: los muebles se fabrican a pedido, así que no se anuncian cifras. */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            currentStock > 0 ? "bg-green-500" : "bg-gray-400"
          }`}
          aria-hidden="true"
        ></span>
        <span className="text-sm text-gray-700">Stock</span>
      </div>

      {/* Selector de medidas predefinidas + personalizada */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Medidas</h3>
        <div className="flex flex-wrap gap-2">
          {product.sizes.map((size) => (
            <button
              key={size}
              onClick={() => {
                setSelectedSize(size);
                setIsCustomSize(false);
              }}
              className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                selectedSize === size && !isCustomSize
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
              }`}
              aria-pressed={selectedSize === size && !isCustomSize}
            >
              {size}
            </button>
          ))}
          {product.sizes.length > 0 && (
            <button
              onClick={() => {
                setIsCustomSize(!isCustomSize);
                if (!isCustomSize) setSelectedSize(""); // Limpiar medida predefinida al cambiar a personalizada
              }}
              className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                isCustomSize
                  ? "border-jk-gold-deep bg-jk-gold-deep text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-jk-gold-deep"
              }`}
              aria-pressed={isCustomSize}
            >
              ✏️ Medida personalizada
            </button>
          )}
        </div>
      </div>

      {/* Campos de dimensiones personalizadas */}
      {isCustomSize && (
        <div className="space-y-3 p-4 bg-jk-cream border border-jk-gold rounded-lg">
          <h3 className="text-sm font-medium text-jk-gold-deep">
            Especifica las dimensiones deseadas
          </h3>
          <p className="text-xs text-jk-gold-deep">
            Ingresa las medidas en centímetros. Puedes dejar vacíos los campos que no apliquen.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="custom-width"
                className="block text-xs font-medium text-gray-700"
              >
                Ancho (cm)
              </label>
              <input
                id="custom-width"
                type="number"
                min="1"
                placeholder="Ej: 160"
                value={customWidth}
                onChange={(e) => setCustomWidth(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jk-gold-deep focus:border-jk-gold-deep"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="custom-depth"
                className="block text-xs font-medium text-gray-700"
              >
                Largo (cm)
              </label>
              <input
                id="custom-depth"
                type="number"
                min="1"
                placeholder="Ej: 80"
                value={customDepth}
                onChange={(e) => setCustomDepth(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jk-gold-deep focus:border-jk-gold-deep"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="custom-height"
                className="block text-xs font-medium text-gray-700"
              >
                Alto (cm)
              </label>
              <input
                id="custom-height"
                type="number"
                min="1"
                placeholder="Ej: 75"
                value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jk-gold-deep focus:border-jk-gold-deep"
              />
            </div>
          </div>
        </div>
      )}

      {/* Selector de colores */}
      {product.colors.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Colores</h3>
          <div className="flex flex-wrap gap-3">
            {product.colors.map((color) => {
              // El color del visor 3D manda: si no coincide, no marcamos ninguno.
              const seleccionado =
                selectedColor === color.name &&
                (!colorElegido ||
                  colorElegido.hex.toUpperCase() === color.hex.toUpperCase());

              return (
                <button
                  key={color.name}
                  onClick={() => {
                    setSelectedColor(color.name);
                    setColorMueble({ nombre: color.name, hex: color.hex.toUpperCase() });
                  }}
                  className={`relative w-10 h-10 rounded-full border-2 transition-all ${
                    seleccionado
                      ? "border-gray-900 ring-2 ring-gray-900 ring-offset-2"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                  style={{ backgroundColor: color.hex }}
                  title={color.name}
                  aria-pressed={seleccionado}
                  aria-label={`Color: ${color.name}`}
                >
                  {color.hex === "#FFFFFF" && (
                    <span
                      className="absolute inset-0 rounded-full border border-gray-200"
                      aria-hidden="true"
                    ></span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-gray-600">
            Seleccionado:{" "}
            {colorElegido ? `${colorElegido.nombre} (${colorElegido.hex})` : selectedColor}
          </p>
        </div>
      )}

      {/* Notas adicionales */}
      <div className="space-y-2">
        <label
          htmlFor="additional-notes"
          className="block text-sm font-medium text-gray-900"
        >
          Notas adicionales <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <textarea
          id="additional-notes"
          rows={3}
          placeholder="Ej: Necesito color chocolate, con cajones adicionales, plazo de entrega urgente..."
          value={additionalNotes}
          onChange={(e) => setAdditionalNotes(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-jk-gold-deep focus:border-jk-gold-deep resize-none"
        />
      </div>

      {/* Agregar al carrito: el widget lee la variante elegida del dataset */}
      <button
        type="button"
        data-agregar-carrito
        data-product-id={product._id}
        data-nombre={product.name}
        data-categoria={product.category}
        data-medida={medidaCarrito}
        data-color={colorCarrito}
        data-colorhex={colorHexCarrito}
        data-precio={precioCarrito}
        data-imagen={proxyImageUrl(product.images[0])}
        className="w-full flex items-center justify-center gap-2 bg-jk-gold text-jk-ink py-3 px-6 rounded-lg font-medium hover:opacity-90 active:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-jk-gold-deep focus-visible:ring-offset-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H6" />
          <circle cx="9.5" cy="20" r="1.4" />
          <circle cx="17.5" cy="20" r="1.4" />
        </svg>
        <span data-jk-carrito-label>Agregar al carrito</span>
      </button>

      {/* Botón de WhatsApp */}
      <button
        onClick={handleWhatsAppClick}
        className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-green-700 active:bg-green-800 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        aria-label="Enviar solicitud de cotización por WhatsApp"
      >
        {/* Icono de WhatsApp (SVG inline) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Cotizar por WhatsApp
      </button>

      <p className="text-xs text-center text-gray-500">
        Al presionar, se abrirá WhatsApp con los detalles de tu solicitud.
      </p>
    </div>
  );
}
