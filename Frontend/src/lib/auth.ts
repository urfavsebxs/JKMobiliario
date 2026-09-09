import { atom } from "nanostores";
import type { User } from "./types";

export const user = atom<User | null>(null);
export const token = atom<string | null>(null);

export function loadAuth() {
  if (typeof window === "undefined") return;
  const savedToken = localStorage.getItem("token");
  const savedUser = localStorage.getItem("user");
  if (savedToken && savedUser) {
    token.set(savedToken);
    user.set(JSON.parse(savedUser));
  }
}

export function saveAuth(u: User, t: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("token", t);
  localStorage.setItem("user", JSON.stringify(u));
  user.set(u);
  token.set(t);
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  user.set(null);
  token.set(null);
}

export function isAuthenticated() {
  return token.get() !== null;
}

export function isAdmin() {
  const u = user.get();
  return u?.role === "admin";
}
