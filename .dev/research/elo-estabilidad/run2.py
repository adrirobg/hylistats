from sim import *
def run2(points=(25,12,2,-5,-15,-19),slope=44,scale=400,mult=((1,1),(1.15,.75),(1.3,.5)),k=1.0,streak=None,streak_pred=lambda p:p==1,start=1500):
    # streak: dict {longitud_racha: multiplicador de ganancia}; la racha cuenta la partida actual
    R=defaultdict(lambda:start); hist=defaultdict(list); run_=defaultdict(int)
    for r in rows:
        m_=r["member"]; b=R[m_]; E=1/(1+10**((start-b)/scale))
        base=(points[r["pl"]-1]-slope*(E-.5))*k
        s=min(2,max(0,3-team[(r["match_id"],r["st"])]))
        m=1 if base==0 else (mult[s][0] if base>0 else mult[s][1])
        run_[m_]=run_[m_]+1 if streak_pred(r["pl"]) else 0
        sm=1
        if streak and base>0:
            for L,v in sorted(streak.items()):
                if run_[m_]>=L: sm=v
        d=base*m*sm; R[m_]=b+d
        hist[m_].append(dict(ts=r["ts"],day=day(r["ts"]),pl=r["pl"],s=s,d=d,before=b,after=b+d,sm=sm))
    return hist
