#!/usr/bin/env python3
"""
build-manifest — Genera Backend/catalog/products.json a partir de los PDFs reales
del cliente (JKMobiliario 2026).

Pipeline reproducible:
  1. Localiza los 10 PDFs en el directorio fuente (por palabras clave ASCII, para
     evitar problemas de normalización Unicode con los nombres con acentos).
  2. Parsea página por página con `pdftotext -f P -l P -layout` y valida que cada
     página de contenido tenga exactamente 2 productos y las cantidades esperadas.
  3. Extrae las 2 imágenes de producto por página con `pdfimages` (ignora la
     portada y el logo de 358x291), las redimensiona a <=1600 px de ancho, las
     re-guarda como JPEG q85 sin metadatos y las referencia en el manifiesto.
  4. Escribe Backend/catalog/products.json (determinista: sin timestamps).

Uso:
  ./build-manifest                 # pipeline completo (texto + imágenes + JSON)
  ./build-manifest --skip-images   # solo texto + JSON (desarrollo)
  ./build-manifest --pdf-dir DIR --images-dir DIR

Dependencias del sistema: pdftotext, pdfinfo, pdfimages (poppler-utils),
pdftohtml (opcional, verificación de orden de imágenes), python3 + Pillow.

Los PDFs son la única fuente de verdad. Los .txt de /tmp/opencode/catalogs se
usan SOLO como referencia para una comprobación aleatoria de 20 entradas.
"""

from __future__ import annotations

import argparse
import glob
import json
import random
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from PIL import Image

# ─── Rutas y constantes ──────────────────────────────────────────────────────

CATALOG_DIR = Path(__file__).resolve().parent          # Backend/catalog
BACKEND_DIR = CATALOG_DIR.parent                       # Backend
OUTPUT_JSON = CATALOG_DIR / "products.json"

DEFAULT_PDF_DIR = Path("/home/arch-tarok/Documentos/JKMobiliario")
DEFAULT_IMAGES_DIR = Path("/tmp/opencode/catalog-images")
DEFAULT_REFERENCE_DIR = Path("/tmp/opencode/catalogs")

LOGO_SIZE = (358, 291)          # logo de la portada/pie presente en todas las páginas
IMAGE_MAX_WIDTH = 1600
JPEG_QUALITY = 85

# Stoplist exacta indicada por el cliente (cabeceras, pies y notas).
STOPLIST = {
    "CAMAS",
    "COMEDORES",
    "MESAS DE CENTRO",
    "MESAS DE NOCHE",
    "LUXURY",
    "SILLAS DE BARRA",
    "SILLAS AUXILIARES",
    "MINIMALISTA",
    "MODERNO",
    "SOFÁS MINIMALISTAS",
    "SOFÁS MODERNOS",
    "20",
    "26",
    "Carrera 52#7sur -22",
    "Mall providencia",
    "Avenida Guayabal",
    "Medellín",
    "jkmobiliario_",
    "324 669 2370",
    "+57 324 669 2370",
    "SE FABRICAN A LA MEDIDA",
    "NO INCLUYE EL DIVÁN",
    "UNIDAD",
}

# Notas del catálogo -> texto normalizado para `notes`/`description`.
NOTE_MAP = {
    "SE FABRICAN A LA MEDIDA": "Se fabrican a la medida",
    "NO INCLUYE EL DIVÁN": "No incluye el diván",
    "UNIDAD": "Precio por unidad",
}

# Correcciones explícitas de anomalías conocidas de los PDFs.
TITLE_FIXES = {
    "SOFÁ SOFÁ LETICIA": "SOFÁ LETICIA",
    "ESQUINEO DOS L": "ESQUINERO DOS L",
}

# Overrides explícitos de precios ambiguos (grupo final de 2 dígitos).
# Clave: (slug de catálogo, nombre Title Case, tamaño o None para productos simples).
PRICE_OVERRIDES: dict[tuple[str, str, Optional[str]], int] = {
    ("comedores", "Comedor Thane", "8 Asientos"): 8_590_000,
}

PRICE_RE = re.compile(r"^\$?\s*\d[\d.,]*$")
SIZE_BED_RE = re.compile(r"^\d{1,2}[.,]\d{1,2}\s*[xX×]\s*\d{1,2}[.,]\d{1,2}$")
SIZE_DINING_RE = re.compile(r"^(\d+)\s+ASIENTOS$", re.IGNORECASE)
HAS_LETTER_RE = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]")

