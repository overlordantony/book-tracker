"""
generar-temas.py — deriva las variantes Oscuro / Claro / Sepia de cada paleta
y escribe css/temas.css + js/paletas.js (única fuente de verdad: la lista PALETAS).

Uso:  python3 tools/generar-temas.py [--informe]
Para añadir una paleta: agrega un dict a PALETAS (5 colores de oscuro a claro
+ índice del color de acento) y vuelve a ejecutar.
"""
import math, json, sys, pathlib

PALETAS = [
    dict(id="velvet", nombre="Velvet Plum", seeds=["#F4EAF2", "#9B709F", "#633A78", "#3B174D", "#B9955B"], acento=2),
    dict(id="viridian", nombre="Viridian Elegance", seeds=["#EAF2EF", "#6DA68F", "#2A6F57", "#13382B", "#D4AF37"], acento=2),
    dict(id="midnight", nombre="Midnight Sapphire", seeds=["#E6ECF2", "#6382A6", "#224A75", "#0E243F", "#E5C158"], acento=2),
    dict(id="burgundy", nombre="Burgundy Noir",     seeds=["#F5ECEC", "#A36B6B", "#632626", "#361111", "#D4AF37"], acento=2),
    dict(id="emerald", nombre="Emerald Bloom", seeds=["#F2EBDD", "#78947F", "#185844", "#102F27", "#B08A4F"], acento=2)
]

# ----------------------------------------------------------------- color
def srgb_to_lin(c): return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def lin_to_srgb(c): return 12.92*c if c<=0.0031308 else 1.055*(c**(1/2.4))-0.055

def hex_to_rgb(h):
    h=h.lstrip("#"); return [int(h[i:i+2],16)/255 for i in (0,2,4)]

def rgb_to_oklab(r,g,b):
    r,g,b=map(srgb_to_lin,(r,g,b))
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b
    m=0.2119034982*r+0.6806995451*g+0.1073969566*b
    s=0.0883024619*r+0.2817188376*g+0.6299787005*b
    l,m,s=l**(1/3),m**(1/3),s**(1/3)
    return (0.2104542553*l+0.7936177850*m-0.0040720468*s,
            1.9779984951*l-2.4285922050*m+0.4505937099*s,
            0.0259040371*l+0.7827717662*m-0.8086757660*s)

def oklab_to_lin(L,a,b):
    l=(L+0.3963377774*a+0.2158037573*b)**3
    m=(L-0.1055613458*a-0.0638541728*b)**3
    s=(L-0.0894841775*a-1.2914855480*b)**3
    return (4.0767416621*l-3.3077115913*m+0.2309699292*s,
           -1.2684380046*l+2.6097574011*m-0.3413193965*s,
           -0.0041960863*l-0.7034186147*m+1.7076147010*s)

def hex_to_oklch(h):
    L,a,b=rgb_to_oklab(*hex_to_rgb(h))
    return L, math.hypot(a,b), math.degrees(math.atan2(b,a))%360

def oklch_to_hex(L,C,H):
    # mapeo de gamut: reduce croma hasta caber en sRGB
    lo,hi=0.0,C
    def conv(c):
        a,b=c*math.cos(math.radians(H)),c*math.sin(math.radians(H))
        return oklab_to_lin(L,a,b)
    lin=conv(C)
    if not all(-1e-4<=x<=1+1e-4 for x in lin):
        for _ in range(30):
            mid=(lo+hi)/2
            if all(-1e-4<=x<=1+1e-4 for x in conv(mid)): lo=mid
            else: hi=mid
        lin=conv(lo)
    return "#%02X%02X%02X"%tuple(round(max(0,min(1,lin_to_srgb(max(0,min(1,x)))))*255) for x in lin)

def lum(h):
    r,g,b=map(srgb_to_lin,hex_to_rgb(h)); return 0.2126*r+0.7152*g+0.0722*b
def contraste(a,b):
    la,lb=sorted((lum(a),lum(b)),reverse=True); return (la+0.05)/(lb+0.05)

def hue_mix(h1,h2,t):  # ruta corta
    d=((h2-h1+180)%360)-180; return (h1+d*t)%360

