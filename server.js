const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const state = {
  system: "online",
  communication: "Wi-Fi / HTTP",
  lastUpdate: new Date().toISOString(),
  rows: {
    row1: { id: 1, moisture: 32, threshold: 45, valve: "OPEN", sensorOnline: false, receivedFrom: "demo" },
    row2: { id: 2, moisture: 68, threshold: 45, valve: "CLOSED", sensorOnline: false, receivedFrom: "demo" }
  },
  history: []
};

function applyMoisture(rowKey, moisture, source = "api", raw = null) {
  if (!state.rows[rowKey]) throw new Error("deviceId/row must be row1 or row2");
  const value = Number(moisture);
  if (!Number.isFinite(value)) throw new Error("moisture must be a number");
  const row = state.rows[rowKey];
  row.moisture = Math.max(0, Math.min(100, value));
  row.valve = row.moisture < row.threshold ? "OPEN" : "CLOSED";
  row.sensorOnline = true;
  row.receivedFrom = source;
  state.lastUpdate = new Date().toISOString();
  state.history.unshift({
    at: state.lastUpdate, row: rowKey, moisture: row.moisture,
    valve: row.valve, source, ...(raw !== null && Number.isFinite(Number(raw)) ? { raw: Number(raw) } : {})
  });
  state.history = state.history.slice(0, 30);
}

app.get("/api/status", (req, res) => res.json(state));
app.get("/api/health", (req, res) => res.json({ ok: true, service: "arecanut-irrigation-backend" }));

// ESP32 sends { deviceId: "row1", moisture: 42, raw: 2300 }.
// Dashboard demo sends { row1: 42 } or { row2: 42 }.
app.post("/api/readings", (req, res) => {
  const body = req.body || {};
  // Device payloads require the secret API key. Dashboard demo payloads use row1/row2.
  if (body.deviceId !== undefined || body.moisture !== undefined) {
    const expectedKey = process.env.DEVICE_API_KEY;
    if (!expectedKey) {
      return res.status(503).json({ ok: false, error: "Server missing DEVICE_API_KEY environment variable" });
    }
    if (req.get("x-device-key") !== expectedKey) {
      return res.status(401).json({ ok: false, error: "Invalid or missing device API key" });
    }
  }

  try {
    let updated = false;

    if (body.deviceId !== undefined || body.moisture !== undefined) {
      const rowKey = String(body.deviceId || "").toLowerCase();
      if (!["row1", "row2"].includes(rowKey)) {
        return res.status(400).json({ ok: false, error: "deviceId must be row1 or row2" });
      }
      if (body.moisture === undefined) {
        return res.status(400).json({ ok: false, error: "moisture is required" });
      }
      applyMoisture(rowKey, body.moisture, "esp32", body.raw ?? null);
      updated = true;
    } else {
      if (body.row1 !== undefined) { applyMoisture("row1", body.row1, "dashboard"); updated = true; }
      if (body.row2 !== undefined) { applyMoisture("row2", body.row2, "dashboard"); updated = true; }
    }

    if (!updated) {
      return res.status(400).json({ ok: false, error: "Send {deviceId, moisture, raw} or {row1} / {row2}" });
    }
    res.json({ ok: true, message: "Reading received", state });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Demo controls are for local/dashboard testing only.
app.post("/api/valve/:row/:action", (req, res) => {
  const key = req.params.row.toLowerCase();
  const action = req.params.action.toUpperCase();
  if (!["row1", "row2"].includes(key) || !["OPEN", "CLOSED"].includes(action)) {
    return res.status(400).json({ ok: false, error: "Use row1/row2 and open/closed." });
  }
  state.rows[key].valve = action;
  state.lastUpdate = new Date().toISOString();
  state.history.unshift({ at: state.lastUpdate, row: key, moisture: state.rows[key].moisture, valve: action, manual: true });
  state.history = state.history.slice(0, 30);
  res.json({ ok: true, state });
});

app.post("/api/demo/tick", (req, res) => {
  for (const key of ["row1", "row2"]) {
    const current = state.rows[key].moisture;
    const next = key === "row1" ? Math.max(20, current - 2) : Math.min(80, current + 1);
    applyMoisture(key, next, "demo");
  }
  res.json({ ok: true, state });
});

// A clearer message if someone opens the POST-only endpoint in a browser.
app.get("/api/readings", (req, res) => {
  res.status(405).json({ ok: false, error: "Use POST /api/readings to send sensor readings. Open / for the dashboard." });
});

app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));
