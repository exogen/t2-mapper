// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Version 1.3: 2009-04-23
// Clan/Rename Certificate support is included in this version.

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
		%client.schedule(0, delete);
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

	if (%client.t2csri_retryChallenge)
	{
		if (isEventPending(%client.t2csri_retryChallenge))
			cancel(%client.t2csri_retryChallenge);

		%client.t2csri_retryChallenge = "";
	}

	if (!%client.t2csri_sentComCertDone && strLen(%client.t2csri_comCert) > 0)
	{
		%client.t2csri_retryChallenge = schedule(250, 0, serverCmdt2csri_sendChallenge, %client, %clientChallenge);
		return;
	}

	if (strlen(%client.t2csri_cert) < 1024)
	{
		%client.setDisconnectReason("Invalid authentication certificate.");
		%client.schedule(0, delete);

		return;
	}

	// echo("Client requesting challenge. CC: " @ %clientChallenge);
	// echo("Client's certificate: " @ %client.t2csri_cert);
	// verify that the certificate the client sent is signed by the authentication server
	%user = strReplace(getField(%client.t2csri_cert, 0), "\x27", "\\\x27");

	%guid = getField(%client.t2csri_cert, 1);

	// sanitize GUID
	for (%i = 0; %i < strlen(%guid); %i++)
	{
		%char = ord(getSubStr(%guid, %i, 1));
		if (%char > 57 || %char < 48)
		{
			%client.setDisconnectReason("Invalid characters in client GUID.");
			%client.schedule(0, delete);
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
		if (!isxdigit(getSubStr(%rsa_chunk, %i, 1)))
		{
			%client.setDisconnectReason("Invalid characters in certificate RSA fields.");
			%client.schedule(0, delete);
			return;
		}
	}

	// get a SHA1 sum
	%sumStr = %user @ "\t" @ %guid @ "\t" @ %e @ "\t" @ %n;
	%certSum = sha1sum(%sumStr);

	while (strLen(%sig) < 1024)
		%sig = "0" @ %sig;

	%verifSum = t2csri_verify_auth_signature(%sig);
	while (strLen(%verifSum) < 40)
		%verifSum = "0" @ %verifSum;

	// echo("Calc'd SHA1: " @ %certSum);
	// echo("Signed SHA1: " @ %verifSum);

	// verify signature
	if (%verifSum !$= %certSum)
	{
		// client supplied a bogus certificate that was never signed by the auth server
		// abort their connection
		%client.setDisconnectReason("Invalid account certificate.");
		%client.schedule(0, delete);
		return;
	}

	// process client challenge half
	%client.t2csri_clientChallenge = %clientChallenge;

	// sanitize the challenge to make sure it contains nothing but hex characters.
	// anything else means that the client is trying to hijack control of the interpreter
	%clientChallenge = strlwr(%clientChallenge);
	for (%i = 0; %i < strlen(%clientChallenge); %i++)
	{
		if (!isxdigit(getSubStr(%clientChallenge, %i, 1)))
		{
			%client.setDisconnectReason("Invalid characters in client challenge.");
			%client.schedule(0, delete);
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
		%client.schedule(0, delete);
		return;
	}

	// calculate a random 64-bit server side challenge
	%client.t2csri_serverChallenge = rand_challenge() @ t2csri_gameClientHexAddress(%client);

	%fullChallenge = %client.t2csri_clientChallenge @ %client.t2csri_serverChallenge;
	if (strlen(%fullChallenge) % 2)
		%fullChallenge = "0" @ %fullChallenge;

	%temp = rsa_mod_exp(%fullChallenge, %e, %n);

	// send the challenge in 200 byte chunks
	for (%i = 0; %i < strlen(%temp); %i += 200)
	{
		commandToClient(%client, 't2csri_getChallengeChunk', getSubStr(%temp, %i, 200));
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
			%client.schedule(0, delete);
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
		if (BanList::isBanned(getField(%client.t2csri_authInfo, 3), "*"))
		{
			%client.setDisconnectReason("You are not allowed to play on this server.");
			%client.schedule(0, delete);
			return;
		}

		// client checks out... continue loading sequence
		%client.onConnect(%client.tname, %client.trgen, %client.tskin, %client.tvoic, %client.tvopi);
	}
	else
	{
		%client.setDisconnectReason("Invalid server challenge. Check your account key for corruption.");
		%client.schedule(0, delete);
	}
}

// delete a client if they spend more than 15 seconds authenticating
function t2csri_expireClient(%client)
{
	if (!isObject(%client))
		return;

	%client.setDisconnectReason("This is a TribesNEXT server. You must install the TribesNEXT client to play. See www.tribesnext.com for info.");
	%client.schedule(0, delete);
}

package t2csri_server
{
	// packaged to create the "pre-connection" authentication phase
	function GameConnection::onConnect(%client, %name, %raceGender, %skin, %voice, %voicePitch)
	{
		if (%client.getAddress() !$= "local" && %client.t2csri_serverChallenge $= "")
		{
			// check to see if the client is IP banned
			if (BanList::isBanned(0, %client.getAddress()))
			{
				%client.setDisconnectReason("You are not allowed to play on this server.");
				%client.schedule(0, delete);
				return;
			}

			// echo("Client connected. Initializing pre-connection authentication phase...");
			// save these for later
			%client.tname = %name;
			%client.trgen = %raceGender;
			%client.tskin = %skin;
			%client.tvoic = %voice;
			%client.tvopi = %voicePitch;

			// start the 15 second count down
			%client.tterm = schedule(15000, 0, t2csri_expireClient, %client);

			commandToClient(%client, 't2csri_pokeClient', "T2CSRI 1.5 - 08/09/2012");
			return;
		}
		// echo("Client completed pre-authentication phase.");

		// continue connection process
		if (isEventPending(%client.tterm))
			cancel(%client.tterm);

		Parent::onConnect(%client, %name, %raceGender, %skin, %voice, %voicePitch);
		%client.doneAuthenticating = 1;
		%client.t2csri_cert = "";
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
		if (%client.t2csri_authInfo $= "" && %client.getAddress() $= "local")
			%client.t2csri_authInfo = WONGetAuthInfo();

		return %client.t2csri_authInfo;
	}

	// deactivating old master list server protocol handlers in script
	// sending a game type list to a dedicated server would result in a massive number
	// of nuiscance calls to the following functions, and spam the console with pages of errors
	// the errors were the main source of CPU utilization, so just setting stubs is adequate protection
	function addGameType()
	{
		return;
	}
	function clearGameTypes()
	{
		return;
	}
	function clearMissionTypes()
	{
		return;
	}
	function sortGameAndMissionTypeLists()
	{
		return;
	}
};

if ($PlayingOnline && !isActivePackage(t2csri_server))
	activatePackage(t2csri_server);