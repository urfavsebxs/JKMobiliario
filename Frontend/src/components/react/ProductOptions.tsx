import { useState, useEffect, useCallback } from "react";
import type { Product, ProductVariant } from "../../lib/types";

interface ProductOptionsProps {
  product: Product;
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
  const [isCustomSize, setIsCustomSize] = useState<boolean>(false);

  const hasVariants = product.variants && product.variants.length > 0;

  useEffect(() => {
    if (hasVariants && selectedSize && selectedColor) {
      const variant = product.variants.find(
        (v) => v.size === selectedSize && v.color === selectedColor
      );
      if (variant) {
        setCurrentStock(variant.stock);
      }
    }
  }, [selectedSize, selectedColor, product.variants, hasVariants]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const currentVariant = hasVariants
    ? product.variants.find(
        (v) => v.size === selectedSize && v.color === selectedColor
      )
    : undefined;

  const displayPrice = currentVariant?.price || product.price;

  /**
   * Construye el mensaje de WhatsApp con las especificaciones del producto
   * y redirige al usuario a WhatsApp para iniciar el chat con el bot de N8N.
   */
  const handleWhatsAppClick = useCallback(() => {
    const whatsappNumber = import.meta.env.PUBLIC_WHATSAPP_NUMBER || "";

    // Construir la línea de dimensiones
    let dimensionLine = "";
    if (isCustomSize) {
      const parts: string[] = [];
      if (customWidth.trim()) parts.push(`Ancho: ${customWidth.trim()} cm`);
      if (customDepth.trim()) parts.push(`Largo: ${customDepth.trim()} cm`);
      if (customHeight.trim()) parts.push(`Alto: ${customHeight.trim()} cm`);
      dimensionLine = parts.length > 0 ? parts.join(" | ") : "A medida (sin especificar)";
    } else {
      dimensionLine = product.dimensions || selectedSize || "No especificado";
    }

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

    if (selectedColor) {
      messageLines.push(`🎨 *Color:* ${selectedColor}`);
    }

    messageLines.push(`💰 *Precio base:* ${formatPrice(displayPrice)}`);

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
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold text-gray-900">
          {formatPrice(displayPrice)}
        </span>
        {currentVariant?.price && currentVariant.price < product.price && (
          <span className="text-lg text-gray-400 line-through">
            {formatPrice(product.price)}
          </span>
        )}
      </div>

      {/* Stock */}
      <div className="flex items-center gap-2">
        {currentStock > 0 ? (
          <>
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                currentStock > 5
                  ? "bg-green-500"
                  : currentStock > 0
                  ? "bg-yellow-500"
                  : "bg-red-500"
              }`}
              aria-hidden="true"
            ></span>
            <span className="text-sm text-gray-700">
              {currentStock > 5
                ? "En stock"
                : `Solo quedan ${currentStock} unidades`}
            </span>
          </>
        ) : (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" aria-hidden="true"></span>
            <span className="text-sm text-red-600 font-medium">Agotado</span>
          </>
        )}
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
          <button
            onClick={() => {
              setIsCustomSize(!isCustomSize);
              if (!isCustomSize) setSelectedSize(""); // Limpiar medida predefinida al cambiar a personalizada
            }}
            className={`px-4 py-2 text-sm rounded-md border transition-colors ${
              isCustomSize
                ? "border-green-600 bg-green-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:border-green-500"
            }`}
            aria-pressed={isCustomSize}
          >
            ✏️ Medida personalizada
          </button>
        </div>
      </div>

      {/* Campos de dimensiones personalizadas */}
      {isCustomSize && (
        <div className="space-y-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-sm font-medium text-green-900">
            Especifica las dimensiones deseadas
          </h3>
          <p className="text-xs text-green-700">
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
            {product.colors.map((color) => (
              <button
                key={color.name}
                onClick={() => setSelectedColor(color.name)}
                className={`relative w-10 h-10 rounded-full border-2 transition-all ${
                  selectedColor === color.name
                    ? "border-gray-900 ring-2 ring-gray-900 ring-offset-2"
                    : "border-gray-200 hover:border-gray-400"
                }`}
                style={{ backgroundColor: color.hex }}
                title={color.name}
                aria-pressed={selectedColor === color.name}
                aria-label={`Color: ${color.name}`}
              >
                {color.hex === "#FFFFFF" && (
                  <span className="absolute inset-0 rounded-full border border-gray-200" aria-hidden="true"></span>
                )}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-600">Seleccionado: {selectedColor}</p>
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
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
        />
      </div>

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
