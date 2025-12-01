// Tribes 2 Master List
// https://www.tribesnext.com/
// Copyright 2008-2025 by Krash and the Tribes 2 Community System Reengineering Intitiative

// --------------------------------------------------------------------------

if ($Host::TN::beat $= "")   $Host::TN::beat = 5; // Time between heartbeats in minutes.
if ($Host::TN::echo $= "")   $Host::TN::echo = true; // Echo server notices to the console.
if ($Host::TN::master $= "") $Host::TN::master = "master.tribesnext.com";

// --------------------------------------------------------------------------

function ServerList::onConnectFailed(%this)
{
	if ($Host::TN::echo)
		error("-- Could not connect to master server.");

	%this.disconnect();
}

function ServerList::onDNSFailed(%this)
{
	if ($Host::TN::echo)
		error("-- DNS lookup failed for:" SPC $Host::TN::master);

	%this.disconnect();
}

function ServerList::onDisconnect(%this)
{
	if (%this.mode $= "1" && GMJ_Browser.rowCount() == 0)
		updateServerBrowserStatus("No servers found.", 0);
}

function ServerList::onHeader(%this, %name, %value)
{
	if (%name $= "Address" && ($IPv4::InetAddress $= "" || $Host::TN::resetIPv4))
		$IPv4::InetAddress = %value;
}

function ServerList::onLine(%this, %line)
{
	if ($Host::TN::debug)
		warn(%line);

	switch (%this.mode)
	{
		case 0: // gametype filters
			if (getWordCount(%line) >= 2)
			{
				switch$ (getSubStr(%line, 0, 1))
				{
					case "0": addGameType(restWords(%line));
					case "1": addMissionType(restWords(%line));
				}
			}

		case 1: // server listings
			%server = %line;
			if (strpos(%server, ":") != -1 && strstr(%server, ".") != -1)
				querySingleServer(%server);

		case 2: // heartbeat responses
			if ($Host::TN::echo)
			{
				switch$ (getSubStr(%line, 0, 1))
				{
					case "0":
						echo(" - Server added to list.");

					case "1":
						error(" - Your server could not be contacted.");
						error(" - Check your IP / port configuration.");

					case "2":
						echo(" - Heartbeat confirmed.");

					default:
						error(" - Invalid response from master.");
				}
			}
	}
}

// --------------------------------------------------------------------------

function queryMasterGameTypes()
{
	clearGameTypes();
	clearMissionTypes();

	ServerList.mode = 0;
	ServerList.get($Host::TN::master, "/listtypes");
}

function queryMasterServer(%port, %flags, %mod, %mapType, %minPlayers, %maxPlayers, %maxBots, %regionMask, %maxPing, %minCpu, %filtFlags, %buddy)
{
	QueryLANServers(28000);

	%path = "/list";

	if (%flags !$= "")
		%path = %path @ "/" @ %mod @ "/" @ %mapType @ "/" @ %minPlayers @ "/" @ %maxPlayers @ "/" @ %maxBots @ "/" @ %filtFlags;

	if (%buddy !$= "")
		%path = $path SPC %buddy;

	ServerList.mode = 1;
	ServerList.get($Host::TN::master, %path);
}

function startHeartbeat()
{
	if (isEventPending(ServerList.heartbeat))
		cancel(ServerList.heartbeat);

	if (!isObject(ServerGroup))
		return;

	if (!isActivePackage(t2csri_server))
		exec("t2csri/serverGlue.cs");

	%path = "/add/" @ $Host::Port;

	if ($Host::BindAddress !$= "")
		%path = %path @ "/" @ $Host::BindAddress;

	ServerList.mode = 2;
	ServerList.post($Host::TN::master, %path, "", "");

	if ($Host::TN::echo)
		echo("-- Sent heartbeat to TN Master. (" @ $Host::TN::master @ ")");

	if ($Host::TN::beat)
		ServerList.heartbeat = schedule($Host::TN::beat * 60000, 0, "startHeartbeat");
}

function stopHeartbeat()
{
	if (isEventPending(ServerList.heartbeat))
	{
		cancel(ServerList.heartbeat);
		ServerList.heartbeat = "";

		if ($Host::TN::echo)
			echo("-- Stopping heartbeats.");
	}
}

if (!isObject(ServerList))
{
	new HTTPObject(ServerList)
	{
		debug = $Host::TN::debug;
		heartbeat = "";
		enableIPv6 = false;
	};

	ServerList.setHeader("Accept", "text/plain");
}