# Partículas que van en minúscula dentro del Title Case (excepto la primera
# palabra y excepto letras sueltas como la "U" de "Sofá U Amapola").
PARTICLES = {"de", "del", "la", "las", "los", "y", "u", "x"}


@dataclass
class Catalog:
    slug: str
    category: str
    linea: str
    kind: str            # "bed" | "dining" | "simple"
    expected: int
    keywords: tuple[str, ...]
    reference_index: int  # 1..10 -> /tmp/opencode/catalogs/XX.txt
    pdf: Optional[Path] = None
    pdf_name: str = ""


# Nombres EXACTOS exigidos por el cliente (deben coincidir con los PDFs).
# `category` es el valor persistido en Mongo/API; `linea` es el mismo nombre
# legible usado en la generación de descripciones. Se mantienen idénticos para
# que ambos queden alineados con las categorías de los catálogos físicos.
CATALOGS: list[Catalog] = [
    Catalog("camas-minimalistas", "Camas Minimalistas", "Camas Minimalistas", "bed", 10, ("camas", "minimalista"), 1),
    Catalog("camas-modernas", "Camas Modernas", "Camas Modernas", "bed", 10, ("camas", "modernas"), 2),
    Catalog("comedores", "Comedores", "Comedores", "dining", 12, ("comedores",), 3),
    Catalog("mesas-de-centro", "Mesas de Centro", "Mesas de Centro", "simple", 14, ("mesas de centro",), 4),
    Catalog("mesas-de-noche", "Mesas de Noche", "Mesas de Noche", "simple", 10, ("mesas de noche",), 5),
    Catalog("sillas-de-barra", "Sillas de Barra", "Sillas de Barra", "simple", 12, ("sillas de barra",), 6),
    Catalog("sillas-minimalistas", "Sillas Minimalistas", "Sillas Minimalistas", "simple", 10, ("sillas", "minimalista"), 7),
    Catalog("sillas-modernas", "Sillas Modernas", "Sillas Modernas", "simple", 10, ("sillas", "modernas"), 8),
    Catalog("sofas-minimalistas", "Sofás Minimalistas", "Sofás Minimalistas", "simple", 28, ("sofas", "minimalistas"), 9),
    Catalog("sofas-modernos", "Sofás Modernos", "Sofás Modernos", "simple", 28, ("sofas", "modernos"), 10),
]


# ─── Utilidades ──────────────────────────────────────────────────────────────

class ManifestError(RuntimeError):
    """Error fatal del pipeline: no se debe continuar con datos dudosos."""


def ascii_fold(text: str) -> str:
    """minúsculas sin acentos, para comparar nombres de archivo con Unicode."""
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn").lower()


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True, check=check)


def pdf_page_count(pdf: Path) -> int:
    out = run(["pdfinfo", str(pdf)]).stdout
    match = re.search(r"^Pages:\s+(\d+)", out, re.MULTILINE)
    if not match:
        raise ManifestError(f"No se pudo leer el número de páginas de {pdf}")
    return int(match.group(1))


def page_text(pdf: Path, page: int) -> str:
    """Extrae el texto de UNA página con el layout original."""
    result = run(["pdftotext", "-f", str(page), "-l", str(page), "-layout", str(pdf), "-"])
    return result.stdout


def normalize_line(raw: str) -> str:
    return " ".join(raw.split())


# ─── Parseo de texto ─────────────────────────────────────────────────────────

def parse_price(raw: str) -> tuple[int, list[str]]:
    """Devuelve (valor COP entero, warnings). No adivina: reporta anomalías."""
    warnings: list[str] = []
    cleaned = raw.replace("$", "").replace(" ", "").strip()
    groups = cleaned.split(".")
    if not all(g.isdigit() for g in groups):
        raise ManifestError(f"Precio no numérico: {raw!r}")

    value = int("".join(groups))
    if len(groups) > 1 and len(groups[-1]) != 3:
        warnings.append(f"precio ambiguo {raw!r} (grupo final de {len(groups[-1])} dígitos) -> {value}")
    if len(groups) > 1 and len(groups[0]) > 3:
        warnings.append(f"precio sin separador de miles {raw!r} -> {value}")
    return value, warnings


