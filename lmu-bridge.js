/* ===========================================================================
   LMU Telemetrie-Bridge
   Liest die von Le Mans Ultimate aufgezeichneten DuckDB-Telemetriedateien
   (UserData\Telemetry\*.duckdb) über die mitgelieferte duckdb.exe und stellt
   sie als JSON bereit. Liefert außerdem die HTML-App aus (gleiche Origin).
   Start:  node lmu-bridge.js  [--dir="<Pfad zu UserData\Telemetry>"] [--port=8777]
   =========================================================================== */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ARG = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const PORT = parseInt(ARG.port || process.env.LMU_PORT || "8777", 10);
const DUCKDB = path.join(__dirname, "duckdbcli", "duckdb.exe");
const HTML = path.join(__dirname, "lmu-telemetry-analyzer.html");

/* ---- Telemetrie-Ordner finden ---- */
function findTelemetryDir() {
  if (ARG.dir) return ARG.dir;
  if (process.env.LMU_TELEMETRY_DIR) return process.env.LMU_TELEMETRY_DIR;
  const libs = [];
  const vdfs = [
    "C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf",
    "C:\\Program Files\\Steam\\steamapps\\libraryfolders.vdf",
  ];
  for (const v of vdfs) {
    try {
      const t = fs.readFileSync(v, "utf8");
      for (const m of t.matchAll(/"path"\s*"([^"]+)"/g)) libs.push(m[1].replace(/\\\\/g, "\\"));
    } catch {}
  }
  libs.push("D:\\SteamLibrary", "C:\\Program Files (x86)\\Steam", "E:\\SteamLibrary");
  for (const lib of libs) {
    const p = path.join(lib, "steamapps", "common", "Le Mans Ultimate", "UserData", "Telemetry");
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}
let TEL_DIR = findTelemetryDir();

/* ---- Gewünschte Kanäle (Name -> Ziel-Frequenz Hz fürs Downsampling) ---- */
const WANT_CH = {
  "Lap Dist": 10, "Ground Speed": 50, "Throttle Pos": 50, "Brake Pos": 50,
  "Steering Pos": 50, "Engine RPM": 25, "GPS Latitude": 10, "GPS Longitude": 10,
  "G Force Lat": 10, "G Force Long": 10, "Fuel Level": 5, "Virtual Energy": 5,
  "SoC": 5, "Wheel Speed": 25, "Steering Shaft Torque": 25, "Path Lateral": 10,
};
const WANT_EV = ["Gear", "Lap", "Lap Time", "Last Sector1", "Last Sector2",
  "Current Sector", "In Pits", "TC", "ABS", "TCLevel", "ABSLevel", "Best LapTime"];
// Mehrdimensionale Kanäle pro Rad (value1..4 = FL,FR,RL,RR) -> Ziel-Frequenz
const WANT_WHEEL = {
  "Tyres Wear": 5, "TyresPressure": 5, "TyresTempCentre": 10,
  "TyresTempLeft": 10, "TyresTempRight": 10, "TyresRubberTemp": 5,
  "Brakes Temp": 5,
};

function q(id) { return '"' + String(id).replace(/"/g, '""') + '"'; }

function duck(file, sql) {
  const out = execFileSync(DUCKDB, [file, "-readonly", "-json", "-c", sql],
    { maxBuffer: 512 * 1024 * 1024, encoding: "utf8", windowsHide: true });
  const rows = JSON.parse(out || "[]");
  return rows.length ? JSON.parse(rows[0].doc) : null;
}

function loadCatalog(file) {
  const sql = `SELECT (json_object(
    'meta',(SELECT json_group_object(key,value) FROM metadata WHERE key<>'CarSetup'),
    'channels',(SELECT json_group_array(json_object('name',channelName,'freq',frequency,'unit',unit)) FROM channelsList),
    'events',(SELECT json_group_array(json_object('name',eventName,'unit',unit)) FROM eventsList),
    'tables',(SELECT json_group_array(table_name) FROM information_schema.tables),
    'cols',(SELECT json_group_object(table_name, cols) FROM (SELECT table_name, list(column_name) AS cols FROM information_schema.columns GROUP BY table_name))
  ))::VARCHAR AS doc`;
  return duck(file, sql);
}

function loadSession(file) {
  const cat = loadCatalog(file);
  if (!cat) throw new Error("Katalog leer");
  const tables = new Set(cat.tables || []);
  const cols = cat.cols || {};
  const chMeta = {};
  (cat.channels || []).forEach(c => { chMeta[c.name] = c; });
  const valueCol = (name) => {
    const c = cols[name] || ["value"];
    return c.includes("value") ? "value" : c[0];   // mehrdim. Kanäle: erste Spalte
  };

  // Kanal-Stücke
  const outChannels = [];
  const chPieces = [];
  for (const [name, target] of Object.entries(WANT_CH)) {
    if (!tables.has(name)) continue;
    const freq = (chMeta[name] && chMeta[name].freq) || target;
    const stride = Math.max(1, Math.round(freq / target));
    const effFreq = freq / stride;
    chPieces.push(`${sqlStr(name)},(SELECT to_json(list(${q(valueCol(name))} ORDER BY rowid)) FROM ${q(name)} WHERE rowid % ${stride} = 0)`);
    outChannels.push({ name, unit: (chMeta[name] && chMeta[name].unit) || "", freq: effFreq, nativeFreq: freq });
  }
  // Event-Stücke (nur wenn ts+value vorhanden)
  const evPieces = [];
  const evNames = [];
  for (const name of WANT_EV) {
    if (!tables.has(name)) continue;
    const c = cols[name] || [];
    if (!c.includes("ts") || !c.includes("value")) continue;
    evPieces.push(`${sqlStr(name)},(SELECT to_json(list(json_object('ts',ts,'v',value) ORDER BY ts)) FROM ${q(name)})`);
    evNames.push(name);
  }
  // Rad-Kanäle (value1..4 = FL,FR,RL,RR)
  const wheelOut = [];
  const whPieces = [];
  for (const [name, target] of Object.entries(WANT_WHEEL)) {
    if (!tables.has(name)) continue;
    const valCols = (cols[name] || []).filter(c => /^value\d+$/.test(c));
    if (!valCols.length) continue;
    const freq = (chMeta[name] && chMeta[name].freq) || target;
    const stride = Math.max(1, Math.round(freq / target));
    const parts = valCols.map((vc, i) => `'${i + 1}',(SELECT to_json(list(${q(vc)} ORDER BY rowid)) FROM ${q(name)} WHERE rowid % ${stride} = 0)`);
    whPieces.push(`${sqlStr(name)},json_object(${parts.join(",")})`);
    wheelOut.push({ name, unit: (chMeta[name] && chMeta[name].unit) || "", freq: freq / stride, n: valCols.length });
  }

  const dataSql = `SELECT (json_object('ch',json_object(${chPieces.join(",")}),'ev',json_object(${evPieces.join(",")}),'wh',json_object(${whPieces.join(",")})))::VARCHAR AS doc`;
  const data = duck(file, dataSql);

  outChannels.forEach(c => { c.data = (data.ch && data.ch[c.name]) || []; });
  const events = {};
  evNames.forEach(n => { events[n] = (data.ev && data.ev[n]) || []; });
  const wheels = {};
  wheelOut.forEach(w => {
    const d = (data.wh && data.wh[w.name]) || {};
    const arrs = []; for (let i = 1; i <= w.n; i++) arrs.push(d[String(i)] || []);
    wheels[w.name] = { unit: w.unit, freq: w.freq, wheels: arrs };  // [FL,FR,RL,RR]
  });

  return { file: path.basename(file), meta: cat.meta || {}, channels: outChannels, events, wheels };
}

function loadSetup(file) {
  const setup = duck(file, "SELECT value AS doc FROM metadata WHERE key='CarSetup'");
  if (!setup) return {};
  const o = {};
  for (const k in setup) { const e = setup[k] || {}; o[k] = { s: e.stringValue, v: e.value, min: e.minValue, max: e.maxValue, last: e.lastSavedStringValue }; }
  return o;
}

function listSessions() {
  if (!TEL_DIR) return { error: "Telemetrie-Ordner nicht gefunden", telDir: null, sessions: [] };
  let files = [];
  try {
    files = fs.readdirSync(TEL_DIR).filter(f => /\.duckdb$/i.test(f)).map(f => {
      const st = fs.statSync(path.join(TEL_DIR, f));
      return { file: f, size: st.size, mtime: st.mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);
  } catch (e) { return { error: String(e.message), telDir: TEL_DIR, sessions: [] }; }
  return { telDir: TEL_DIR, sessions: files };
}

function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

/* ---- HTTP ---- */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    if (u.pathname === "/" || u.pathname === "/index.html") {
      const html = fs.readFileSync(HTML);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    if (u.pathname === "/api/config") {
      return json(res, 200, { telDir: TEL_DIR, port: PORT, duckdb: fs.existsSync(DUCKDB) });
    }
    if (u.pathname === "/api/sessions") {
      return json(res, 200, listSessions());
    }
    if (u.pathname === "/api/session") {
      const name = u.searchParams.get("file") || "";
      if (!name || /[\\/]/.test(name) || !/\.duckdb$/i.test(name)) return json(res, 400, { error: "Ungültiger Dateiname" });
      if (!TEL_DIR) return json(res, 500, { error: "Telemetrie-Ordner unbekannt" });
      const full = path.join(TEL_DIR, name);
      if (!fs.existsSync(full)) return json(res, 404, { error: "Datei nicht gefunden" });
      try {
        const t0 = Date.now();
        const data = loadSession(full);
        data.loadMs = Date.now() - t0;
        return json(res, 200, data);
      } catch (e) {
        const stderr = e.stderr ? e.stderr.toString() : "";
        const msg = (stderr || String(e.message || e));
        console.error("[/api/session] Fehler:", msg.slice(0, 1000));
        // Datei in Verwendung (Aufnahme läuft) -> Sperre (auch dt. Windows-Meldung)
        if (/lock|in use|conflicting|being used|could not set|already open|another process|verwendet wird|zugreifen|cannot open file|io error/i.test(msg))
          return json(res, 423, { locked: true, error: "Aufnahme läuft – Datei ist gesperrt" });
        return json(res, 500, { error: msg.slice(0, 800) });
      }
    }
    if (u.pathname === "/api/setup") {
      const name = u.searchParams.get("file") || "";
      if (!name || /[\\/]/.test(name) || !/\.duckdb$/i.test(name)) return json(res, 400, { error: "Ungültiger Dateiname" });
      if (!TEL_DIR) return json(res, 500, { error: "Telemetrie-Ordner unbekannt" });
      const full = path.join(TEL_DIR, name);
      if (!fs.existsSync(full)) return json(res, 404, { error: "Datei nicht gefunden" });
      try {
        return json(res, 200, { setup: loadSetup(full) });
      } catch (e) {
        const msg = (e.stderr ? e.stderr.toString() : String(e.message || e));
        if (/lock|in use|conflicting|being used|could not set|already open|another process|verwendet wird|zugreifen|cannot open file|io error/i.test(msg))
          return json(res, 423, { locked: true, error: "Aufnahme läuft – Datei ist gesperrt" });
        return json(res, 500, { error: msg.slice(0, 500) });
      }
    }
    res.writeHead(404); res.end("not found");
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});
function json(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

server.listen(PORT, () => {
  console.log("======================================================");
  console.log("  LMU Telemetrie-Bridge läuft");
  console.log("  ▶  Im Browser öffnen:  http://localhost:" + PORT);
  console.log("  Telemetrie-Ordner:    " + (TEL_DIR || "NICHT GEFUNDEN – mit --dir=... angeben"));
  console.log("  DuckDB CLI:           " + (fs.existsSync(DUCKDB) ? "ok" : "FEHLT (" + DUCKDB + ")"));
  console.log("======================================================");
});
