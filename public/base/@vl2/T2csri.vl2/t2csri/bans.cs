// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// IP and GUID ban list handling.
// These seem to be completely broken in engine, so... here is a script implementation.

// Still works the same way as before... so scripts will function unmodified.
// BanList::add( %guid, %ipAddress, %seconds);
// If both GUID and IP address are specified, both types of entries are made on the banlist.

// gets the current Unix Epoch time from Ruby -- in seconds
function currentEpochTime()
{
	rubyEval("tsEval '$temp=' + Time.now.to_i.to_s + ';'");
	return $temp;
}

// compute the addition in Ruby, due to the Torque script precision problems for >1e6 values
function getEpochOffset(%seconds)
{
	rubyEval("tsEval '$temp=' + (Time.now.to_i + " @ %seconds @ ").to_s + ';'");
	return $temp;
}

// bans are added to the $BanList::GUID and $BanList::IP hash maps as the Unix epoch time
// when the ban will expire
function BanList::add(%guid, %ipAddress, %seconds)
{
	if (%guid != 0)
	{
		// add GUID ban
		$BanList::GUID[%guid] = getEpochOffset(%seconds);
	}
	if (getSubStr(%ipAddress, 0, 3) $= "IP:")
	{
		// add IP ban
		%bareIP = getSubStr(%ipAddress, 3, strLen(%ipAddress));
		%bareIP = getSubStr(%bareIP, 0, strstr(%bareIP, ":"));
		%bareIP = strReplace(%bareIP, ".", "_"); // variable access bug workaround

		$BanList::IP[%bareIP] = getEpochOffset(%seconds);
	}

	// write out the updated bans to the file
	export("$BanList*", "prefs/banlist.cs");
}

// returns boolean on whether the given client is IP banned or not
// true if banned, false if not banned
function banList_checkIP(%client)
{
	%ip = %client.getAddress();
	%ip = getSubStr(%ip, 3, strLen(%ip));
	%ip = getSubStr(%ip, 0, strstr(%ip, ":"));
	%ip = strReplace(%ip, ".", "_");

	%time = $BanList::IP[%ip];
	if (%time !$= "")
	{
		//%delta = %time - currentEpochTime();
		// T2 arithmetic fail again... doing subtraction in Ruby
		rubyEval("tsEval '$temp=' + (" @ %time @ " - Time.now.to_i).to_s + ';'");
		%delta = $temp;

		if (%delta > 0)
			return 1;
		else
			deleteVariables("$BanList::IP" @ %ip);
	}
	return 0;
}

// returns boolean on whether the given GUID is banned or not
// true if banned, false if not banned
function banList_checkGUID(%guid)
{
	%time = $BanList::GUID[%guid];
	if (%time !$= "")
	{
		//%delta = %time - currentEpochTime();
		// T2 arithmetic fail again... doing subtraction in Ruby
		rubyEval("tsEval '$temp=' + (" @ %time @ " - Time.now.to_i).to_s + ';'");
		%delta = $temp;

		if (%delta > 0)
			return 1;
		else
			deleteVariables("$BanList::GUID" @ %guid);
	}
	return 0;
}