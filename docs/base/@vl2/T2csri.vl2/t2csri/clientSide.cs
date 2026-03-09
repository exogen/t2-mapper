// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Version 1.1: 03/14/2009

// load the clan support functions
exec("t2csri/clientSideClans.cs");

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

// get the password encrypted private key for the following name
// assuming it is installed on the system
function t2csri_getEncryptedAccountKey(%name)
{
	return rubyGetValue("$accPrivateKeys['" @ strlwr(%name) @ "']");
}

// get the public certificate key for the following name
// assuming it is installed on the system
function t2csri_getAccountCertificate(%name)
{
	// check if the name exists
	%found = 0;
	for (%i = 0; %i < getFieldCount($accountList); %i++)
	{
		if (%name $= getField($accountList, %i))
			%found = 1;
	}

	// this is a bit of a hack -- Ruby 1.9.0 has some problems getting the account on the first try
	%value = "";
	if (%found)
	{
		while (strLen(%value) == 0)
		{
			%value = rubyGetValue("$accCerts['" @ strlwr(%name) @ "']");
		}
	}
	else
	{
		%value = rubyGetValue("$accCerts['" @ strlwr(%name) @ "']");
	}
	return %value;
}

// prevents a warning generated when leaving a server, and allows the yellow
// highlight selection on the warrior screen that indicates the active account
function WONGetAuthInfo()
{
    return getField($LoginCertificate, 0) @ "\t\t0\t" @ getField($LoginCertificate, 1) @ "\n";
}

// decrypt an RC4 encrypted account key
// also used for encryption on the plaintext when generating the account
function t2csri_decryptAccountKey(%account, %password, %nonce, %doingEncryption)
{
	%key = sha1sum(%password @ %nonce);

	// initiate RC4 stream state with key
	%iterations = 256;
	for (%i = 0; %i < %iterations; %i++)
	{
		%SArray[%i] = %i;
	}
	%j = 0;
	for (%i = 0; %i < %iterations; %i++)
	{
		%j = (%j + %SArray[%i] + strCmp(getSubStr(%key, %i % strLen(%key), 1), "")) % %iterations;

		//swap(S[i],S[j])
		%temp = %SArray[%i];
		%SArray[%i] = %SArray[%j];
		%SArray[%j] = %temp;
	}

	// discard 2048 bytes from the start of the stream to avoid the strongly biased first bytes
	%seedI = 0; %seedJ = 0;
	for (%i = 0; %i < 2048; %i++)
	{
		%seedI = (%seedI + 1) % 256;
		%seedJ = (%seedJ + %SArray[%seedI]) % 256;

		%temp = %SArray[%seedI];
		%SArray[%seedI] = %SArray[%seedJ];
		%SArray[%seedJ] = %temp;
	}

	// decrypt the account
	%bytes = strlen(%account) / 2;
	for (%i = 0; %i < %bytes; %i++)
	{
		%seedI = (%seedI + 1) % 256;
		%seedJ = (%seedJ + %SArray[%seedI]) % 256;

		%temp = %SArray[%seedI];
		%SArray[%seedI] = %SArray[%seedJ];
		%SArray[%seedJ] = %temp;

		%schar = %SArray[(%SArray[%seedI] + %SArray[%seedJ]) % 256];
		%achar = strCmp(collapseEscape("\\x" @ getSubStr(%account, %i * 2, 2)), "");
		%byte = DecToHex(%schar ^ %achar);
		if (strLen(%byte) < 2)
			%byte = "0" @ %byte;
		%out = %out @ %byte;
	}

	// verify that the password is correct by checking with the nonce (SHA1 plaintext hash)
	%hash = sha1sum(%out);
	if (%hash $= %nonce || %doingEncryption)
		return %out;
	else
	{
		%out = getSubStr(%out, 0, strlen(%out) - 2);
		// last 4-bit block was corrupted... try to fix it
		for (%i = 0; %i < 16; %i++)
		{
			%chunk = getSubStr(DecToHex(%i), 1, 1);
			%hash = sha1sum(%out @ %chunk);
			if (%hash $= %nonce)
				return %out @ %chunk;
		}
		// last 8-bit block was corrupted... try to fix it
		for (%i = 0; %i < 256; %i++)
		{
			%chunk = DecToHex(%i);
			%hash = sha1sum(%out @ %chunk);
			if (%hash $= %nonce)
				return %out @ %chunk;
		}

		// looks like the password was still wrong
		return "";
	}
}