def parse_size(line: str, kind: str) -> Optional[str]:
    if kind == "bed" and SIZE_BED_RE.match(line):
        # Normaliza espacios y usa "X" mayúscula, conservando los valores.
        parts = re.split(r"[xX×]", line)
        return f"{parts[0].strip()} X {parts[1].strip()}"
    if kind == "dining":
        match = SIZE_DINING_RE.match(line)
        if match:
            return f"{match.group(1)} Asientos"
    return None


def is_title_line(line: str) -> bool:
    return bool(HAS_LETTER_RE.search(line)) and line == line.upper()


def title_case(raw: str) -> str:
    words = raw.split()
    out: list[str] = []
    for index, word in enumerate(words):
        lower = word.lower()
        if index > 0 and lower in PARTICLES and len(word) > 1:
            out.append(lower)
        else:
            out.append(word[:1].upper() + word[1:].lower())
    return " ".join(out)


def fix_title(raw: str) -> str:
    return TITLE_FIXES.get(raw, raw)


@dataclass
class ParsedProduct:
    raw_title: str
    name: str
    sizes: list[str] = field(default_factory=list)
    pairs: list[tuple[str, int]] = field(default_factory=list)   # (size, price) para camas/comedores
    prices: list[int] = field(default_factory=list)              # precios sueltos (resto)
    notes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def parse_page_products(text: str, catalog: Catalog) -> list[ParsedProduct]:
    """Convierte el texto de una página en exactamente 2 productos."""
    products: list[ParsedProduct] = []
    current: Optional[ParsedProduct] = None

    def start_new(title_line: str) -> None:
        nonlocal current
        current = ParsedProduct(raw_title=title_line, name="")

    for raw_line in text.splitlines():
        line = normalize_line(raw_line)
        if not line:
            continue

        # Notas del catálogo (van asociadas al producto en curso).
        if line in NOTE_MAP:
            if current is None:
                raise ManifestError(f"Nota sin producto en curso: {line!r}")
            current.notes.append(NOTE_MAP[line])
            continue

        # Stoplist de cabeceras/pies.
        if line in STOPLIST or line.startswith("CATÁLOGO"):
            continue

        # Tamaños (camas / comedores).
        size = parse_size(line, catalog.kind)
        if size is not None:
            if current is None:
                raise ManifestError(f"Tamaño sin producto en curso: {line!r}")
            current.sizes.append(size)
            continue

        # Precios.
        if PRICE_RE.match(line):
            if current is None:
                raise ManifestError(f"Precio sin producto en curso: {line!r}")
            value, warnings = parse_price(line)
            current.prices.append(value)
            current.warnings.extend(warnings)
            continue

        # Título: una o más líneas en mayúsculas consecutivas.
        if is_title_line(line):
            if current is None or current.prices or current.sizes:
                if current is not None:
                    products.append(current)
                start_new(line)
            else:
                current.raw_title += " " + line
            continue

        raise ManifestError(f"Línea no reconocida en {catalog.slug}: {line!r}")

    if current is not None:
        products.append(current)

    # Cierra nombres y valida estructura por producto.
    for product in products:
        raw = fix_title(normalize_line(product.raw_title))
        product.raw_title = raw
        product.name = title_case(raw)

        if catalog.kind in ("bed", "dining"):
            if len(product.sizes) != len(product.prices):
                raise ManifestError(
                    f"{catalog.slug}: {product.name} tiene {len(product.sizes)} tamaños "
                    f"y {len(product.prices)} precios"
                )
            if len(product.sizes) != 3:
                raise ManifestError(
                    f"{catalog.slug}: {product.name} tiene {len(product.sizes)} bloques "
                    f"(se esperaban 3)"
                )
            product.pairs = list(zip(product.sizes, product.prices))
        else:
            if len(product.prices) != 1:
                raise ManifestError(
                    f"{catalog.slug}: {product.name} tiene {len(product.prices)} precios "
                    f"(se esperaba 1)"
                )

    return products


# ─── Imágenes ────────────────────────────────────────────────────────────────

@dataclass
class ImageRow:
    index: int      # posición en el orden de extracción de pdfimages
    width: int
    height: int

    @property
    def is_logo(self) -> bool:
        return (self.width, self.height) == LOGO_SIZE


def list_page_images(pdf: Path, page: int) -> list[ImageRow]:
    out = run(["pdfimages", "-list", "-f", str(page), "-l", str(page), str(pdf)]).stdout
    rows: list[ImageRow] = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 10 and parts[0].isdigit() and parts[2] == "image":
            rows.append(ImageRow(index=len(rows), width=int(parts[3]), height=int(parts[4])))
    return rows


