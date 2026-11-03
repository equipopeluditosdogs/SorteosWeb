"""Mete la carpeta extension/ dentro de index.html como ZIP descargable.
Ejecutar tras cualquier cambio en la extensión:  python empaquetar-extension.py"""
import base64, io, os, re, zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.join(AQUI, "extension")
ARCHIVOS = ["manifest.json", "background.js", "instagram.js", "instagram-main.js", "puente.js"]

buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    for nombre in ARCHIVOS:
        z.write(os.path.join(CARPETA, nombre), "extension/" + nombre)  # rutas con "/" para que descomprima bien en cualquier sistema
b64 = base64.b64encode(buf.getvalue()).decode()

ruta = os.path.join(AQUI, "index.html")
html = open(ruta, encoding="utf-8").read()
nuevo, n = re.subn(r'const EXT_ZIP = "[^"]*";', lambda m: 'const EXT_ZIP = "' + b64 + '";', html, count=1)
if n != 1:
    raise SystemExit("No encuentro 'const EXT_ZIP' en index.html")
open(ruta, "w", encoding="utf-8").write(nuevo)
print("ZIP incrustado:", len(buf.getvalue()), "bytes")
