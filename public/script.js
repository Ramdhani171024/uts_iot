const socket = io();

socket.on("sensorData", (data) => {
  document.getElementById("suhu").innerText = data.suhu.toFixed(1) + " °C";
  document.getElementById("kelembapan").innerText = data.kelembapan.toFixed(1) + " %";
});
