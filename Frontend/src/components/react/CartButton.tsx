import { useState, useEffect } from "react";
import { useStore } from "@nanostores/react";
import { cartItems, getCartCount, getCartTotal, removeFromCart, updateQuantity } from "../../lib/cart";
import { proxyImageUrl } from "../../lib/images";
import { formatPrice } from "../../lib/precio";

export default function CartButton() {
  const [isOpen, setIsOpen] = useState(false);
  const items = useStore(cartItems);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setCount(getCartCount());
    setTotal(getCartTotal());
  }, [items]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative text-gray-600 hover:text-gray-900 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
          />
        </svg>
        {count > 0 && (
          <span className="absolute -top-2 -right-2 bg-gray-900 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold">Carrito de Compras</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {items.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    Tu carrito está vacío
                  </p>
                ) : (
                  <div className="space-y-4">
                    {items.map((item, index) => (
                      <div
                        key={`${item.product._id}-${item.variant?.size}-${item.variant?.color}`}
                        className="flex gap-4"
                      >
                        <div className="w-20 h-20 bg-gray-100 rounded-md overflow-hidden flex-shrink-0">
                          {item.product.images[0] ? (
                            <img
                              src={proxyImageUrl(item.product.images[0])}
                              alt={item.product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-8 w-8"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-gray-900">
                            {item.product.name}
                          </h3>
                          {item.variant && (
                            <p className="text-xs text-gray-500">
                              {item.variant.size} / {item.variant.color}
                            </p>
                          )}
                          <p className="text-sm font-medium text-gray-900 mt-1">
                            {formatPrice(item.variant?.price || item.product.price)}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() =>
                                updateQuantity(index, item.quantity - 1)
                              }
                              className="w-6 h-6 rounded border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                            >
                              -
                            </button>
                            <span className="text-sm w-8 text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(index, item.quantity + 1)
                              }
                              className="w-6 h-6 rounded border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                            >
                              +
                            </button>
                            <button
                              onClick={() => removeFromCart(index)}
                              className="ml-auto text-red-500 hover:text-red-700 text-sm"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {items.length > 0 && (
                <div className="border-t p-4 space-y-4">
                  <div className="flex justify-between text-lg font-semibold">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                  <button className="w-full bg-gray-900 text-white py-3 px-6 rounded-lg font-medium hover:bg-gray-800 transition-colors">
                    Finalizar Compra
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
