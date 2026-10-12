import json, os, statistics as st
from collections import defaultdict, Counter
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
MAD=ZoneInfo("Europe/Madrid")
NAMES={1:"BEJITO",2:"Hylimichi",3:"Azpekaa",4:"TheCIutch",5:"zapas14",6:"Krill1nt"}
rows=json.load(open(os.environ.get("ROWS","rows.json")))
rows=[r for r in rows if 1<=r["pl"]<=6]
rows.sort(key=lambda r:(r["ts"],r["match_id"]))
team=Counter((r["match_id"],r["st"]) for r in rows)
def day(ts):
    d=datetime.fromtimestamp(ts/1000,MAD)-timedelta(hours=6); return d.strftime("%Y-%m-%d")
LEAGUES=[(-1e9,"Hie"),(1450,"Bro"),(1480,"Pla"),(1510,"Oro"),(1540,"Plt"),(1570,"Dia")]
def league(r):
    r=round(r); n=None
    for m,x in LEAGUES:
        if r>=m:n=x
    return n
def run(points=(25,12,2,-5,-15,-19),slope=44,scale=400,mult=((1,1),(1.15,.75),(1.3,.5)),start=1500,k=1.0,rows=rows):
    R=defaultdict(lambda:start); hist=defaultdict(list)
    for r in rows:
        b=R[r["member"]]; E=1/(1+10**((start-b)/scale))
        base=(points[r["pl"]-1]-slope*(E-.5))*k
        s=min(2,max(0,3-team[(r["match_id"],r["st"])]))
        m=1 if base==0 else (mult[s][0] if base>0 else mult[s][1])
        d=base*m; R[r["member"]]=b+d
        hist[r["member"]].append(dict(ts=r["ts"],day=day(r["ts"]),pl=r["pl"],s=s,d=d,before=b,after=b+d))
    return hist

# --- F28 (iter-12): K×0,5, multiplicador nuevo, racha de 1º que cruza días y liga con margen ±10 ---
F28_POINTS=(12.5,6,1,-2.5,-7.5,-9.5); F28_SLOPE=22; F28_MULT=((1,1),(1.1,.85),(1.2,.8))
F28_STREAK=(1,1,1.5,2); F28_MARGIN=10
LEAGUE_MINS=[m for m,_ in LEAGUES]
def league_idx(r):
    r=round(r); i=0
    for j,m in enumerate(LEAGUE_MINS):
        if r>=m: i=j
    return i
def league_step(cur,r):
    r=round(r)
    while cur+1<len(LEAGUE_MINS) and r>=LEAGUE_MINS[cur+1]+F28_MARGIN: cur+=1
    while cur>0 and r<=LEAGUE_MINS[cur]-F28_MARGIN: cur-=1
    return cur
def run_f28(rows=rows,start=1500,scale=400):
    R=defaultdict(lambda:start); streak=defaultdict(int); lg=defaultdict(lambda:league_idx(start)); hist=defaultdict(list)
    for r in rows:
        m_=r["member"]; b=R[m_]; E=1/(1+10**((start-b)/scale))
        base=F28_POINTS[r["pl"]-1]-F28_SLOPE*(E-.5)
        s=min(2,max(0,3-team[(r["match_id"],r["st"])]))
        sm=1 if base==0 else (F28_MULT[s][0] if base>0 else F28_MULT[s][1])
        streak[m_]=streak[m_]+1 if r["pl"]==1 else 0
        stm=F28_STREAK[min(streak[m_],len(F28_STREAK)-1)] if base*sm>0 else 1
        d=base*sm*stm; R[m_]=b+d; lg[m_]=league_step(lg[m_],b+d)
        hist[m_].append(dict(ts=r["ts"],day=day(r["ts"]),pl=r["pl"],s=s,d=d,before=b,after=b+d,streak=streak[m_],stm=stm,league=lg[m_]))
    return hist
