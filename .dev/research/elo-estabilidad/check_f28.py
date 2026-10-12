# Recálculo independiente de F28 (iter-12, T03) y métricas de estabilidad (AC8, AC9).
import json, statistics as st
from collections import defaultdict
from elo import *
h=run_f28()
NAMES_LG=[n for _,n in LEAGUES]
final={m:dict(rating=round(H[-1]["after"],4),league=NAMES_LG[H[-1]["league"]],streak=H[-1]["streak"],games=len(H)) for m,H in h.items()}
print(json.dumps({NAMES[m]:v for m,v in sorted(final.items())},ensure_ascii=False,indent=1))
SINCE="2026-09-01"
chg=[];rng=[]
for m,H in h.items():
    byd=defaultdict(list)
    for i,x in enumerate(H): byd[x["day"]].append(i)
    for d,idx in byd.items():
        if d<SINCE or len(idx)<10: continue
        prev=H[idx[0]-1]["league"] if idx[0]>0 else league_idx(1500)
        lg=[prev]+[H[i]["league"] for i in idx]
        chg.append(sum(a!=b for a,b in zip(lg,lg[1:])))
        vs=[H[idx[0]]["before"]]+[H[i]["after"] for i in idx]; rng.append(max(vs)-min(vs))
print("dias-jugador>=10:",len(chg),"cambios de liga/dia: mediana",st.median(chg),"media",round(st.mean(chg),2),"| rango dia mediana",round(st.median(rng)))
print("inflacion",round(st.mean(H[-1]["after"] for H in h.values())-1500,1))