def image_tops_from_pdftohtml(pdf: Path, page: int) -> Optional[list[float]]:
    """Coordenadas `top` de las imágenes de la página, en orden de aparición.

    Se usa para verificar que el orden de pdfimages es superior->inferior.
    Devuelve None si pdftohtml no está disponible (no es un requisito duro).
    """
    if shutil.which("pdftohtml") is None:
        return None
    result = run(["pdftohtml", "-xml", "-f", str(page), "-l", str(page), "-stdout", str(pdf)], check=False)
    if result.returncode != 0 or not result.stdout.strip():
        return None
    try:
        root = ET.fromstring(result.stdout)
    except ET.ParseError:
        return None
    return [float(img.get("top", "0")) for img in root.iter("image")]


def extract_page_images(
    pdf: Path,
    page: int,
    catalog: Catalog,
    images_dir: Path,
    warnings: list[str],
) -> list[Path]:
    """Extrae, redimensiona y guarda las 2 imágenes de producto de la página.

    Devuelve las rutas en orden de listado (producto superior, luego inferior).
    """
    rows = list_page_images(pdf, page)
    product_rows = [row for row in rows if not row.is_logo]
    if len(product_rows) != 2:
        raise ManifestError(
            f"{catalog.slug} p{page}: se esperaban 2 imágenes de producto y hay "
            f"{len(product_rows)} (total en página: {len(rows)}). Se detiene el pipeline."
        )

    # Verificación de orden: pdfimages extrae en orden de contenido; pdftohtml
    # confirma que ese orden es superior->inferior en la página.
    tops = image_tops_from_pdftohtml(pdf, page)
    if tops is not None and len(tops) == len(rows):
        product_tops = [tops[row.index] for row in product_rows]
        if product_tops[0] > product_tops[1]:
            warnings.append(
                f"{catalog.slug} p{page}: el orden de pdfimages no es superior->inferior "
                f"(tops={product_tops}); se ordena por coordenada vertical."
            )
            product_rows = sorted(product_rows, key=lambda row: tops[row.index])
    elif tops is not None:
        warnings.append(f"{catalog.slug} p{page}: no se pudo verificar el orden con pdftohtml")

    with tempfile.TemporaryDirectory(prefix="jk-pdfimages-") as tmp:
        root = str(Path(tmp) / "img")
        run(["pdfimages", "-f", str(page), "-l", str(page), "-png", str(pdf), root])

        saved: list[Path] = []
        for position, row in enumerate(product_rows, start=1):
            source = Path(tmp) / f"img-{row.index:03d}.png"
            if not source.exists():
                raise ManifestError(f"{catalog.slug} p{page}: no existe {source.name} tras pdfimages")

            dest_dir = images_dir / catalog.slug
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"p{page:02d}-{position}.jpg"

            image = Image.open(source)
            image.load()
            if image.mode != "RGB":
                image = image.convert("RGB")
            if image.width > IMAGE_MAX_WIDTH:
                new_height = round(image.height * IMAGE_MAX_WIDTH / image.width)
                image = image.resize((IMAGE_MAX_WIDTH, new_height), Image.LANCZOS)
            # `exif=b""` + imagen nueva => sin metadatos en el JPEG final.
            image.save(dest, format="JPEG", quality=JPEG_QUALITY, optimize=True, exif=b"")

            saved.append(dest)
        return saved


# ─── Construcción del manifiesto ─────────────────────────────────────────────

def build_description(name: str, catalog: Catalog, notes: list[str], pairs: list[tuple[str, int]]) -> str:
    parts = [f"{name} — catálogo {catalog.linea} 2026."]
    parts.extend(f"{note}." for note in notes)
    if pairs:
        detalles = " · ".join(f"{size} ${price:,}".replace(",", ".") for size, price in pairs)
        parts.append(f"Medidas y precios: {detalles}.")
    description = " ".join(parts)
    if len(description) > 2000:
        description = description[:1997] + "..."
    return description


def build_dimensions(catalog: Catalog, sizes: list[str]) -> str:
    if catalog.kind == "bed":
        return " · ".join(f"{size.replace(' X ', ' × ')} m" for size in sizes)
    if catalog.kind == "dining":
        counts = [size.split()[0] for size in sizes]
        if len(counts) == 3:
            return f"{counts[0]}, {counts[1]} u {counts[2]} asientos"
        return f"{', '.join(counts)} asientos"
    return "Consultar"