def con_contraste(L,C,H,contra,minimo,direccion):
    """mueve L en 'direccion' (+1 más claro, -1 más oscuro) hasta cumplir 'minimo' frente a todos los hex de 'contra'."""
    for _ in range(80):
        hx=oklch_to_hex(L,C,H)
        if all(contraste(hx,c)>=minimo for c in contra): return hx
        L=max(0,min(1,L+0.005*direccion))
    return hx

def rgba(hx,a):
    r,g,b=[round(x*255) for x in hex_to_rgb(hx)]; return f"rgba({r},{g},{b},{a})"

# ----------------------------------------------------------------- derivación
def derivar(p, modo):
    s=[hex_to_oklch(x) for x in p["seeds"]]
    Lc,Cc,Hc=s[p["acento"]]
    Cac=min(max(Cc,0.075),0.15)             # vibrancia mínima/máxima del acento
    H0=s[0][2]; C0=min(max(s[0][1],0.014),0.04)
    t={}
    if modo=="dark":
        t["bg"]        =oklch_to_hex(0.175,C0,H0)
        t["superficie"]=oklch_to_hex(0.215,C0,H0)
        t["superficie-2"]=oklch_to_hex(0.260,C0,H0)
        t["linea"]     =oklch_to_hex(0.330,C0*0.9,H0)
        t["texto"]     =oklch_to_hex(0.945,0.012,s[4][2])
        t["muted"]     =con_contraste(0.70,0.025,H0,[t["bg"],t["superficie-2"]],4.6,+1)
        t["accent"]    =con_contraste(max(Lc,0.60),Cac,Hc,[t["bg"],t["superficie-2"]],4.6,+1)
        t["on-accent"] =t["bg"]
        t["accent-hover"]=oklch_to_hex(min(hex_to_oklch(t["accent"])[0]+0.06,0.92),Cac,Hc)
        t["accent-suave"]=rgba(t["accent"],.16)
        t["verde"],t["vino"],t["oro"]="#3BB582","#E2574C","#E8B339"
        sh=f"0 8px 24px rgba(0,0,0,.38)"
    elif modo=="light":
        Hn=Hc; Cn=0.012
        t["bg"]        =oklch_to_hex(0.965,Cn,Hn)
        t["superficie"]=oklch_to_hex(0.995,0.004,Hn)
        t["superficie-2"]=oklch_to_hex(0.935,Cn*1.2,Hn)
        t["linea"]     =oklch_to_hex(0.870,Cn*1.4,Hn)
        t["texto"]     =oklch_to_hex(0.215,0.03,H0)
        t["muted"]     =con_contraste(0.52,0.03,Hn,[t["bg"],t["superficie-2"]],4.6,-1)
        t["accent"]    =con_contraste(min(Lc,0.55),Cac,Hc,[t["bg"],t["superficie-2"],"#FFFFFF"],4.6,-1)
        t["on-accent"] ="#FFFFFF"
        t["accent-hover"]=oklch_to_hex(max(hex_to_oklch(t["accent"])[0]-0.06,0.2),Cac,Hc)
        t["accent-suave"]=rgba(t["accent"],.10)
        t["verde"],t["vino"],t["oro"]="#1F8F63","#C43D33","#B5791A"
        sh=f"0 8px 24px {rgba(oklch_to_hex(0.25,0.04,H0),.14)}"
    else:  # sepia: papel cálido que "hereda" parte del matiz de la paleta
        Hp=hue_mix(75,Hc,0.28)
        t["bg"]        =oklch_to_hex(0.945,0.035,Hp)
        t["superficie"]=oklch_to_hex(0.965,0.030,Hp)
        t["superficie-2"]=oklch_to_hex(0.915,0.040,Hp)
        t["linea"]     =oklch_to_hex(0.840,0.050,Hp)
        t["texto"]     =oklch_to_hex(0.310,0.045,hue_mix(60,Hc,0.15))
        t["muted"]     =con_contraste(0.52,0.04,Hp,[t["bg"],t["superficie-2"]],4.6,-1)
        t["accent"]    =con_contraste(min(Lc,0.52),Cac*0.9,Hc,[t["bg"],t["superficie-2"],t["superficie"]],4.6,-1)
        t["on-accent"] =oklch_to_hex(0.975,0.02,Hp)
        # el acento también debe contrastar con su texto
        if contraste(t["accent"],t["on-accent"])<4.5:
            t["accent"]=con_contraste(hex_to_oklch(t["accent"])[0],Cac*0.9,Hc,[t["bg"],t["on-accent"]],4.6,-1)
        t["accent-hover"]=oklch_to_hex(max(hex_to_oklch(t["accent"])[0]-0.06,0.2),Cac*0.9,Hc)
        t["accent-suave"]=rgba(t["accent"],.14)
        t["verde"],t["vino"],t["oro"]="#3F7A4F","#A8402F","#8F6410"
        sh=f"0 8px 24px {rgba(oklch_to_hex(0.30,0.05,60),.20)}"
    t["verde-suave"]=rgba(t["verde"],.16 if modo=="dark" else .12)
    t["vino-suave"] =rgba(t["vino"], .16 if modo=="dark" else .12)
    t["sombra"]=sh
    return t