function t2csri_encryptAccountKey(%account, %password)
{
	%nonce = sha1sum(%account);
	return %nonce @ ":" @ t2csri_decryptAccountKey(%account, %password, %nonce, 1);
}

// this does the "login" process internally for accounts that exist
// it finds the cert, the private key, decrypts it, and sets up the
// RSA key data structures in the Ruby environment.
function t2csri_getAccount(%username, %password)
{
	$LoginUsername = %username;
	$LoginCertificate = t2csri_getAccountCertificate(%username);
	if ($LoginCertificate $= "")
	{
		return "NO_SUCH_ACCOUNT";
	}

	// split the certificate into its components
	// username	guid	e	n	signature
	%user = getField($LoginCertificate, 0);
	%guid = getField($LoginCertificate, 1);
	%e = getField($LoginCertificate, 2);
	%n = getField($LoginCertificate, 3);
	%sig = getField($LoginCertificate, 4);

	// nonce:encrypted
	%encryptedKey = t2csri_getEncryptedAccountKey(%username);
	%encryptedKey = getField(%encryptedKey, 1); // strip the username from the field
	%nonce = getSubStr(%encryptedKey, 0, strstr(%encryptedKey, ":"));
	%block = getSubStr(%encryptedKey, strLen(%nonce) + 1, strLen(%encryptedKey));
	%decryptedKey = t2csri_decryptAccountKey(%block, %password, %nonce);
	if (%decryptedKey $= "")
	{
		return "INVALID_PASSWORD";
	}

	// we have the account, and the properly decrypted private key... interface with Ruby and
	// insert the data...
	rubyEval("$accountKey = RSAKey.new");
	rubyEval("$accountKey.e = '" @ %e @ "'.to_i(16)");
	rubyEval("$accountKey.n = '" @ %n @ "'.to_i(16)");
	rubyEval("$accountKey.d = '" @ %decryptedKey @ "'.to_i(16)");
	// protect the private exponent (d) from reading now.
	// this will prevent scripts from stealing the private exponent, but still
	// allows doing decryption using the player's account key
	rubyEval("$accountKey.protect");

	return "SUCCESS";
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
	rubyEval("tsEval '$temp=\"' + Time.new.getutc.to_s + '\";'");
	%utc = $temp;
	$temp = "";
	//echo(%utc);

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
			rubyEval("certstore_addAccount('" @ %cert @ "','" @ %exp @ "')");

			// refresh the UI
			$LastLoginKey = $LoginName;
			LoginEditMenu.clear();
			LoginEditMenu.populate();
			LoginEditMenu.setActive(1);
			LoginEditMenu.setSelected(0);
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
	echo("T2CSRI: Authenticating with connected game server.");

	// send the community certificate, assuming server is running later than 1.0
	if (getWord(%version, 1) > 1.0)
		t2csri_sendCommunityCert();

	$encryptedchallenge = "";

	// send the certificate in 200 byte parts
	for (%i = 0; %i < strlen($LoginCertificate); %i += 200)
	{
		commandToServer('t2csri_sendCertChunk', getSubStr($LoginCertificate, %i, 200));
	}

	// send a 64 bit challenge to the server to prevent replay attacks
	rubyEval("tsEval '$loginchallenge=\"' + rand(18446744073709551615).to_s(16) + '\";'");
	// append what the client thinks the server IP address is, for anti-replay purposes
	$loginchallenge = $loginchallenge @ t2csri_gameServerHexAddress();
	commandToServer('t2csri_sendChallenge', $loginchallenge);

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
		%char = strcmp(getSubStr(%challenge, %i, 1), "");
		if ((%char < 48 || %char > 102) || (%char > 57 && %char < 97))
		{
			schedule(1000, 0, MessageBoxOK, "REJECTED","Invalid characters in server challenge.");
			disconnect();
			return;
		}
	}

	rubyEval("tsEval '$decryptedChallenge=\"' + $accountKey.decrypt('" @ %challenge @ "'.to_i(16)).to_s(16) + '\";'");

	// verify that the client challenge is intact, and extract the server challenge
	%replayedClientChallenge = getSubStr($decryptedChallenge, 0, strLen($loginchallenge));
	%serverChallenge = getSubStr($decryptedChallenge, strlen(%replayedClientChallenge), strLen($decryptedChallenge));
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
	schedule(getRandom(128, 512), 0, commandToServer, 't2csri_challengeResponse', %serverChallenge);

	// at this point, server will verify that the challenge is equivalent to the one it sent encrypted
	// to the client. the only way it can be equivalent is if the client has the private key they
	// claim to have. normal T2 connection process continues from this point
}
