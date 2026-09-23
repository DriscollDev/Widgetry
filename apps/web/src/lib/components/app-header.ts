// apps/web/src/lib/components/app-header.ts
//
// The pure parts of the app shell's header (SCP-027, Screen Inventory §5).
//
// Kept out of the component for the usual reason in this codebase: the rules
// below are unit-testable without mounting Svelte, and the header stays markup.

export type NavItem = {
  href: string;
  label: string;
};

/**
 * The signed-in navigation.
 *
 * Only destinations that exist and are reachable today. /account is reached
 * through the account menu rather than listed here - it is a personal
 * destination, not a place in the product, and Screen Inventory §5.2 treats it
 * that way.
 */
export const APP_NAV: readonly NavItem[] = [
  { href: '/boards', label: 'Boards' },
  { href: '/faq', label: 'FAQ' },
];

/**
 * Whether a nav item is the page being viewed.
 *
 * A prefix match, not equality, so /boards stays lit while the user is inside
 * /boards/<id>. The trailing-slash guard stops /board-something matching
 * /boards.
 */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The letter in the avatar when the user has no image.
 *
 * Name first, email second: Better-Auth requires a name at sign-up (FR-1.1),
 * but a row written by an older migration or by Google sign-in can carry an
 * empty one, and an empty avatar reads as a broken control rather than a
 * missing field.
 */
export function userInitial(name: string, email: string): string {
  const source = name.trim() || email.trim();
  // Array spread, not [0]: a name starting with an astral character (an emoji,
  // or a character outside the BMP) would otherwise yield half a surrogate pair
  // and render as a replacement glyph.
  const first = [...source][0];
  return first ? first.toUpperCase() : '?';
}
