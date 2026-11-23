import time, json
from fastapi.testclient import TestClient
from app.main import app

with TestClient(app) as c:
    r = c.post("/api/jobs", json={"repo_url": "https://github.com/pallets/click"})
    print("create:", r.status_code, r.json())
    jid = r.json()["job_id"] if "job_id" in r.json() else r.json().get("id")
    for i in range(120):
        s = c.get(f"/api/jobs/{jid}").json()
        st = s.get("status")
        if st in ("done", "failed", "error"):
            print("final:", st, json.dumps(s, ensure_ascii=False)[:400])
            break
        time.sleep(2)
    if st == "done":
        res = c.get(f"/api/jobs/{jid}/result").json()
        tour = res.get("tour") or res.get("result", {}).get("tour")
        print("keys:", list(res.keys()))
        print(json.dumps(res, ensure_ascii=False)[:600])

