from elo import *
import math
P=(25,12,2,-5,-15,-19)
SINCE="2026-09-01"
def leaguefn(width,base=1480):
    def f(r):
        r=round(r); i=math.floor((r-base)/width); return max(-2,min(3,i))
    return f
def metrics(h,lf=None,display=None):
    lf=lf or league
    rngs=[];chg=[];nleag=[];dayend=defaultdict(list)
    for m,H in h.items():
        vals_all=[1500]+[x["after"] for x in H]
        disp=display(vals_all) if display else vals_all
        byd=defaultdict(list)
        for i,x in enumerate(H): byd[x["day"]].append(i+1)
        for d,idx in byd.items():
            if d<SINCE: continue
            vs=[disp[idx[0]-1]]+[disp[i] for i in idx]
            dayend[m].append(vs[-1])
            if len(idx)>=10:
                rngs.append(max(vs)-min(vs))
                lg=[lf(v) for v in vs]
                chg.append(sum(a!=b for a,b in zip(lg,lg[1:]))); nleag.append(len(set(lg)))
    noise=st.median(st.pstdev(v) for v in dayend.values())
    final={NAMES[m]:round(H[-1]["after"]) for m,H in h.items()}
    infl=st.mean(final.values())-1500
    # cambios de liga entre cierres de día consecutivos
    dd=[]
    for m,v in dayend.items():
        lg=[lf(x) for x in v]; dd.append(sum(a!=b for a,b in zip(lg,lg[1:]))/max(1,len(lg)-1))
    return dict(rango_dia=round(st.median(rngs)),cambios_liga_dia=round(st.mean(chg),1),ligas_dia=round(st.mean(nleag),1),
                pct_3ligas=round(100*sum(n>=3 for n in nleag)/len(nleag)),ruido_sd=round(noise),cambio_liga_entre_dias=round(100*st.mean(dd)),inflacion=round(infl),final=final)
def ema(alpha):
    def f(vals):
        out=[];e=vals[0]
        for v in vals: e=e+alpha*(v-e); out.append(e)
        return out
    return f
