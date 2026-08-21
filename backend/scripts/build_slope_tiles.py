"""
Layer pendenze FATTO IN CASA — dal DEM Copernicus GLO-30 (licenza libera,
attribuzione obbligatoria) ai tile XYZ per la mappa. Niente fonti con licenze
ambigue (OpenSlopeMap = solo uso privato): il gradiente ce lo calcoliamo noi.

Pipeline (tutta GDAL, open source):
  1. scarica il COG Copernicus DEM della cella N46/E010 (AWS Open Data, gratis)
  2. ritaglia il bbox dell'area pilota e riproietta in UTM32 (pendenze corrette)
  3. gdaldem slope → gradi
  4. color-relief con la scala classica valanghe:
       <30° trasparente · 30-34° giallo · 35-39° arancio · 40-44° rosso · ≥45° viola
  5. gdal2tiles --xyz → frontend/public/tiles/slope/{z}/{x}/{y}.png

Requisiti (sul Mac):  brew install gdal
Uso:                  cd backend && python3 scripts/build_slope_tiles.py
                      [--bbox S W N E] [--zmin 10] [--zmax 15]

I tile finiscono nel frontend e viaggiano col deploy: nessun tile server,
nessuna dipendenza esterna a runtime. Area pilota di default: Alta Valcamonica.
"""
from __future__ import annotations

import argparse
import pathlib
import shutil
import subprocess
import sys
import tempfile
import urllib.request

REPO = pathlib.Path(__file__).resolve().parents[2]
OUT = REPO / "frontend" / "public" / "tiles" / "slope"

#: cella Copernicus GLO-30 che copre l'alta Valcamonica (46-47N, 10-11E)
COG_URL = ("https://copernicus-dem-30m.s3.amazonaws.com/"
           "Copernicus_DSM_COG_10_N46_00_E010_00_DEM/"
           "Copernicus_DSM_COG_10_N46_00_E010_00_DEM.tif")

#: scala colori (gradi pendenza → RGBA), convenzione valanghe/Munter
COLOR_RAMP = """\
0    0   0   0   0
29.9 0   0   0   0
30   255 214 0   150
34.9 255 214 0   150
35   255 140 0   170
39.9 255 140 0   170
40   230 30  30  185
44.9 230 30  30  185
45   160 32  240 200
90   160 32  240 200
"""


def run(cmd: list[str]) -> None:
    print("$", " ".join(str(c) for c in cmd))
    subprocess.run([str(c) for c in cmd], check=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bbox", nargs=4, type=float, metavar=("S", "W", "N", "E"),
                    default=[46.10, 10.20, 46.32, 10.55],
                    help="area (default: Alta Valcamonica)")
    ap.add_argument("--zmin", type=int, default=10)
    ap.add_argument("--zmax", type=int, default=15)
    args = ap.parse_args()
    s, w, n, e = args.bbox

    for tool in ("gdalwarp", "gdaldem", "gdal2tiles.py"):
        if shutil.which(tool) is None:
            sys.exit(f"✗ manca {tool}: installa GDAL con  brew install gdal")

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="slope_"))
    dem = tmp / "dem.tif"
    print(f"→ scarico il DEM Copernicus (cella N46 E010, ~50-100 MB)…")
    urllib.request.urlretrieve(COG_URL, dem)

    utm = tmp / "dem_utm.tif"
    run(["gdalwarp", "-te", w, s, e, n, "-te_srs", "EPSG:4326",
         "-t_srs", "EPSG:32632", "-tr", 30, 30, "-r", "bilinear", dem, utm])

    slope = tmp / "slope.tif"
    run(["gdaldem", "slope", utm, slope, "-compute_edges"])

    ramp = tmp / "ramp.txt"
    ramp.write_text(COLOR_RAMP, encoding="utf-8")
    colored = tmp / "slope_rgba.tif"
    run(["gdaldem", "color-relief", slope, ramp, colored, "-alpha"])

    web = tmp / "slope_web.tif"  # gdal2tiles vuole WebMercator
    run(["gdalwarp", "-t_srs", "EPSG:3857", "-r", "bilinear", colored, web])

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    run(["gdal2tiles.py", "--xyz", "-z", f"{args.zmin}-{args.zmax}",
         "-w", "none", "--processes", "4", web, OUT])

    n_tiles = sum(1 for _ in OUT.rglob("*.png"))
    print(f"\n✓ {n_tiles} tile in {OUT.relative_to(REPO)}")
    print("  Attribuzione (già nella mappa e in /fonti): prodotto da dati")
    print("  Copernicus DEM © ESA/Airbus — elaborazione Zerotermico (gdaldem).")
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
