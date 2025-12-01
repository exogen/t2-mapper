// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Version 1.1: 03/14/2009

// load the clan support functions
exec("t2csri/clientSideClans.cs");

// prevents a warning generated when leaving a server, and allows the yellow
// highlight selection on the warrior screen that indicates the active account
function WONGetAuthInfo()
{
	$LoginCertificate = t2csri_getAccountCertificate();
	return getField($LoginCertificate, 0) @ "\t\t0\t" @ getField($LoginCertificate, 1) @ "\n";
}

// this sends a request to the authentication server to retrieve an account that is
// not locally stored on the client machine. It does some fancy mangling on the
// password to prevent the authentication server from decrypting the password
function t2csri_downloadAccount(%username, %password)
{
	// clear out any previously downloaded account
	$Authentication::Status::LastCert = "";
	$Authentication::Status::LastExp = "";

	// bring up a UI to indicate account download is in progress
	LoginMessagePopup("DOWNLOADING", "Downloading account credentials...");

	// this hash is what the auth server stores -- it does not store the password
	// in a recoverable manner
	%authStored = sha1sum("3.14159265" @ strlwr(%username) @ %password);
	//echo(%authStored);

	// get time in UTC, use it as a nonce to prevent replay attacks
	%utc = time();

	// time/username nonce
	%timeNonce = sha1sum(%utc @ strlwr(%username));
	//echo(%timeNonce);

	// combined hash
	%requestHash = sha1sum(%authStored @ %timeNonce);
	//echo(%requestHash);

	// sent to server: username	utc	requesthash
	// server sends back: certificate and encrypted private exponent
	Authentication_recoverAccount(%username @ "\t" @ %utc @ "\t" @ %requestHash);
	t2csri_processDownloadCompletion();
}

function t2csri_processDownloadCompletion()
{
	if ($Authentication::Status::ActiveMode != 0)
	{
		schedule(128, 0, t2csri_processDownloadCompletion);
		return;
	}
	else
	{
		if (strlen($Authentication::Status::LastCert) > 0)
		{
			popLoginMessage();
			LoginMessagePopup("SUCCESS", "Account credentials downloaded successfully.");
			schedule(3000, 0, popLoginMessage);

			%cert = strreplace($Authentication::Status::LastCert, "'", "\\'");
			%exp = strreplace($Authentication::Status::LastExp, "'", "\\'");
			%cert = getSubStr(%cert, 6, strlen(%cert));
			%exp = getField(%cert, 0) @ "\t" @ getSubStr(%exp, 5, strlen(%exp));
			// add it to the store
			t2csri_storeAccount(%cert, %exp);

			// refresh the UI
			$LastLoginKey = $LoginName;
			LoginEditMenu.clear();
			LoginEditMenu.populate();
			LoginEditMenu.setActive(1);
			LoginEditBox.clear();
		}
		else
		{
			popLoginMessage();
			LoginMessagePopup("ERROR", "Credential download failed. Check your username/password.");
			schedule(3000, 0, popLoginMessage);
		}
	}
}

// gets a hex version of the game server's IP address
// used to prevent a replay attack as described by Rain
function t2csri_gameServerHexAddress()
{
	%ip = ServerConnection.getAddress();

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

// client side interface to communicate with the game server
function clientCmdt2csri_pokeClient(%version)
{
	echo("T2CSRI: Authenticating with connected game server. (" @ %version @ ")");

	// send the community certificate, assuming server is running later than 1.0
	if (getWord(%version, 1) > 1.0)
		t2csri_sendCommunityCert();

	$encryptedchallenge = "";

	$LoginCertificate = t2csri_getAccountCertificate();
	// send the certificate in 200 byte parts
	for (%i = 0; %i < strlen($LoginCertificate); %i += 200)
	{
		commandToServer('t2csri_sendCertChunk', getSubStr($LoginCertificate, %i, 200));
	}

	// send a 64 bit challenge to the server to prevent replay attacks
	$loginchallenge = rand_challenge(18446744073709551615);
	// append what the client thinks the server IP address is, for anti-replay purposes
	$loginchallenge = $loginchallenge @ t2csri_gameServerHexAddress();

	schedule(0, 0, commandToServer, 't2csri_sendChallenge', $loginchallenge);

	// at this point, server will validate the signature on the certificate then
	// proceed to verifying the client has the private part of the key if valid
	// or disconnecting them if invalid
	// the only way the client can have a valid cert is if the auth server signed it
}

function clientCmdt2csri_getChallengeChunk(%chunk)
{
	$encryptedchallenge = $encryptedchallenge @ %chunk;
}

function clientCmdt2csri_decryptChallenge()
{
	// sanitize the challenge to make sure it contains nothing but hex characters.
	// anything else means that the server is trying to hijack control of the interpreter
	%challenge = strlwr($encryptedchallenge);
	for (%i = 0; %i < strlen(%challenge); %i++)
	{
		if (!isxdigit(getSubStr(%challenge, %i, 1)))
		{
			schedule(1000, 0, MessageBoxOK, "REJECTED","Invalid characters in server challenge.");
			disconnect();
			return;
		}
	}

	%decryptedChallenge = t2csri_rsa_decrypt(%challenge);

	// verify that the client challenge is intact, and extract the server challenge
	%replayedClientChallenge = getSubStr(%decryptedChallenge, 0, strLen($loginchallenge));
	%serverChallenge = getSubStr(%decryptedChallenge, strlen(%replayedClientChallenge), strLen(%decryptedChallenge));
	if (%replayedClientChallenge !$= $loginchallenge)
	{
		schedule(1000, 0, MessageBoxOK, "REJECTED","Server sent back wrong client challenge.");
		disconnect();
		return;
	}

	// analyze the IP address the server thinks the client is connecting from for the purposes
	// of preventing replay attacks
	%clip = ipv4_hexBlockToIP(getSubStr(%serverChallenge, strLen(%serverChallenge) - 8, 8));
	if (!ipv4_reasonableConnection(ipv4_hexBlockToIP(t2csri_gameServerHexAddress()), %clip))
	{
		schedule(1000, 0, MessageBoxOK, "REJECTED","Server sent back unreasonable IP challenge source. Possible replay attack attempt.");
		disconnect();
		return;
	}

	// send the server part of the challenge to prove client identity
	// this is done on a schedule to prevent side-channel timing attacks on the client's
	// private exponent -- different x requires different time for x^d, and d bits can be found
	// if you are really resourceful... adding this schedule kills time accuracy and makes such
	// a correlation attack very improbable
	schedule(getRandom(64, 512), 0, commandToServer, 't2csri_challengeResponse', %serverChallenge);

	// at this point, server will verify that the challenge is equivalent to the one it sent encrypted
	// to the client. the only way it can be equivalent is if the client has the private key they
	// claim to have. normal T2 connection process continues from this point
}
