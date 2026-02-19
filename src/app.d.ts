import type { Session, User } from "$lib/server/auth";

declare global {
  namespace App {
    interface Locals {
      user: User | null;
      session: Session | null;
      locale: string;
    }
  }
}

export {};
