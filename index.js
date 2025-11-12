// index.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const mqtt = require('mqtt');
const bodyParser = require('body-parser');
const path = require('path');

const DB_FILE = path.join(__dirname, 'sensors.db');
const db = new sqlite3.Database(DB_FILE);

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // serve frontend

// Ensure table exists (safe if you created via SQL already)
db.run(`CREATE TABLE IF NOT EXISTS data_sensor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suhu REAL NOT NULL,
  humidity REAL NOT NULL,
  lux REAL NOT NULL,
  timestamp TEXT NOT NULL
)`);

// --- MQTT setup ---
// Pilih broker: test Mosquitto broker (bisa diganti)
const MQTT_BROKER = 'mqtt://test.mosquitto.org:1883';
const MQTT_TOPIC_PREFIX = 'uts/iot'; // we'll use uts/iot/<clientid>/data and /<clientid>/cmd
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker', MQTT_BROKER);
  // Subscribe to all sensor publishes from ESP32 clients
  mqttClient.subscribe(`${MQTT_TOPIC_PREFIX}/+/data`, (err) => {
    if (!err) console.log(`Subscribed to ${MQTT_TOPIC_PREFIX}/+/data`);
  });
});

mqttClient.on('message', (topic, message) => {
  // Expect message to be JSON like: { "suhu":25.3, "humidity":60.5, "lux":120, "timestamp":"2025-11-12T06:00:00Z" }
  try {
    const payload = JSON.parse(message.toString());
    console.log('MQTT message', topic, payload);
    if (payload.suhu != null && payload.humidity != null && payload.lux != null && payload.timestamp) {
      const stmt = db.prepare('INSERT INTO data_sensor (suhu, humidity, lux, timestamp) VALUES (?, ?, ?, ?)');
      stmt.run(payload.suhu, payload.humidity, payload.lux, payload.timestamp, function(err) {
        if (err) console.error('DB insert error', err);
        else console.log('Inserted into DB id=', this.lastID);
      });
      stmt.finalize();
    } else {
      console.warn('MQTT payload missing fields; ignoring.');
    }
  } catch (e) {
    console.error('Failed parse MQTT message', e);
  }
});

// --- API endpoints ---
// Get all rows
app.get('/data_sensor', (req, res) => {
  db.all('SELECT * FROM data_sensor ORDER BY timestamp DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get latest row
app.get('/data_sensor/latest', (req, res) => {
  db.get('SELECT * FROM data_sensor ORDER BY timestamp DESC LIMIT 1', (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || {});
  });
});

// Insert via HTTP (optional, for testing)
app.post('/data_sensor', (req, res) => {
  const { suhu, humidity, lux, timestamp } = req.body;
  if (suhu == null || humidity == null || lux == null || !timestamp) {
    return res.status(400).json({ error: 'suhu, humidity, lux, timestamp required' });
  }
  const stmt = db.prepare('INSERT INTO data_sensor (suhu, humidity, lux, timestamp) VALUES (?, ?, ?, ?)');
  stmt.run(suhu, humidity, lux, timestamp, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
  stmt.finalize();
});

// optional: publish command to ESP (to kontrol pompa)
app.post('/cmd/:clientId', (req, res) => {
  const clientId = req.params.clientId;
  const { action } = req.body; // e.g. { action: "ON" } or "OFF"
  if (!action) return res.status(400).json({ error: 'action required' });
  const topic = `${MQTT_TOPIC_PREFIX}/${clientId}/cmd`;
  mqttClient.publish(topic, JSON.stringify({ action }), { qos: 0 }, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ sentTo: topic, action });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on', PORT);
  console.log('HTTP endpoints: GET /data_sensor  GET /data_sensor/latest');
});
