// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Version 1.2: 2009-02-16
// Clan/Rename Certificate support is included in this version.

// initialize the SHA1 digester in Ruby
function t2csri_initDigester()
{
	$SHA1::Initialized = 1;
	rubyEval("$sha1hasher = SHA1Pure.new");
}

// use Ruby to get the SHA1 hash of the string
function sha1sum(%string)
{
	if (!$SHA1::Initialized)
		t2csri_initDigester();
	%string = strReplace(%string, "'", "\\'");
	rubyEval("$sha1hasher.prepare");
	rubyEval("$sha1hasher.append('" @ %string @ "')");
	rubyEval("tsEval '$temp=\"' + $sha1hasher.hexdigest + '\";'");
	%temp = $temp;
	$temp = "";
	return %temp;
}

// verify with the auth server's RSA public key... hard coded in the executable
function t2csri_verify_auth_signature(%sig)
{
	rubyEval("tsEval '$temp=\"' + t2csri_verify_auth_signature('" @ %sig @ "').to_s(16) + '\";'");
	while (strLen($temp) < 40)
		$temp = "0" @ $temp;
	return $temp;
}

// server sends the client a certificate in chunks, since they can be rather large
function serverCmdt2csri_sendCertChunk(%client, %chunk)
{
	if (%client.doneAuthenticating)
		return;

	//echo("Client sent certificate chunk.");
	%client.t2csri_cert = %client.t2csri_cert @ %chunk;
	if (strlen(%client.t2csri_cert) > 20000)
	{
		%client.setDisconnectReason("Account certificate too long. Check your account key for corruption.");
		%client.delete();
	}
}

// gets a hex version of the client's IP address
// used to prevent a replay attack as described by Rain
function t2csri_gameClientHexAddress(%client)
{
	%ip = %client.getAddress();
	%ip = getSubStr(%ip, strstr(%ip, ":") + 1, strlen(%ip));
	%ip = getSubStr(%ip, 0, strstr(%ip, ":"));
	%ip = strReplace(%ip, ".", " ");

	for (%i = 0; %i < getWordCount(%ip); %i++)
	{
		%byte = DecToHex(getWord(%ip, %i));
		if (strLen(%byte) < 2)
			%byte = "0" @ %byte;
		%hex = %hex @ %byte;
	}
	return %hex;
}

// client is done sending their cert... verify it, and encrypt a challenge for the client
// challenge sent to client is %clientChallenge @ %serverChallenge.
function serverCmdt2csri_sendChallenge(%client, %clientChallenge)
{
	if (%client.doneAuthenticating)
		return;

	//echo("Client requesting challenge. CC: " @ %clientChallenge);
	//echo("Client's certificate: " @ %client.t2csri_cert);
	// verify that the certificate the client sent is signed by the authentication server
	%user = strReplace(getField(%client.t2csri_cert, 0), "\x27", "\\\x27");

	%guid = getField(%client.t2csri_cert, 1);
	// sanitize GUID
	for (%i = 0; %i < strlen(%guid); %i++)
	{
		%char = strcmp(getSubStr(%guid, %i, 1), "");
		if (%char > 57 || %char < 48)
		{
			%client.setDisconnectReason("Invalid characters in client GUID.");
			%client.delete();
			return;
		}
	}

	%e = getField(%client.t2csri_cert, 2);
	%n = getField(%client.t2csri_cert, 3);
	%sig = getField(%client.t2csri_cert, 4);

	// sanitize e, n, sig... all of which are just hex
	%rsa_chunk = strlwr(%e @ %n @ %sig);
	for (%i = 0; %i < strlen(%rsa_chunk); %i++)
	{
		%char = strcmp(getSubStr(%rsa_chunk, %i, 1), "");
		if ((%char < 48 || %char > 102) || (%char > 57 && %char < 97))
		{
			%client.setDisconnectReason("Invalid characters in certificate RSA fields.");
			%client.delete();
			return;
		}
	}

	// get a SHA1 sum
	%sumStr = %user @ "\t" @ %guid @ "\t" @ %e @ "\t" @ %n;
	%certSum = sha1sum(%sumStr);
	%verifSum = t2csri_verify_auth_signature(%sig);
	while (strLen(%verifSum) < 40)
		%verifSum = "0" @ %verifSum;
	//echo("Calc'd SHA1: " @ %certSum);
	//echo("Signed SHA1: " @ %verifSum);

	// verify signature
	if (%verifSum !$= %certSum)
	{
		// client supplied a bogus certificate that was never signed by the auth server
		// abort their connection
		%client.setDisconnectReason("Invalid account certificate.");
		%client.delete();
		return;
	}

	// process client challenge half
	%client.t2csri_clientChallenge = %clientChallenge;

	// sanitize the challenge to make sure it contains nothing but hex characters.
	// anything else means that the client is trying to hijack control of the interpreter
	%clientChallenge = strlwr(%clientChallenge);
	for (%i = 0; %i < strlen(%clientChallenge); %i++)
	{
		%char = strcmp(getSubStr(%clientChallenge, %i, 1), "");
		if ((%char < 48 || %char > 102) || (%char > 57 && %char < 97))
		{
			%client.setDisconnectReason("Invalid characters in client challenge.");
			%client.delete();
			return;
		}
	}

	// verify that the IP address the client thinks it is connecting to is the address this server
	// is reasonable... take into account connections from the same private IP subnet (192.168.*.*, 10.*.*.*, etc)
	%sanityIP = ipv4_hexBlockToIP(getSubStr(%clientChallenge, strLen(%clientChallenge) - 8, 8));
	%sourceIP = ipv4_hexBlockToIP(t2csri_gameClientHexAddress(%client));
	if (!ipv4_reasonableConnection(%sourceIP, %sanityIP))
	{
		%client.setDisconnectReason("Potential man in the middle attack detected. Your client claims it connected to: " @ %sanityIP @ ", but the server does not consider this reasonable.");
		%client.delete();
		return;
	}

	// calculate a random 64-bit server side challenge
	rubyEval("tsEval '$temp=\"' + rand(18446744073709551615).to_s(16) + '\";'");
	%client.t2csri_serverChallenge = $temp @ t2csri_gameClientHexAddress(%client);

	%fullChallenge = %client.t2csri_clientChallenge @ %client.t2csri_serverChallenge;
	rubyEval("tsEval '$temp=\"' + rsa_mod_exp('" @ %fullChallenge @ "'.to_i(16), '" @ %e @ "'.to_i(16), '" @ %n @ "'.to_i(16)).to_s(16) + '\";'");

	// send the challenge in 200 byte chunks
	for (%i = 0; %i < strlen($temp); %i += 200)
	{
		commandToClient(%client, 't2csri_getChallengeChunk', getSubStr($temp, %i, 200));
	}
	// tell the client we're done sending
	commandToClient(%client, 't2csri_decryptChallenge');

	// set up the "auth" info retrieved by cid.getAuthInfo()
	%client.t2csri_authinfo = %user @ "\t\t0\t" @ %guid @ "\n0\n";

	// clan support: check supplemental time limited certificate, if it was sent
	%comCert = %client.t2csri_comCert;
	if (strLen(%comCert) > 0)
	{
		// assuming there is a comCert, and we aren't running in bare mode
		if (getField(%comCert, 3) $= %guid)
		{
			// GUID in the community cert matches that of the account cert
			%client.t2csri_authinfo = %client.t2csri_comInfo;
		}
		else
		{
			// uh oh... someone's being naughty.. valid cert, but for a different player. kill them!
			%client.setDisconnectReason("Community supplemental certificate doesn't match account certificate.");
			%client.delete();
			return;
		}
	}
}