def resolve_pdfs(pdf_dir: Path) -> None:
    pdfs = [Path(p) for p in glob.glob(str(pdf_dir / "*.pdf"))]
    if not pdfs:
        raise ManifestError(f"No se encontraron PDFs en {pdf_dir}")
    for catalog in CATALOGS:
        matches = [p for p in pdfs if all(k in ascii_fold(p.name) for k in catalog.keywords)]
        if len(matches) != 1:
            raise ManifestError(
                f"Catálogo {catalog.slug}: se esperaba 1 PDF con {catalog.keywords} "
                f"y se encontraron {[p.name for p in matches]}"
            )
        catalog.pdf = matches[0]
        catalog.pdf_name = matches[0].name


def build_catalog(catalog: Catalog, images_dir: Path, skip_images: bool, warnings: list[str]) -> list[dict]:
    assert catalog.pdf is not None
    total_pages = pdf_page_count(catalog.pdf)
    content_pages = total_pages - 1  # 1 portada
    if content_pages * 2 != catalog.expected:
        raise ManifestError(
            f"{catalog.slug}: {content_pages} páginas de contenido x2 != {catalog.expected} esperados"
        )

    products: list[dict] = []
    for page in range(2, total_pages + 1):
        parsed = parse_page_products(page_text(catalog.pdf, page), catalog)
        if len(parsed) != 2:
            raise ManifestError(
                f"{catalog.slug} p{page}: se esperaban 2 productos y se parsearon {len(parsed)}"
            )
        if not skip_images:
            extract_page_images(catalog.pdf, page, catalog, images_dir, warnings)

        for position, product in enumerate(parsed, start=1):
            index = len(products) + 1
            entry_warnings = list(product.warnings)

            if catalog.kind in ("bed", "dining"):
                pairs = product.pairs
                sizes = product.sizes
                variants = [
                    {"size": size, "price": price, "stock": 1} for size, price in pairs
                ]
                final_price = min(price for _, price in pairs)
            else:
                pairs = []
                sizes = []
                variants = []
                final_price = product.prices[0]

            # Overrides explícitos de precios ambiguos.
            override_key = (catalog.slug, product.name, None)
            if override_key in PRICE_OVERRIDES:
                final_price = PRICE_OVERRIDES[override_key]
                entry_warnings.append(
                    f"override aplicado para {product.name!r}: {final_price}"
                )
            else:
                for variant in variants:
                    key = (catalog.slug, product.name, variant["size"])
                    if key in PRICE_OVERRIDES:
                        entry_warnings.append(
                            f"override aplicado para {product.name!r} {variant['size']}: "
                            f"{variant['price']} -> {PRICE_OVERRIDES[key]}"
                        )
                        variant["price"] = PRICE_OVERRIDES[key]
                if variants:
                    final_price = min(variant["price"] for variant in variants)

            if entry_warnings:
                warnings.extend(f"{catalog.slug}: {w}" for w in entry_warnings)

            # La descripción usa los precios YA corregidos por los overrides.
            pairs_for_description = [(v["size"], v["price"]) for v in variants] if variants else pairs

            products.append(
                {
                    "id": f"{catalog.slug}-{index:02d}",
                    "name": product.name,
                    "category": catalog.category,
                    "linea": catalog.linea,
                    "description": build_description(
                        product.name, catalog, product.notes, pairs_for_description
                    ),
                    "dimensions": build_dimensions(catalog, sizes),
                    "price": final_price,
                    "stock": 1,
                    "sizes": sizes,
                    "colors": [],
                    "variants": variants,
                    "notes": product.notes,
                    "image": f"{catalog.slug}/p{page:02d}-{position}.jpg",
                    "pdf": catalog.pdf_name,
                    "page": page,
                    "modelFile": None,
                    "medidasBase": None,
                }
            )

    if len(products) != catalog.expected:
        raise ManifestError(
            f"{catalog.slug}: se generaron {len(products)} productos (esperados {catalog.expected})"
        )
    return products


# ─── Verificación contra textos de referencia ────────────────────────────────

def reference_text(catalog: Catalog, reference_dir: Path) -> Optional[str]:
    path = reference_dir / f"{catalog.reference_index:02d}.txt"
    if not path.exists():
        return None
    text = ascii_fold(path.read_text(encoding="utf-8"))
    # Los títulos pueden venir partidos en varias líneas: se normaliza el
    # espaciado para poder buscar "MESA DE NOCHE ITALIA" como una sola cadena.
    return re.sub(r"\s+", " ", text)


