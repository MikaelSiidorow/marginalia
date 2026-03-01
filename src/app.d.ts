import type { Session, User } from "$lib/server/auth";

declare global {
  namespace App {
    interface Locals {
      user: User | null;
      session: Session | null;
      locale: string;
    }
  }

  /** Build-time cache buster injected by Vite. Changes on every build/dev restart. */
  const __BUILD_VERSION__: string;

  /** Global handler baked into Typst SVG for internal links (TOC, cross-refs). */
  function handleTypstLocation(elem: Element, page: number, x: number, y: number): void;
}

export {};
