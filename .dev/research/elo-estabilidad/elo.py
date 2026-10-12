import json, statistics as st
from collections import defaultdict, Counter
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
MAD=ZoneInfo("Europe/Madrid")
NAMES={1:"BEJITO",2:"Hylimichi",3:"Azpekaa",4:"TheCIutch",5:"zapas14",6:"Krill1nt"}
rows=json.load(open("rows.json"))
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
