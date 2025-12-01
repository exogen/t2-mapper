// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Authentication Server Connector Version 1.0: 11/06/2008

function authConnect_findAuthServer()
{
	if ($AuthServer::Address !$= "")
		return;

	echo("Looking up Authentication Server...");

	if (isObject(AuthConnection))
	{
		AuthConnection.disconnect();
		AuthConnection.delete();
	}

	new HTTPObject(AuthConnection);
	AuthConnection.setHeader("Accept", "text/plain");
	AuthConnection.get("www.tribesnext.com", "auth");
}

function AuthConnection::onLine(%this, %line)
{
	if (getFieldCount(%line) != 2)
		return;

	%address = getField(%line, 0);
	%signature = getField(%line, 1);

	%sha1sum = sha1sum(%address);
	%verifSum = t2csri_verify_auth_signature(%signature);
	while (strlen(%verifSum) < 40)
		%verifSum = "0" @ %verifSum;

	if (%sha1sum !$= %verifSum)
	{
		error("Authentication server lookup returned an address with an invalid signature.");
		error("Unable to contact the authentication server.");
		$AuthServer::Address = "";
	}
	else
	{
		echo("Authentication server found at " @ %address @ ". Ready to authenticate.");
		$AuthServer::Address = %address;
	}
}

function AuthConnection::onDisconnect(%this)
{
	if ($AuthServer::Address $= "")
	{
		error("Authentication server lookup failed.");
	}

	%this.delete();
}

function AuthConnection::onConnectFailed(%this)
{
	%this.delete();
}

function AuthConnection::onDNSFailed(%this)
{
	%this.delete();
}