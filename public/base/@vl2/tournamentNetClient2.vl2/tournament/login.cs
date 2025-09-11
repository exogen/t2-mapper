// TribesNext Project
// http://www.tribesnext.com/
// Copyright 2011

// Tribes 2 Community System
// Robot Session Client

// Since the game itself does not store the users' passwords for any longer than is required
// to decrypt their RSA private keys, the "robot" client must negotiate sessions through an
// RSA challenge/response.

// The robot client issues a challenge request by sending the user's GUID and a random nonce.
// The DCE issues a challenge that is encrypted with the user's public key. The challenge is
// valid for a server configured lifetime, during which any challenge request by the same GUID
// would return the same challenge. The client sends the decrypted challenge back to the DCE, and
// if it is a match, a session is initiated, and a session UUID is returned to the robot client,
// which it uses to verify its identity for all authenticated requests. The challenge lifetime is
// sufficiently generous to allow an RSA decryption and heavy network latency.

// The client will refresh periodically (every 10 minutes by default) to keep the session alive.

function CommunitySessionInterface::onLine(%this, %line)
{
	//warn("SInterf: " @ %line);
	if (trim(%line) $= "")
	{
		%this.primed = 1;
		return;
	}
	if (%this.primed)
	{
		echo(%line);
		if (getSubStr(%line, 0, 11) $= "CHALLENGE: ")
		{
			$TribesNext::Community::SessionErrors = 0;
			$TribesNext::Community::Challenge = getSubStr(%line, 11, strlen(%line));
			//error("Challenge set: " @ $TribesNext::Community::Challenge);

			cancel($TribesNext::Community::SessionSchedule);
			$TribesNext::Community::SessionSchedule = schedule(200, 0, tn_community_login_initiate);
		}
		else if (getSubStr(%line, 0, 6) $= "UUID: ")
		{
			$TribesNext::Community::SessionErrors = 0;
			$TribesNext::Community::UUID = getSubStr(%line, 6, strlen(%line));
			$TribesNext::Community::Challenge = "";
			//error("UUID set: " @ $TribesNext::Community::UUID);

			cancel($TribesNext::Community::SessionSchedule);
			$TribesNext::Community::SessionSchedule = schedule($TribesNext::Community::SessionRefresh * 1000, 0, tn_community_login_initiate);
		}
		else if (getSubStr(%line, 0, 5) $= "ERR: ")
		{
			error("Session negotiation error: " @ getSubStr(%line, 5, strlen(%line)));
			$TribesNext::Community::UUID = "";
			$TribesNext::Community::Challenge = "";

			// add schedule with backoff, up to about 15 minutes
			$TribesNext::Community::SessionErrors++;
			if ($TribesNext::Community::SessionErrors > 66)
				$TribesNext::Community::SessionErrors = 66;
			$TribesNext::Community::SessionSchedule = schedule(200 * ($TribesNext::Community::SessionErrors * $TribesNext::Community::SessionErrors), 0, tn_community_login_initiate);
		}
		else if (getSubStr(%line, 0, 9) $= "REFRESHED")
		{
			$TribesNext::Community::SessionErrors = 0;
			//error("Session refreshed. Scheduling next ping.");

			cancel($TribesNext::Community::SessionSchedule);
			$TribesNext::Community::SessionSchedule = schedule($TribesNext::Community::SessionRefresh * 1000, 0, tn_community_login_initiate);
		}
		else if (getSubStr(%line, 0, 7) $= "TIMEOUT")
		{
			$TribesNext::Community::SessionErrors = 0;
			//error("Session timed out. Refreshing.");
			$TribesNext::Community::UUID = "";
			$TribesNext::Community::Challenge = "";

			cancel($TribesNext::Community::SessionSchedule);
			$TribesNext::Community::SessionSchedule = schedule(200, 0, tn_community_login_initiate);
		}
	}
}

function CommunitySessionInterface::onConnected(%this)
{
	//echo("Sending: " @ %this.data);
	%this.primed = 0;
	%this.send(%this.data);
}

// initiates the session negotiation process
function tn_community_login_initiate()
{
	if (isEventPending($TribesNext::Community::SessionSchedule))
	{
		cancel($TribesNext::Community::SessionSchedule);
	}
	%payload = "GET " @ $TribesNext::Community::BaseURL @ $TribesNext::Community::LoginScript @ "?guid=" @ getField($LoginCertificate, 1) @ "&";
	// is there an existing session?
	if ($TribesNext::Community::UUID !$= "")
	{
		// try to refresh it
		%payload = %payload @ "uuid=" @ $TribesNext::Community::UUID;
	}
	else
	{
		// no session -- either expired, or never had one

		// is a challenge present
		if ($TribesNext::Community::Challenge $= "")
		{
			// no challenge present... ask for one:
			// create a random nonce half of the length of the active RSA key modulus
			%length = strlen(getField($LoginCertificate, 3)) / 2;
			%nonce = "1"; // start with a one to prevent truncation issues
			for (%i = 1; %i < %length; %i++)
			{
				%nibble = getRandom(0, 15);
				if (%nibble == 10)
					%nibble = "a";
				else if (%nibble == 11)
					%nibble = "b";
				else if (%nibble == 12)
					%nibble = "c";
				else if (%nibble == 13)
					%nibble = "d";
				else if (%nibble == 14)
					%nibble = "e";
				else if (%nibble >= 15)
					%nibble = "f";
				%nonce = %nonce @ %nibble;
			}
			$TribesNext::Community::Nonce = %nonce;
			// transmit the request to the community server
			%payload = %payload @ "nonce=" @ %nonce;
		}
		else
		{
			%challenge = strlwr($TribesNext::Community::Challenge);
			for (%i = 0; %i < strlen(%challenge); %i++)
			{
				%char = strcmp(getSubStr(%challenge, %i, 1), "");
				if ((%char < 48 || %char > 102) || (%char > 57 && %char < 97))
				{
					// non-hex characters in the challenge!
					error("TNCommunity: Hostile challenge payload returned by server!");
					$TribesNext::Community::Challenge = "";
					tn_community_login_initiate();
					return;
				}
			}

			// challenge is present... decrypt it and transmit it to the community server
			rubyEval("tsEval '$decryptedChallenge=\"' + $accountKey.decrypt('" @ %challenge @ "'.to_i(16)).to_s(16) + '\";'");

			%verifiedNonce = getSubStr($decryptedChallenge, 0, strLen($TribesNext::Community::Nonce));
			if (%verifiedNonce !$= $TribesNext::Community::Nonce)
			{
				// this is not the nonce we sent to the community server, try again
				error("TNCommunity: Unmatched nonce in challenge returned by server!");
				$TribesNext::Community::Challenge = "";
				tn_community_login_initiate();
				return;
			}
			else
			{
				%response = getSubStr($decryptedChallenge, strLen($TribesNext::Community::Nonce), strlen($decryptedChallenge));
				%payload = %payload @ "response=" @ %response;
			}
		}
	}
	%payload = %payload @ " HTTP/1.1\r\nHost: " @ $TribesNext::Community::Host @ "\r\nUser-Agent: Tribes 2\r\nConnection: close\r\n\r\n";

	if (isObject(CommunitySessionInterface))
	{
		CommunitySessionInterface.disconnect();
	}
	else
	{
		new TCPObject(CommunitySessionInterface);
	}
	CommunitySessionInterface.data = %payload;
	CommunitySessionInterface.connect($TribesNext::Community::Host @ ":" @ $TribesNext::Community::Port);
}