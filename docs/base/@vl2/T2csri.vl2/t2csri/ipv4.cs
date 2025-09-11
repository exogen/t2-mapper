// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// IPv4 Utils Version 1.1 (03/26/2008)

// Whatismyip spat this out for automation purposes:
// http://www.whatismyip.com/automation/n09230945.asp
// Hopefully it won't change. We only check for extern-ip once
// when the game launches, so there shouldn't be more than a
// couple of hundred hits per day from the entire T2 community.

$IPv4::AutomationURL = "/whatismyip.php";

function ipv4_getInetAddress()
{
	if ($IPv4::InetAddress !$= "")
		return;

	if (isObject(IPv4Connection))
	{
		IPv4Connection.disconnect();
		IPv4Connection.delete();
	}
	new TCPObject(IPv4Connection);
	IPV4Connection.data = "GET " @ $IPv4::AutomationURL @ " HTTP/1.1\r\nHost: www.tribesnext.com\r\nUser-Agent: Tribes 2\r\nConnection: close\r\n\r\n";
	IPv4Connection.connect("www.tribesnext.com:80");
}

function IPv4Connection::onConnected(%this)
{
	%this.send(%this.data);
}

function IPv4Connection::onLine(%this, %line)
{
	if (%line $= "" || %line == 0)
		return;
	$IPv4::InetAddress = %line;
	%this.disconnect();
}

// added for 1.1, schedule a new attempt if we're blank, until we have an address
function IPv4Connection::onDisconnect(%this)
{
	schedule(5000, 0, ipv4_getInetAddress);
}

// used for the IP-nonce sanity check...
// source will claim that this computer is the destination.
// check to make sure the destination is reasonable
function ipv4_reasonableConnection(%source, %destination)
{
	if (%destination $= $IPv4::InetAddress)
	{
		// the destination claims to be us from the Internet. This is reasonable.
		return 1;
	}
	else
	{
		// destination is different from the IPv4 Internet Address. We could be on a LAN.
		if (getSubStr(%destination, 0, 2) $= "10")
		{
			// Class A LAN, check if the client is also on the same network
			return (getSubStr(%source, 0, 2) $= "10");
		}
		else if (getSubStr(%destination, 0, 3) $= "172" && getSubStr(%destination, 4, 2) > 15 && getSubStr(%destination, 4, 2) < 33)
		{
			// Class B LAN, check if the client is also on the same network
			return (getSubStr(%source, 0, 3) $= "172" && getSubStr(%source, 4, 2) > 15 && getSubStr(%source, 4, 2) < 33);
		}
		else if (getSubStr(%destination, 0, 7) $= "192.168")
		{
			// Class C LAN, check if the client is also on the same network
			return (getSubStr(%source, 0, 7) $= "192.168");
		}
		else if (getSubStr(%destination, 0, 7) $= "169.254")
		{
			// Link-local addresses/Zeroconf network, check if client is from the same place
			return (getSubStr(%source, 0, 7) $= "169.254");
		}
		else if (%destination $= $Host::BindAddress)
		{
			// Or it could be the pref-based bind address.
			return 1;
		}
		else
		{
			// looks like the destination address provided by the source is not reasonable
			// this is likely an attempt at a client token replay attack
			return 0;
		}
	}
}


// convert a (big endian) hex block into a numeric IP
function ipv4_hexBlockToIP(%hex)
{
	for (%i = 0; %i < 4; %i++)
	{
		%ip = %ip @ "." @ strcmp(collapseEscape("\\x" @ getSubStr(%hex, %i * 2, 2)), "");
	}
	return getSubStr(%ip, 1, strlen(%ip) - 1);
}