// verify the client's server challenge matches the one stored, if so, continue
// loading sequence
function serverCmdt2csri_challengeResponse(%client, %serverChallenge)
{
	if (%client.doneAuthenticating)
		return;

	if (%client.t2csri_serverChallenge $= %serverChallenge)
	{
		// check to see if the client is GUID banned, now that we verified their certificate
		if (banList_checkGUID(getField(%client.t2csri_authInfo, 3)))
		{
			%client.setDisconnectReason("You are not allowed to play on this server.");
			%client.delete();
			return;
		}

		// client checks out... continue loading sequence
		%client.onConnect(%client.tname, %client.trgen, %client.tskin, %client.tvoic, %client.tvopi);
	}
	else
	{
		%client.setDisconnectReason("Invalid server challenge. Check your account key for corruption.");
		%client.delete();
	}
}

// delete a client if they spend more than 15 seconds authenticating
function t2csri_expireClient(%client)
{
	if (!isObject(%client))
		return;
	%client.setDisconnectReason("This is a TribesNext server. You must install the TribesNext client to play. See www.tribesnext.com for info.");
	%client.delete();
}

package t2csri_server
{
	// packaged to create the "pre-connection" authentication phase
	function GameConnection::onConnect(%client, %name, %raceGender, %skin, %voice, %voicePitch)
	{
		if (%client.t2csri_serverChallenge $= "" && !%client.isAIControlled() && %client.getAddress() !$= "Local")
		{
			// check to see if the client is IP banned
			if (banList_checkIP(%client))
			{
				%client.setDisconnectReason("You are not allowed to play on this server.");
				%client.delete();
				return;
			}

			//echo("Client connected. Initializing pre-connection authentication phase...");
			// save these for later
			%client.tname = %name;
			%client.trgen = %raceGender;
			%client.tskin = %skin;
			%client.tvoic = %voice;
			%client.tvopi = %voicePitch;

			// start the 15 second count down
			%client.tterm = schedule(15000, 0, t2csri_expireClient, %client);

			commandToClient(%client, 't2csri_pokeClient', "T2CSRI 1.1 - 03/18/2009");
			return;
		}
		//echo("Client completed pre-authentication phase.");

		// continue connection process
		if (isEventPending(%client.tterm))
			cancel(%client.tterm);

		Parent::onConnect(%client, %name, %raceGender, %skin, %voice, %voicePitch);
		%client.doneAuthenticating = 1;
	}

	// packaged to prevent game leaving messages for clients that are in the authentication phase
	function GameConnection::onDrop(%client, %reason)
	{
		if (!isObject(%client) || !%client.doneAuthenticating)
			return;
		Parent::onDrop(%client, %reason);
	}

	// packaged to pull info from the certificate, rather than some internal data structures
	// format is kept consistent though:
	// >Name	ActiveClanTag	Prepend(0)/Postpend(1)Tag	guid
	// >NumberOfClans
	// >ClanName	TagForClan	Prepend(0)/Postpend(1)Tag	clanid	rank	title

	// in this version, there is no clan support, so those fields are empty
	// clan support will be implemented via delegation to a community server
	function GameConnection::getAuthInfo(%client)
	{
		if (%client.getAddress() $= "Local" && %client.t2csri_authInfo $= "")
			%client.t2csri_authInfo = WONGetAuthInfo();
		return %client.t2csri_authInfo;
	}
};

if ($PlayingOnline)
	activatePackage(t2csri_server);