def check_against_references(products: list[dict], reference_dir: Path, seed: int = 20260918) -> bool:
    by_slug = {c.slug: c for c in CATALOGS}
    sample = random.Random(seed).sample(products, min(20, len(products)))
    ok = True
    print("\n── Verificación de 20 entradas al azar contra /tmp/opencode/catalogs ──")
    for entry in sample:
        catalog = by_slug[entry["id"].rsplit("-", 1)[0]]
        reference = reference_text(catalog, reference_dir)
        if reference is None:
            print(f"  [skip] {entry['id']}: sin referencia {catalog.reference_index:02d}.txt")
            continue

        raw_title = ascii_fold(entry["name"].upper())
        # El título puede venir partido en líneas en el PDF: se comprueba contra
        # el texto de referencia normalizado a espacios simples.
        title_found = raw_title in reference
        # Los precios del manifiesto formateados con puntos deben aparecer.
        price_found = all(
            f"{v:,}".replace(",", ".") in reference
            for v in ([variant["price"] for variant in entry["variants"]] or [entry["price"]])
        )
        status = "OK" if (title_found and price_found) else "FALLA"
        if not (title_found and price_found):
            ok = False
        detail = f"título={'sí' if title_found else 'no'} precio={'sí' if price_found else 'no'}"
        print(f"  [{status}] {entry['id']:<28} {entry['name']:<26} {detail}")
    return ok


def report_collisions(products: list[dict]) -> list[str]:
    seen: dict[tuple[str, str], list[str]] = {}
    for entry in products:
        key = (entry["name"], entry["category"])
        seen.setdefault(key, []).append(entry["id"])
    return [f"{name!r} [{category}]: {ids}" for (name, category), ids in seen.items() if len(ids) > 1]


# ─── main ────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Genera Backend/catalog/products.json")
    parser.add_argument("--pdf-dir", type=Path, default=DEFAULT_PDF_DIR)
    parser.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR)
    parser.add_argument("--reference-dir", type=Path, default=DEFAULT_REFERENCE_DIR)
    parser.add_argument("--skip-images", action="store_true", help="No extrae imágenes (solo desarrollo)")
    parser.add_argument("--output", type=Path, default=OUTPUT_JSON)
    args = parser.parse_args()

    warnings: list[str] = []
    resolve_pdfs(args.pdf_dir)

    all_products: list[dict] = []
    for catalog in CATALOGS:
        products = build_catalog(catalog, args.images_dir, args.skip_images, warnings)
        all_products.extend(products)

        print(f"\n=== {catalog.slug} ({catalog.category}) — {len(products)} productos ===")
        print(f"    PDF: {catalog.pdf_name} | páginas de contenido: {len(products) // 2}")
        for example in products[:3]:
            variant_txt = (
                ", ".join(f"{v['size']}=${v['price']:,}".replace(",", ".") for v in example["variants"])
                or "sin variantes"
            )
            print(f"    - {example['id']:<28} {example['name']:<26} "
                  f"${example['price']:,}".replace(",", ".") + f"  [{variant_txt}]")

    total_expected = sum(c.expected for c in CATALOGS)
    if len(all_products) != total_expected:
        raise ManifestError(f"Total {len(all_products)} != {total_expected} esperados")

    collisions = report_collisions(all_products)
    print(f"\n── Colisiones name+category detectadas: {len(collisions)} ──")
    for collision in collisions:
        print(f"  * {collision}")

    print(f"\n── Warnings ({len(warnings)}) ──")
    for warning in warnings:
        print(f"  * {warning}")

    if not args.skip_images:
        missing = [e["image"] for e in all_products if not (args.images_dir / e["image"]).exists()]
        if missing:
            raise ManifestError(f"Faltan {len(missing)} imágenes referenciadas: {missing[:5]}")

    references_ok = check_against_references(all_products, args.reference_dir)

    manifest = {
        "schemaVersion": 1,
        "sourcePdfDir": str(args.pdf_dir),
        "totalProducts": len(all_products),
        "warnings": warnings,
        "collisions": collisions,
        "products": all_products,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nManifiesto escrito: {args.output} ({len(all_products)} productos)")

    if not references_ok:
        print("ERROR: la verificación contra los textos de referencia falló.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ManifestError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
