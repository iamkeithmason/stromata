/**
 * plate.ts — telling an illustration apart from a paragraph
 *
 * Markdown has no figure syntax, so an illustration always arrives wrapped in a
 * paragraph: `![Caption](/plates/…/i_020.jpg)` parses to a paragraph whose only
 * child is an image. That is the only signal there is, and `MarkdownBody` needs
 * it in two places which must agree:
 *
 *   - the remark plugin, so a plate does not consume a paragraph number;
 *   - the `p` renderer, so a plate becomes a `<figure>` instead of a `<p>`.
 *
 * They must agree because a `<figure>` emitted inside the `<p>` the other
 * branch produces is invalid HTML and hydrates wrong. Hence one shared helper,
 * tested here rather than trusted in two component branches.
 *
 * It runs over both mdast (remark, image nodes) and hast (react-markdown,
 * `element`/`img` nodes), which is why the child's identity is left to the
 * caller and only "exactly one child that isn't whitespace" lives here.
 */

/** The least a node must have for {@link onlyChild} to reason about it. */
export type MinimalNode = {
  type: string;
  value?: string;
  children?: MinimalNode[];
};

/**
 * The single meaningful child of `children`, or null if there is more than one.
 *
 * Whitespace-only text nodes don't count: remark leaves a trailing newline
 * beside an image often enough that ignoring them is the difference between
 * catching every plate and catching some.
 */
export function onlyChild<T extends MinimalNode>(children: T[] | undefined): T | null {
  const real = (children ?? []).filter(
    (child) => child.type !== 'text' || (child.value ?? '').trim() !== '',
  );
  return real.length === 1 ? real[0] : null;
}

/** mdast: is this paragraph node a plate? (remark, before rendering) */
export function isPlateParagraphMdast(node: MinimalNode): boolean {
  return node.type === 'paragraph' && onlyChild(node.children)?.type === 'image';
}

/** A plate as the renderer needs it. */
export type Plate = { src: string; alt: string };

/**
 * hast: the plate inside this paragraph's children, or null.
 *
 * An image with no `src` is not a plate — rendering a `<figure>` around a
 * broken image is worse than rendering the paragraph.
 */
export function plateFromHast(
  children: Array<MinimalNode & { tagName?: string; properties?: Record<string, unknown> }> | undefined,
): Plate | null {
  const sole = onlyChild(children);
  if (!sole || sole.type !== 'element' || sole.tagName !== 'img') return null;
  const src = String(sole.properties?.src ?? '');
  if (!src) return null;
  return { src, alt: String(sole.properties?.alt ?? '') };
}
