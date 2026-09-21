/**
 * Tests for plate detection.
 *
 * The consequence of getting this wrong is not cosmetic: the remark plugin and
 * the `p` renderer both ask the same question, and if they answer differently
 * a `<figure>` lands inside a `<p>`, which is invalid HTML. So the cases that
 * matter are the boundaries — an image with text beside it is prose, an image
 * with a stray newline beside it is still a plate.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onlyChild, isPlateParagraphMdast, plateFromHast } from './plate';

const img = (src = '/plates/x/i_020.jpg', alt = 'Evangelist Points to Wicket-Gate.') => ({
  type: 'element',
  tagName: 'img',
  properties: { src, alt },
});

test('a paragraph holding one image is a plate, in mdast', () => {
  assert.equal(isPlateParagraphMdast({ type: 'paragraph', children: [{ type: 'image' }] }), true);
});

test('a paragraph holding an image AND prose is prose', () => {
  // The pre-cleanup shape: Gutenberg repeated the caption as text beside the
  // image. Treating that as a plate would drop the text on the floor.
  assert.equal(
    isPlateParagraphMdast({
      type: 'paragraph',
      children: [{ type: 'image' }, { type: 'text', value: ' Evangelist Points to Wicket-Gate.' }],
    }),
    false,
  );
});

test('whitespace beside the image does not stop it being a plate', () => {
  assert.equal(
    isPlateParagraphMdast({
      type: 'paragraph',
      children: [{ type: 'image' }, { type: 'text', value: '\n' }],
    }),
    true,
  );
});

test('an ordinary paragraph is never a plate', () => {
  assert.equal(
    isPlateParagraphMdast({ type: 'paragraph', children: [{ type: 'text', value: 'Then said Evangelist.' }] }),
    false,
  );
  assert.equal(isPlateParagraphMdast({ type: 'heading', children: [{ type: 'image' }] }), false);
});

test('hast: a lone img yields its src and alt', () => {
  assert.deepEqual(plateFromHast([img()]), {
    src: '/plates/x/i_020.jpg',
    alt: 'Evangelist Points to Wicket-Gate.',
  });
});

test('hast: an image with no src is not a plate', () => {
  // A <figure> around a broken image is worse than the paragraph it replaced.
  assert.equal(plateFromHast([img('')]), null);
});

test('hast: two images, or an image beside text, is not a plate', () => {
  assert.equal(plateFromHast([img(), img('/plates/x/i_057.jpg')]), null);
  assert.equal(plateFromHast([img(), { type: 'text', value: 'See page 15' }]), null);
});

test('hast: a missing alt is allowed — the caption is simply absent', () => {
  assert.deepEqual(plateFromHast([{ type: 'element', tagName: 'img', properties: { src: '/a.jpg' } }]), {
    src: '/a.jpg',
    alt: '',
  });
});

test('onlyChild returns null for none and for many', () => {
  assert.equal(onlyChild([]), null);
  assert.equal(onlyChild(undefined), null);
  assert.equal(onlyChild([{ type: 'text', value: '  ' }]), null);
  assert.equal(onlyChild([{ type: 'image' }, { type: 'image' }]), null);
});
