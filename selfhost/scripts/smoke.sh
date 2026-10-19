#!/usr/bin/env bash
# End-to-end smoke test against a fresh server. Usage: scripts/smoke.sh [binary]
set -euo pipefail
BIN=${1:-./server/bin/server}
DATA=$(mktemp -d)
CJ=$(mktemp)
PORT=18099
"$BIN" -addr 127.0.0.1:$PORT -data "$DATA" >"$DATA/server.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$DATA" "$CJ"' EXIT
sleep 1
B=http://127.0.0.1:$PORT
J=(-H content-type:application/json)
C=(-c "$CJ" -b "$CJ")
py() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }

echo "# register first user (becomes admin)"
curl -sf "${C[@]}" "${J[@]}" -d '{"email":"admin@example.com","name":"Admin","password":"password123"}' $B/api/auth/register | py 'assert d["role"]=="admin"; print("ok", d["email"], d["role"])'

echo "# create roadmap"
ID=$(curl -sf "${C[@]}" "${J[@]}" -d '{"title":"Programming Fundamentals for New Grads","tags":["programming","beginner"]}' $B/api/roadmaps | py 'print(d["id"])')
echo "ok id=$ID"

echo "# save content with an inline data-URI screenshot, odd type, bare link"
PNG=$(python3 -c 'import base64;print(base64.b64encode(bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")).decode())')
curl -sf "${C[@]}" "${J[@]}" -X PUT -d "{\"content\":{\"title\":\"Programming Fundamentals for New Grads\",\"subtitle\":\"Start here\",\"topics\":[{\"id\":\"t1\",\"label\":\"Basics\",\"children\":[{\"label\":\"Variables\",\"type\":\"weird\",\"images\":[{\"src\":\"data:image/png;base64,$PNG\",\"caption\":\"c\"}],\"links\":[{\"label\":\"MDN\",\"url\":\"developer.mozilla.org\"}]}]}]},\"note\":\"first\"}" $B/api/r/$ID \
  | py 'c=d["content"]["topics"][0]["children"][0]; assert c["type"]=="core"; assert c["images"][0]["src"].startswith("/img/"); assert c["links"][0]["url"]=="https://developer.mozilla.org"; assert d["nodeCount"]==2; print("ok normalized; image ->", c["images"][0]["src"][:20])'

echo "# not visible publicly while draft"
test "$(curl -s -o /dev/null -w '%{http_code}' $B/api/roadmaps/programming-fundamentals-for-new-grads)" = 404 && echo ok

echo "# submit (admin publishes directly)"
curl -sf "${C[@]}" -X POST $B/api/r/$ID/submit | py 'assert d["status"]=="published"; print("ok", d["status"])'

echo "# public list + fetch + image"
curl -sf $B/api/roadmaps | py 'assert len(d)==1; print("ok", d[0]["slug"], "by", d[0]["ownerName"])'
IMG=$(curl -sf $B/api/roadmaps/programming-fundamentals-for-new-grads | py 'print(d["content"]["topics"][0]["children"][0]["images"][0]["src"])')
test "$(curl -s -o /dev/null -w '%{http_code}' $B$IMG)" = 200 && echo "ok image served"

echo "# progress"
curl -sf "${C[@]}" "${J[@]}" -X PUT -d '{"t1":"done","x":"bogus"}' $B/api/r/$ID/progress | py 'assert d=={"t1":"done"}; print("ok")'

echo "# export inline round-trips to a data URI"
curl -sf "$B/api/roadmaps/programming-fundamentals-for-new-grads/export?inline=1" | py 'assert d["topics"][0]["children"][0]["images"][0]["src"].startswith("data:image/png"); print("ok")'

echo "# revisions"
curl -sf "${C[@]}" $B/api/r/$ID/revisions | py 'assert d[0]["n"]==1 and d[0]["note"]=="first"; print("ok")'

echo "# second user is a member, review flow"
CJ2=$(mktemp); C2=(-c "$CJ2" -b "$CJ2")
curl -sf "${C2[@]}" "${J[@]}" -d '{"email":"m@example.com","password":"password123"}' $B/api/auth/register | py 'assert d["role"]=="member"; print("ok member")'
ID2=$(curl -sf "${C2[@]}" "${J[@]}" -d '{"title":"CBSE Class 9 Maths"}' $B/api/roadmaps | py 'print(d["id"])')
curl -sf "${C2[@]}" "${J[@]}" -X PUT -d '{"content":{"title":"CBSE Class 9 Maths","topics":[{"label":"Number systems","children":[]}]}}' $B/api/r/$ID2 >/dev/null
curl -sf "${C2[@]}" -X POST $B/api/r/$ID2/submit | py 'assert d["status"]=="review"; print("ok in review")'
test "$(curl -s -o /dev/null -w '%{http_code}' "${C2[@]}" $B/api/admin/review)" = 403 && echo "ok member blocked from admin"
curl -sf "${C[@]}" $B/api/admin/review | py 'assert len(d)==1; print("ok queue has 1")'
curl -sf "${C[@]}" "${J[@]}" -X POST -d '{"note":"add resources"}' $B/api/r/$ID2/reject | py 'assert d["status"]=="draft" and d["reviewNote"]=="add resources"; print("ok rejected with note")'
curl -sf "${C2[@]}" -X POST $B/api/r/$ID2/submit >/dev/null
curl -sf "${C[@]}" -X POST $B/api/r/$ID2/publish | py 'assert d["status"]=="published"; print("ok published by admin")'
test "$(curl -s -o /dev/null -w '%{http_code}' "${C2[@]}" -X DELETE $B/api/r/$ID)" = 403 && echo "ok member cannot delete admin's roadmap"

echo "# import old builder JSON"
curl -sf "${C2[@]}" "${J[@]}" -d '{"title":"Imported","subtitle":"","topics":[{"id":"a","label":"A","children":[{"id":"a","label":"dup id","type":"alt"}]}]}' $B/api/roadmaps/import | py 'k=d["content"]["topics"][0]["children"][0]; assert k["id"]!="a"; print("ok import, dup id regenerated ->", k["id"])'

echo "# restart keeps data"
kill $PID; sleep 0.5
"$BIN" -addr 127.0.0.1:$PORT -data "$DATA" >>"$DATA/server.log" 2>&1 &
PID=$!; sleep 1
curl -sf "${C[@]}" $B/api/auth/me | py 'assert d["user"]["email"]=="admin@example.com"; print("ok session survived restart")'
curl -sf $B/api/roadmaps | py 'assert len(d)==2; print("ok 2 published after restart")'
echo "ALL GOOD"