ORDEN=["bg","superficie","superficie-2","texto","muted","linea","accent","accent-hover","accent-suave",
       "on-accent","verde","verde-suave","vino","vino-suave","oro","sombra"]
MODOS=[("dark","Oscuro"),("light","Claro"),("sepia","Sepia")]

def main():
    raiz=pathlib.Path(__file__).resolve().parent.parent
    css=["/* temas.css — GENERADO por tools/generar-temas.py. No editar a mano: edita PALETAS y vuelve a generar.\n"
         "   Estructura:  :root[data-palette=\"<id>\"][data-theme=\"dark|light|sepia\"]  →  tokens --t-*\n"
         "   Los tokens --t-* se mapean a los nombres que ya usa la bitácora (--bg, --texto…) y el lector (--fg, --pan…)\n"
         "   en styles.css y lector/main.css. */\n"]
    informe=[]
    for p in PALETAS:
        for m,nm in MODOS:
            t=derivar(p,m)
            sel=f':root[data-palette="{p["id"]}"][data-theme="{m}"]'
            if p["id"]=="viridian" and m=="dark":
                sel=':root,\n'+sel   # valor por defecto si aún no hay atributos (sin JS / antes del init)
            css.append(f"/* {p['nombre']} · {nm} */\n{sel}{{\n  color-scheme:{'dark' if m=='dark' else 'light'};\n"+
                       "".join(f"  --t-{k}:{t[k]};\n" for k in ORDEN)+"}\n")
            informe.append((p["nombre"],nm,t))
    (raiz/"css").mkdir(exist_ok=True); (raiz/"js").mkdir(exist_ok=True)
    (raiz/"css/temas.css").write_text("\n".join(css),encoding="utf-8")

    reg=[]
    for p in PALETAS:
        reg.append(dict(id=p["id"],nombre=p["nombre"],
            muestras={m:[derivar(p,m)[k] for k in ("bg","superficie-2","accent","texto")] for m,_ in MODOS}))
    js=("// paletas.js — GENERADO por tools/generar-temas.py. 'muestras' = [fondo, superficie, acento, texto] por modo.\n"
        "export const PALETA_POR_DEFECTO = 'viridian';\nexport const MODO_POR_DEFECTO = 'dark';\n"
        "export const PALETAS = "+json.dumps(reg,ensure_ascii=False,indent=2)+";\n")
    (raiz/"js/paletas.js").write_text(js,encoding="utf-8")

    if "--informe" in sys.argv:
        print(f"{'paleta':16}{'modo':8}{'texto/bg':>9}{'muted/bg':>9}{'acento/bg':>10}{'on-acc/acento':>14}")
        for n,m,t in informe:
            print(f"{n:16}{m:8}{contraste(t['texto'],t['bg']):9.1f}{contraste(t['muted'],t['bg']):9.1f}"
                  f"{contraste(t['accent'],t['bg']):10.1f}{contraste(t['on-accent'],t['accent']):14.1f}")

if __name__=="__main__": main()
