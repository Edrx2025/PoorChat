const ChatServer = require("./ChatServer");

async function main() {
  const server = new ChatServer();
  const addresses = await server.start();

  console.log("Chad Server");
  console.log(`TCP: ${addresses.tcp.address}:${addresses.tcp.port}`);
  console.log(`UDP: ${addresses.udp.address}:${addresses.udp.port}`);

  const shutdown = async () => {
    console.log("\nCerrando servidor...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("No se pudo iniciar Chad Server:", error);
  process.exit(1);
});
