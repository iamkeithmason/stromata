"""Rebuild the publisher's mark and check it against the site.

    python3 scripts/design/publisher-mark/build.py            # rebuild, compare
    python3 scripts/design/publisher-mark/build.py --out=DIR  # also keep the SVGs

mark.py draws both cuts from hand-set centrelines in the pixel space of Keith's
sketch (sketch/keith-sketch-ink.png), with the ornaments' stroke library (lib.py)
and the mark's additions (markkit.py; mark2.py and mark3.py hold the earlier
rounds' geometry that mark.py builds on). It runs in a scratch directory so
nothing lands in the repo, and each path it draws must equal, byte for byte,
the `d` stored in lib/brand/mark.ts. A mismatch exits 1. To change the mark,
edit mark.py, rebuild here, paste the new path into lib/brand/mark.ts, then run
`npm run mark:svg` to refresh public/mark/.

Needs python3 with numpy, shapely, cairosvg and Pillow.
"""
import os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
TS = os.path.join(ROOT, 'lib', 'brand', 'mark.ts')
OUTPUTS = {'print': 'mark-F-print.svg', 'small': 'mark-F-small.svg'}


def site_paths():
    src = open(TS, encoding='utf-8').read()
    return dict(re.findall(r"\n  (print|small): \{\n    d: '([^']+)',", src))


def main():
    keep = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--out=')), None)
    site = site_paths()
    failed = 0
    with tempfile.TemporaryDirectory() as tmp:
        for name in ('mark.py', 'mark2.py', 'mark3.py', 'markkit.py', 'lib.py'):
            shutil.copy(os.path.join(HERE, name), tmp)
        os.makedirs(os.path.join(tmp, 'work'), exist_ok=True)
        subprocess.run([sys.executable, 'mark.py'], cwd=tmp,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for cut, produced in OUTPUTS.items():
            out = os.path.join(tmp, produced)
            d = None
            if os.path.exists(out):
                m = re.search(r' d="([^"]+)"', open(out, encoding='utf-8').read())
                d = m.group(1) if m else None
            if keep and d:
                os.makedirs(keep, exist_ok=True)
                shutil.copy(out, os.path.join(keep, f'{cut}.svg'))
            status = ('FAILED to build' if d is None else
                      'ok' if d == site.get(cut) else 'DIFFERS from the site')
            failed += status != 'ok'
            print(f'{cut:<6} {status}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
