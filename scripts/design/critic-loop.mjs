/**
 * critic-loop.mjs — a design-critic pass over a live page, per Anshu Chimala's
 * "world-class designer" method (Technique 3: a fresh-context critic scores a
 * screenshot against a top-studio bar; the implementer iterates until it clears
 * the bar). This is the honest, budget-free half of that method — NO image or
 * video generation, just screenshot → critique → (you edit) → re-run.
 *
 * It does NOT edit code. It produces a score and specific, actionable gaps; you
 * (or a coding agent) apply them and re-run until the score clears the bar. The
 * critic is intentionally a strong model used sparingly — taste is the one place
 * to spend the big model (Chimala's point), and one screenshot per run is cheap.
 *
 * Usage:
 *   # 1. run the app locally in another terminal:  npm run dev
 *   # 2. then:
 *   node scripts/design/critic-loop.mjs --url=http://localhost:3000/design/liturgical-wheel \
 *        --aesthetic="an antiquarian liturgical reading room; parchment and gold; sober, textual"
 *
 *   # If Playwright isn't installed, screenshot the page yourself and pass it:
 *   node scripts/design/critic-loop.mjs --screenshot=./shot.png --aesthetic="…"
 *
 * Flags:
 *   --url=<url>            page to screenshot (needs Playwright, or use --screenshot)
 *   --screenshot=<path>    use an existing PNG/JPEG instead of capturing one
 *   --aesthetic=<text>     the target aesthetic the critic should judge against
 *   --refs=<a.png,b.png>   optional reference images to set the quality bar (moodboard, NOT to copy)
 *   --width=<px>           viewport width for capture (default 1200)
 *   --out=<path>           where to save the captured screenshot (default ./scripts/design/.last-shot.png)
 *   --model=<id>           override the critic model
 *
 * Requires ANTHROPIC_API_KEY (same key note generation uses). Playwright is an
 * optional peer — install it only if you want automatic capture:
 *   npm i -D playwright && npx playwright install chromium
 */

import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { NOTE_MODEL } from '../lib/note-prompt.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });

const args = process.argv.slice(2);
const val = (name, dflt = null) => {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : dflt;
};

const URL = val('--url', 'http://localhost:3000/design/liturgical-wheel');
const SHOT = val('--screenshot');
const AESTHETIC = val('--aesthetic', 'the intended aesthetic of the page');
const REFS = (val('--refs', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const WIDTH = parseInt(val('--width', '1200'), 10);
const OUT = val('--out', path.join(__dirname, '.last-shot.png'));
const MODEL = val('--model', NOTE_MODEL);

const DESIGN_CRITIC_PROMPT = `You are a design critic for a top studio. You are shown a screenshot of a web page and told the aesthetic it is going for. Do not care how it was built or how much effort it took — judge only whether it hits a studio-level quality bar.

Work in this order:
1. Read the aesthetic the page is going for.
2. Picture how a top design studio would execute THAT aesthetic — the specific typographic, spacing, colour, and compositional choices they would make.
3. Name the biggest gaps between what you see and that studio-level execution. Think both high-level (structure, composition, hierarchy, rhythm) and fine detail (spacing, alignment, type scale, contrast).
4. Watch for and penalize anything that reads as generic or obviously AI-generated: filler symmetry, a hero sized to the viewport, uniform rounded cards, a lone accent pop, off-palette colour, over-explaining.

Be bold and opinionated. Give tight, specific, actionable feedback — never vague praise. Then score the page out of 10, where 10 is indistinguishable from a top studio's execution of this exact aesthetic.

Return ONLY minified JSON in exactly this shape:
{"score": <integer 1-10>, "biggest_gaps": [<short specific strings>], "fine_details": [<short specific strings>], "ai_tells": [<short strings, may be empty>], "keep": [<what already works>], "next_change": "<the single highest-impact change to make before re-running>"}`;

function mediaTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

async function capture(url, outPath, width) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(
      'Playwright is not installed, so the page cannot be captured automatically.\n' +
      '   Either install it:  npm i -D playwright && npx playwright install chromium\n' +
      '   or screenshot the page yourself and pass --screenshot=<path>.'
    );
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: Math.round(width * 0.75) } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: outPath, fullPage: true });
    return outPath;
  } finally {
    await browser.close();
  }
}

async function imageBlock(file) {
  const data = await fs.readFile(file);
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaTypeFor(file), data: data.toString('base64') },
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Add it to .env.local.');
    process.exit(1);
  }

  let shotPath = SHOT;
  if (!shotPath) {
    console.log(`Capturing ${URL} …`);
    try {
      shotPath = await capture(URL, OUT, WIDTH);
      console.log(`  saved ${shotPath}`);
    } catch (err) {
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const content = [];
  for (const ref of REFS) {
    content.push({ type: 'text', text: 'Reference for the target quality bar (a moodboard — do NOT judge the page by how closely it copies this):' });
    content.push(await imageBlock(ref));
  }
  content.push({ type: 'text', text: `The page under review. Aesthetic it is going for: ${AESTHETIC}` });
  content.push(await imageBlock(shotPath));

  console.log('Asking the critic …\n');
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 900,
    system: DESIGN_CRITIC_PROMPT,
    messages: [{ role: 'user', content }],
  });

  const raw = (message.content?.[0]?.text ?? '').trim();
  let verdict;
  try {
    verdict = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    console.log(raw);
    return;
  }

  const line = (label, items) => {
    if (!items || items.length === 0) return;
    console.log(`\n${label}`);
    for (const it of items) console.log(`  • ${it}`);
  };

  console.log(`SCORE: ${verdict.score}/10`);
  line('Biggest gaps:', verdict.biggest_gaps);
  line('Fine details:', verdict.fine_details);
  line('AI tells:', verdict.ai_tells);
  line('Working already:', verdict.keep);
  if (verdict.next_change) console.log(`\n→ Highest-impact next change:\n  ${verdict.next_change}`);
  console.log(`\n(Apply the change, then re-run. Chimala's bar is a 9/10 the critic reaches on its own.)`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
