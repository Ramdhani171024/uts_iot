const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { SerialPort, ReadlineParser } = require("serialport");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ====== KONFIGURASI PORT SERIAL ======
const SERIAL_PORT = "COM3"; // ubah sesuai port Arduino kamu
const BAUD_RATE = 115200;

// ====== JALUR FILE STATIS ======
app.use(express.static("public"));

// ====== ROUTE UTAMA (langsung ke index.html) ======
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// ====== SERIAL COMMUNICATION ======
const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

parser.on("data", (data) => {
  try {
    const json = JSON.parse(data);
    console.log("Data diterima:", json);
    io.emit("sensorData", json);
  } catch (e) {
    console.error("Data tidak valid:", data);
  }
});

port.on("error", (err) => {
  console.error("⚠️  Gagal membuka port serial:", err.message);
});

io.on("connection", (socket) => {
  console.log("Client terhubung:", socket.id);
  socket.on("disconnect", () => console.log("Client terputus:", socket.id));
});

// ====== JALANKAN SERVER ======
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});
