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
	new TCPObject(AuthConnection);

	%data = "GET /auth HTTP/1.1\r\nHost: www.tribesnext.com\r\nUser-Agent: Tribes 2\r\nConnection: close\r\n\r\n";
	AuthConnection.data = %data;
	AuthConnection.connect("www.tribesnext.com:80");
	$AuthServer::Primed = 0;
}

function AuthConnection::onLine(%this, %line)
{
	if (%line == 411)
		return;
	if (trim(%line) $= "")
	{
		$AuthServer::Primed = 1;
		return;
	}

	if ($AuthServer::Primed)
	{
		$AuthServer::Address = %line;
		%this.disconnect();
		authConnect_verifyLookup();
	}
}

function AuthConnection::onConnected(%this)
{
	%this.send(%this.data);
}

function authConnect_verifyLookup()
{

	if (getFieldCount($AuthServer::Address) != 2)
	{
		$AuthServer::Address = "";
		error("Authentication server lookup failed.");
		return;
	}
	%address = getField($AuthServer::Address, 0);
	%signature = getField($AuthServer::Address, 1);

	%sha1sum = sha1sum(%address);
	%verifSum = t2csri_verify_auth_signature(%signature);
	while (strlen(%verifSum) < 40)
		%verifSum = "0" @ %verifSum;
	if (%sha1sum !$= %verifSum)
	{
		// signature verification failed... someone has subverted the auth server lookup
		error("Authentication server lookup returned an address with an invalid signature.");
		error("Unable to contact the authentication server.");
		$AuthServer::Address = "";
		return;
	}
	else
	{
		echo("Authentication server found at " @ %address @ ". Ready to authenticate.");
		$AuthServer::Address = %address;
		$AuthServer::Primed = "";
	}
}

// perform signature verification to prove that the auth server has designated the
// provided address
function t2csri_verify_auth_signature(%sig)
{
	rubyEval("tsEval '$temp=\"' + t2csri_verify_auth_signature('" @ %sig @ "').to_s(16) + '\";'");
	return $temp;
}
