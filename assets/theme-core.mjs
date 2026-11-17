/**
 * The theme's stored name and its one dark test.
 *
 * The boot script and the palette strip share the storage key; the canvas
 * reads the `dark` token off `<html data-theme>`, and the poster takes the
 * theme as an argument. The boot script in layouts/shell.sh carries the key
 * and the dark token, so a rename touches this module and that script.
 */

export const THEME_STORAGE_KEY = "theme";
export const DARK = "dark";
export const LIGHT = "light";

/** @param {string | undefined | null} value */
export function isDark(value) {
  return value === DARK;
}

/**
 * A stylesheet rule, narrowed to the parts a token read touches.
 *
 * @typedef {{
 *   [key: string]: unknown,
 *   cssRules?: { length: number, [index: number]: TokenRule },
 *   selectorText?: string,
 *   style?: { getPropertyValue(name: string): string },
 * }} TokenRule
 */

/**
 * A selector's declared custom properties, gathered from a rule list.
 *
 * A browser that supports CSS nesting gives every style rule a `cssRules` list
 * of its own, empty for a plain rule. So a rule's own declarations are read
 * before its children are walked; treating "has `cssRules`" as "is a
 * container" skips every plain rule.
 *
 * @param {ArrayLike<*>} rules any rule list a stylesheet exposes
 * @param {string} selector
 * @param {readonly string[]} tokens
 * @returns {Map<string, string>}
 */
export function declaredTokens(rules, selector, tokens) {
  const declared = new Map();
  collectDeclared(
    /** @type {ArrayLike<TokenRule>} */ (rules),
    selector,
    tokens,
    declared,
  );
  return declared;
}

/**
 * @param {ArrayLike<TokenRule>} rules
 * @param {string} selector
 * @param {readonly string[]} tokens
 * @param {Map<string, string>} declared
 */
function collectDeclared(rules, selector, tokens, declared) {
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (rule.selectorText === selector && rule.style) {
      for (const token of tokens) {
        const value = rule.style.getPropertyValue(token).trim();
        if (value) declared.set(token, value);
      }
    }
    if (rule.cssRules && rule.cssRules.length > 0) {
      collectDeclared(rule.cssRules, selector, tokens, declared);
    }
  }
}
