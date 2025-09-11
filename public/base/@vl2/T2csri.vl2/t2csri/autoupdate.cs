// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Bare Bones Auto Update System Version 1.0: 11/06/2008

function authConnect_findAutoUpdater()
{
	if ($AutoUpdater::Address !$= "")
		return;

	if (isObject(AutoUpdateConnection))
	{
		AutoUpdateConnection.disconnect();
		AutoUpdateConnection.delete();
	}
	new TCPObject(AutoUpdateConnection);

	%data = "GET /update HTTP/1.1\r\nHost: www.tribesnext.com\r\nUser-Agent: Tribes 2\r\nConnection: close\r\n\r\n";
	AutoUpdateConnection.connect("www.tribesnext.com:80");
	AutoUpdateConnection.schedule(1000, send, %data);
}

function AutoUpdateConnection::onLine(%this, %line)
{
	if (!$AutoUpdater::UpdateFound)
	{
		$AutoUpdater::Address = %line;
		%this.disconnect();
		autoUpdate_verifyLookup();
	}
	else
	{
		if (isEventPending($AutoUpdate::LastLineSch))
			cancel($AutoUpdate::LastLineSch);
		$AutoUpdate::LastLineSch = autoUpdate_applyUpdate();
		if ($AutoUpdate::UpdateStarted)
			$AutoUpdate::Buffer = $AutoUpdate::Buffer @ "\n" @ %line;
		else if (strlen(%line) == 0)
			$AutoUpdate::UpdateStarted = 1;
	}
}

function autoUpdate_verifyLookup()
{
	if (getFieldCount($AutoUpdate::Address) != 2)
	{
		$AutoUpdater::Address = "";
		error("No valid update address found.");
		return;
	}
	%address = getField($AutoUpdater::Address, 0);
	%signature = getField($AutoUpdater::Address, 1);

	%sha1sum = sha1sum(%address);
	if (%sha1sum !$= t2csri_verify_update_signature(%signature))
	{
		// signature verification failed... someone has subverted the auth server lookup
		error("Auto update lookup returned an address with an invalid signature.");
		error("Unable to download update without a correct signature.");
		$AutoUpdater::Address = "";
		return;
	}
	else
	{
		echo("New update found at " @ %address @ ". Ready to download.");
		$AutoUpdater::Address = %address;
		$AutoUpdater::UpdateFound = 1;
	}
}

// perform signature verification to prove that the update server has designated the
// provided URL for a download, we don't want people injecting arbitrary code into
// user installations
function t2csri_verify_update_signature(%sig)
{
	rubyEval("tsEval '$temp=\"' + t2csri_verify_update_signature('" @ %sig @ "') + '\";'");
	return $temp;
}

function autoUpdate_performUpdate()
{
	if ($AutoUpdater::Address $= "")
		return;

	if (isObject(AutoUpdateConnection))
	{
		AutoUpdateConnection.disconnect();
		AutoUpdateConnection.delete();
	}
	new TCPObject(AutoUpdateConnection);

	%host = getSubStr($AutoUpdater::Address, 0, strstr("/"));
	%uri = getSubStr($AutoUpdater::Address, strlen(%host), strlen($AutoUpdater::Address));

	%data = "GET " @ %uri @ " HTTP/1.1\nHost: " @ %host @ "\nUser-Agent: Tribes 2\nConnection: close\n\n";
	AutoUpdateConnection.connect(%host);
	AutoUpdateConnection.schedule(1000, send, %data);
}

function autoUpdate_applyUpdate()
{
	new FileObject(AutoUpdateFile);
	AutoUpdateFile.openForWrite("autoUpdate.rb");
	AutoUpdateFile.writeline($AutoUpdate::Buffer);
	AutoUpdateFile.close();
	AutoUpdateFile.delete();

	rubyExec("autoUpdate.rb");
}
