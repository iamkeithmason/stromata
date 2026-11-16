"""Rebuild the seventeen genre ornaments and check them against the site.

    python3 scripts/design/ornaments/build.py            # rebuild all, compare
    python3 scripts/design/ornaments/build.py Poem Hymn  # rebuild some
    python3 scripts/design/ornaments/build.py --out=DIR  # also keep the SVGs in DIR

Each ornament is drawn by one script in genres/, which builds it from hand-set centrelines
with the shared stroke library (lib.py, plus extra.py for the herbal plants). The scripts
were written in four passes by different agents, so they take their arguments and name their
output in slightly different ways; RECIPES below records, for each genre, the script, the
arguments that produce the accepted version, and the file it writes. Every script runs in a
scratch directory with its own copy of the libraries, so nothing lands in the repo.

The check: the path data each script produces must equal, byte for byte, the `d` stored for
that genre in lib/genres/ornaments.ts, which is what the site renders. A mismatch exits 1.
If you change an ornament on purpose, rebuild it here, paste the new path into that file
(never edit a path by hand), then run `npm run ornaments:svg` to refresh the cover masks
in public/ornaments/.

Needs python3 with numpy, shapely, cairosvg and Pillow (pip install numpy shapely cairosvg
pillow). cairosvg/Pillow are used only for each script's preview, which is skipped when the
source scan it would draw beside is not present.
"""
import os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
TS = os.path.join(ROOT, 'lib', 'genres', 'ornaments.ts')

# genre -> (script, args, file the script writes, relative to its working directory)
RECIPES = {
    'Sermon':      ('sermon-fish.py',          [],         'sermon-fish.svg'),
    'Meditation':  ('meditation-lily.py',      [],         'meditation-lily.svg'),
    'Poem':        ('poem-rose.py',            [],         'poem-rose.svg'),
    'Catechesis':  ('catechesis-wheat.py',     ['B'],      'wheat-B.svg'),
    'Essay':       ('essay-olive.py',          ['.'],      'essay-olive.svg'),
    'Commentary':  ('commentary-vine.py',      ['.'],      'commentary-vine.svg'),
    'Dialogue':    ('dialogue-pomegranate.py', ['.'],      'dialogue-pomegranate.svg'),
    'Homily':      ('homily-loaf.py',          [],         'homily-loaf.svg'),
    'Prayer':      ('prayer-candle.py',        [],         'prayer-candle.svg'),
    'Exegesis':    ('exegesis-key.py',         [],         'exegesis-key.svg'),
    'Hymn':        ('hymn-harp.py',            [],         'hymn-harp.svg'),
    'Rule':        ('rule-beehive.py',         ['B'],      'variants/rule-beehive-B.svg'),
    'Apology':     ('apology-tower.py',        ['B'],      'variants/apology-tower-B.svg'),
    'Treatise':    ('treatise-book.py',        ['A'],      'variants/treatise-book-A.svg'),
    'Confession':  ('confession-heart.py',     ['B'],      'variants/confession-heart-B.svg'),
    'Letter':      ('letter-quill.py',         ['A'],      'variants/letter-quill-A.svg'),
    'Hagiography': ('hagiography-palm.py',     ['B'],      'variants/hagiography-palm-SB.svg'),
}


def site_paths():
    src = open(TS, encoding='utf-8').read()
    return dict(re.findall(r"\n  (\w+): \{.*?\n    d: '([^']+)',", src, re.S))


def build(genre, workdir):
    script, args, produced = RECIPES[genre]
    for name in ('lib.py', 'extra.py'):
        shutil.copy(os.path.join(HERE, name), workdir)
    shutil.copy(os.path.join(HERE, 'genres', script), workdir)
    for sub in ('work', 'variants'):
        os.makedirs(os.path.join(workdir, sub), exist_ok=True)
    # The SVG is written before the preview; a preview that cannot find its scan is harmless.
    subprocess.run([sys.executable, script, *args], cwd=workdir,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    out = os.path.join(workdir, produced)
    if not os.path.exists(out):
        return None
    m = re.search(r'<path[^>]* d="([^"]+)"', open(out, encoding='utf-8').read())
    return m.group(1) if m else None


def main():
    argv = sys.argv[1:]
    keep = next((a.split('=', 1)[1] for a in argv if a.startswith('--out=')), None)
    wanted = [a for a in argv if not a.startswith('--')] or list(RECIPES)
    unknown = [g for g in wanted if g not in RECIPES]
    if unknown:
        sys.exit(f'unknown genre(s): {", ".join(unknown)}. Known: {", ".join(RECIPES)}')
    site = site_paths()
    failed = 0
    for genre in wanted:
        with tempfile.TemporaryDirectory() as tmp:
            d = build(genre, tmp)
            if keep and d:
                os.makedirs(keep, exist_ok=True)
                stem = RECIPES[genre][0][:-3]
                with open(os.path.join(keep, stem + '.svg'), 'w', encoding='utf-8') as f:
                    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
                            f'fill="currentColor" fill-rule="evenodd"><path d="{d}"/></svg>')
        if d is None:
            status = 'FAILED to build'
        elif genre not in site:
            status = 'built; not in lib/genres/ornaments.ts'
        elif d == site[genre]:
            status = 'ok'
        else:
            status = 'DIFFERS from the site'
        if status != 'ok':
            failed += 1
        print(f'{genre:<12} {RECIPES[genre][0]:<26} {status}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
