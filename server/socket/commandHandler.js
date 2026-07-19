module.exports = (io, socket) => {

  socket.on("execute_command", (data) => {

    console.log("📱 Command Received:", data);

    io.emit("execute_command", data);

  });

};