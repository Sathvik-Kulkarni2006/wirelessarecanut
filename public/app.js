const $ = id => document.getElementById(id);
function fmtTime(value) { try { return new Date(value).toLocaleString(); } catch { return value || "—"; } }
function paintRow(key, row) {
  const n = key === "row1" ? "1" : "2";
  $(`${key}Big`).innerHTML = `${row.moisture}<span>%</span>`;
  $(`${key}Bar`).style.width = `${row.moisture}%`;
  $(`${key}Valve`).textContent = row.valve;
  $(`${key}Threshold`).textContent = `${row.threshold}%`;
  const dry = row.moisture < row.threshold;
  $(`${key}Pill`).textContent = dry ? "WATER NEEDED" : "MOISTURE OK";
  $(`${key}Pill`).className = `pill ${dry ? "dry" : "good"}`;
  $(`fieldMoist${n}`).textContent = `${row.moisture}% moisture`;
  $(`fieldNeed${n}`).textContent = dry ? "Dry · watering needed" : "Moisture OK";
  $(`fieldValve${n}`).textContent = `VALVE ${row.valve}`;
  $(`fieldValve${n}`).parentElement.classList.toggle("closed", row.valve !== "OPEN");
}
function paintHistory(history) {
  const rows = history || [];
  $("historyBody").innerHTML = rows.length ? rows.slice(0,10).map(h =>
    `<tr><td>${fmtTime(h.at)}</td><td>${h.row === "row1" ? "Row 01" : "Row 02"}</td><td>${h.moisture}%</td><td>${h.valve}</td><td>${h.manual ? "Manual demo" : h.row ? "ESP32 / demo" : "—"}</td></tr>`
  ).join("") : '<tr><td colspan="5">No readings received yet.</td></tr>';
}
async function refresh() {
  try {
    const r = await fetch("/api/status"); if (!r.ok) throw new Error("API unavailable");
    const s = await r.json();
    paintRow("row1", s.rows.row1); paintRow("row2", s.rows.row2);
    $("lastUpdate").textContent = fmtTime(s.lastUpdate);
    $("rowsOnline").textContent = `${Number(s.rows.row1.sensorOnline)+Number(s.rows.row2.sensorOnline)} / 2`;
    $("apiStatus").textContent = "ONLINE"; $("systemStatus").textContent = "SYSTEM ONLINE";
    paintHistory(s.history);
  } catch(e) { $("apiStatus").textContent = "OFFLINE"; $("systemStatus").textContent = "BACKEND OFFLINE"; }
}
$("moistureInput").addEventListener("input", e => $("rangeValue").textContent = `${e.target.value}%`);
$("rowSelect").addEventListener("change", () => {
  const key = $("rowSelect").value;
  $("moistureInput").value = key === "row1" ? $("row1Big").textContent.replace("%","") : $("row2Big").textContent.replace("%","");
  $("rangeValue").textContent = `${$("moistureInput").value}%`;
});
$("sendReading").addEventListener("click", async () => {
  const key = $("rowSelect").value, value = Number($("moistureInput").value);
  const payload = key === "row1" ? {row1:value} : {row2:value};
  await fetch("/api/readings", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  await refresh();
});
$("simulate").addEventListener("click", async () => {
  await fetch("/api/demo/tick", {method:"POST"}); await refresh();
});
document.querySelectorAll(".trees").forEach(el => {
  for (let i=0;i<11;i++) { const tree=document.createElement("span"); tree.className="tree"; el.appendChild(tree); }
});
refresh(); setInterval(refresh, 2500);
