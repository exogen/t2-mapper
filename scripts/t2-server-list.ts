/**
 * Queries the TribesNext master server for active game servers and prints
 * their details to the console. Useful for testing the master query protocol
 * without going through the browser.
 *
 * Usage:
 *   npm run server-list
 */

import { queryServerList } from "../relay/masterQuery.js";

const MASTER_SERVER =
  process.env.T2_MASTER_SERVER || "master.tribesnext.com";

async function main() {
  console.log(`Master server: ${MASTER_SERVER}`);
  console.log("Querying server list...\n");

  try {
    const servers = await queryServerList(MASTER_SERVER);

    if (servers.length === 0) {
      console.log("No servers found.");
      return;
    }

    console.log(`Found ${servers.length} server(s):\n`);

    // Print as a table
    const nameWidth = Math.max(
      11,
      ...servers.map((s) => s.name.length),
    );
    const header = [
      "Server Name".padEnd(nameWidth),
      "Map".padEnd(20),
      "Type".padEnd(18),
      "Mod".padEnd(12),
      "Players".padEnd(9),
      "Ping".padEnd(6),
      "Address",
    ].join("  ");

    console.log(header);
    console.log("-".repeat(header.length));

    for (const server of servers) {
      console.log(
        [
          server.name.padEnd(nameWidth),
          server.mapName.padEnd(20),
          server.gameType.padEnd(18),
          server.mod.padEnd(12),
          `${server.playerCount}/${server.maxPlayers}`.padEnd(9),
          `${server.ping}ms`.padEnd(6),
          server.address,
        ].join("  "),
      );
    }
  } catch (e) {
    console.error("Query failed:", e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
