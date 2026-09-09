import { atom } from "nanostores";
import type { Product, ProductVariant } from "../types";

export interface CartItem {
  product: Product;
  variant?: ProductVariant;
  quantity: number;
}

export const cartItems = atom<CartItem[]>([]);

export function addToCart(product: Product, variant?: ProductVariant, quantity = 1) {
  const items = cartItems.get();
  const existingIndex = items.findIndex(
    (item) =>
      item.product._id === product._id &&
      item.variant?.size === variant?.size &&
      item.variant?.color === variant?.color
  );

  if (existingIndex >= 0) {
    const updated = [...items];
    updated[existingIndex].quantity += quantity;
    cartItems.set(updated);
  } else {
    cartItems.set([...items, { product, variant, quantity }]);
  }
}

export function removeFromCart(index: number) {
  const items = cartItems.get();
  cartItems.set(items.filter((_, i) => i !== index));
}

export function updateQuantity(index: number, quantity: number) {
  const items = cartItems.get();
  if (quantity <= 0) {
    removeFromCart(index);
    return;
  }
  const updated = [...items];
  updated[index].quantity = quantity;
  cartItems.set(updated);
}

export function clearCart() {
  cartItems.set([]);
}

export function getCartTotal() {
  return cartItems.get().reduce((total, item) => {
    const price = item.variant?.price || item.product.price;
    return total + price * item.quantity;
  }, 0);
}

export function getCartCount() {
  return cartItems.get().reduce((count, item) => count + item.quantity, 0);
}
