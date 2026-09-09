import { useState, useEffect } from "react";
import type { Product, ProductVariant } from "../../lib/types";
import { addToCart } from "../../lib/cart";

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

  const handleAddToCart = () => {
    const variant = hasVariants
      ? product.variants.find(
          (v) => v.size === selectedSize && v.color === selectedColor
        )
      : undefined;

    addToCart(product, variant, 1);
    alert("Producto agregado al carrito");
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
    }).format(price);
  };

  const currentVariant = hasVariants
    ? product.variants.find(
        (v) => v.size === selectedSize && v.color === selectedColor
      )
    : undefined;

  const displayPrice = currentVariant?.price || product.price;

  return (
    <div className="space-y-6">
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
            ></span>
            <span className="text-sm text-gray-700">
              {currentStock > 5
                ? "En stock"
                : `Solo quedan ${currentStock} unidades`}
            </span>
          </>
        ) : (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            <span className="text-sm text-red-600 font-medium">Agotado</span>
          </>
        )}
      </div>

      {product.sizes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Medidas</h3>
          <div className="flex flex-wrap gap-2">
            {product.sizes.map((size) => (
              <button
                key={size}
                onClick={() => setSelectedSize(size)}
                className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                  selectedSize === size
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

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
              >
                {color.hex === "#FFFFFF" && (
                  <span className="absolute inset-0 rounded-full border border-gray-200"></span>
                )}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-600">Seleccionado: {selectedColor}</p>
        </div>
      )}

      <button
        onClick={handleAddToCart}
        disabled={currentStock === 0}
        className="w-full bg-gray-900 text-white py-3 px-6 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {currentStock === 0 ? "Agotado" : "Agregar al Carrito"}
      </button>
    </div>
  );
}
