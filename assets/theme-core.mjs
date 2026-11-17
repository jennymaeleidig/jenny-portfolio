/**
 * The theme's stored name, its one dark test, and a palette read from the
 * stylesheet's own declarations.
 *
 * The boot script and the palette strip share the storage key; the canvas
 * reads the `dark` token off `<html data-theme>`, and the poster takes the
 * theme as an argument. The boot script in layouts/shell.sh carries the key
 * and the dark token, so a rename touches this module and that script.
 *
 * The declarations are read from the rules rather than from a live element
 * because a theme switch fades the tokens: a computed colour read once the
 * fade has begun is part-way between the two palettes.
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
 *   media?: { mediaText: string },
 *   style?: { getPropertyValue(name: string): string },
 * }} TokenRule
 */

/**
 * A selector's declared custom properties, gathered from a rule list.
 *
 * Two shapes in a stylesheet need care. A browser that supports CSS nesting
 * gives every style rule a `cssRules` list of its own, empty for a plain rule,
 * so a rule's own declarations are read before its children are walked. And a
 * grouped selector carries its whole list in `selectorText`, so it is split
 * before comparing.
 *
 * A rule list that sits inside a conditional block is skipped unless `applies`
 * says the condition holds; otherwise the print palette would answer a screen
 * read.
 *
 * @param {ArrayLike<*>} rules any rule list a stylesheet exposes
 * @param {string} selector one selector, without a list
 * @param {readonly string[]} tokens
 * @param {(rule: TokenRule) => boolean} [applies] whether a conditional block is in force
 * @returns {Map<string, string>}
 */
export function declaredTokens(rules, selector, tokens, applies = () => true) {
  const declared = new Map();
  collectDeclared(
    /** @type {ArrayLike<TokenRule>} */ (rules),
    selector,
    tokens,
    applies,
    declared,
  );
  return declared;
}

/**
 * @param {ArrayLike<TokenRule>} rules
 * @param {string} selector
 * @param {readonly string[]} tokens
 * @param {(rule: TokenRule) => boolean} applies
 * @param {Map<string, string>} declared
 */
function collectDeclared(rules, selector, tokens, applies, declared) {
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (
      rule.style &&
      rule.selectorText &&
      selectorList(rule.selectorText).includes(selector)
    ) {
      for (const token of tokens) {
        const value = rule.style.getPropertyValue(token).trim();
        if (value) declared.set(token, value);
      }
    }
    if (rule.cssRules && rule.cssRules.length > 0 && applies(rule)) {
      collectDeclared(rule.cssRules, selector, tokens, applies, declared);
    }
  }
}

/**
 * @param {string} selectorText
 * @returns {string[]}
 */
function selectorList(selectorText) {
  return selectorText.split(",").map((part) => part.trim());
}
