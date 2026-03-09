// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Version 1.0: 2009-02-13

// A little bit of development theory:
// -The Apotheosis DLL contains 3 RSA public keys. One for authentication, one for updates,
//  and one for delegation. The delegation key forms the root of the community system trust heirarchy.
// -The delegated-community-enhancement server issues time limited community certificates, which
//  annotate the bare account certificates. The annotations include current name, current clan, current tag
//  and current clan membership so that getAuthInfo() provides all relevant information. These certificates
//  are time limited to enforce the "current" status of the annotations.
// -Since game servers don't communicate with centralized systems (except for listing), the client is
//  responsible for providing a signed community certificate, and if prompted, the client is also
//  responsible for providing the authoratatively signed certificate from the relevant DCE. Thus, the
//  server will accumilate a small cache of valid DCE certificates.

// DCE certificate format:
// DCEName	DCENum	IssuedEpoch	ExpireEpoch	0	0	e	n	sig
//	The two zeros are reserved for future use.
// Community certificate format:
// DCENum	IssuedEpoch	ExpireEpoch	IssuedForGUID	HexBlob	Sig
// HexBlob format:
// (Follows same format as contents returned by getAuthInfo, but is hex encoded.)

// verify with the delegation RSA public key... hard coded in the executable
function t2csri_verify_deleg_signature(%sig)
{
	%sig = strReplace(%sig, "\x27", "\\\x27");
	rubyEval("tsEval '$temp=\"' + t2csri_verify_deleg_signature('" @ %sig @ "').to_s(16) + '\";'");
	while (strLen($temp) < 40)
		$temp = "0" @ $temp;
	return $temp;
}

// allow the client to send in an unknown DCE certificate
function serverCmdt2csri_getDCEChunk(%client, %chunk)
{
	// client can only send in one DCE
	if (%client.t2csri_sentDCEDone)
		return;

	%client.t2csri_activeDCE = %client.t2csri_activeDCE @ %chunk;
	if (strlen(%client.t2csri_activeDCE) > 20000)
	{
		%client.setDisconnectReason("DCE certificate is too long.");
		%client.delete();
		return;
	}
}

// client finished sending their DCE. validate it
function serverCmdt2csri_finishedDCE(%client)
{
	if (%client.t2csri_sentDCEDone)
		return;

	%dce = %client.t2csri_activeDCE;
	if (getFieldCount(%dce) != 9)
	{
		%client.setDisconnectReason("DCE certificate format is invalid.");
		%client.delete();
		return;
	}
	%dceName = getField(%dce, 0);
	%dceNum = getField(%dce, 1);
	%dceIssued = getField(%dce, 2);
	%dceExpire = getField(%dce, 3);
	%dceE = getField(%dce, 6);
	%dceN = getField(%dce, 7);

	// check to see if we already have this certificate
	if ($T2CSRI::DCEE[%dceNum] !$= "")
	{
		// we already have the cert... set the client as done
		%client.t2csri_sentDCEDone = 1;
		%client.t2csri_activeDCE = "";
		return;
	}

	%dceSig = getField(%dce, 8);
	%sigSha = t2csri_verify_deleg_signature(%dceSig);
	%sumStr = %dceName @ "\t" @ %dceNum @ "\t" @ %dceIssued @ "\t" @ %dceExpire @ "\t";
	%sumStr = %sumStr @ getField(%dce, 4) @ "\t" @ getField(%dce, 5) @ "\t" @ %dceE @ "\t" @ %dceN;
	%calcSha = sha1sum(%sumStr);

	if (%sigSha !$= %calcSha)
	{
		echo(%sigSha);
		warn(%calcSha);
		%client.setDisconnectReason("DCE is not signed by authoritative root.");
		%client.delete();
		return;
	}

	// passed signature check... now check to see if it has expired/issued time has arrived
	%currentTime = currentEpochTime();
	if (%currentTime < %dceIssued || %currentTime > %dceExpire)
	{
		%client.setDisconnectReason("DCE is not valid for the current time period.");
		%client.delete();
		return;
	}

	// passed time check... enter it into global data structure
	$T2CSRI::DCEName[%dceNum] = %dceName;
	$T2CSRI::DCEE[%dceNum] = %dceE;
	$T2CSRI::DCEN[%dceNum] = %dceN;

	// client has successfully sent a DCE
	%client.t2csri_sentDCEDone = 1;
	%client.t2csri_activeDCE = "";

	// client was pending on a certificate signature check, do that now that we have the DCE cert
	if (%client.t2csri_pendingDCE)
	{
		%client.t2csri_pendingDCE = 0;
		serverCmdt2csri_comCertSendDone(%client);
	}
}

// client sending community cert chunk
function serverCmdt2csri_sendCommunityCertChunk(%client, %chunk)
{
	// client can only send in one community cert
	if (%client.t2csri_sentComCertDone)
		return;

	%client.t2csri_comCert = %client.t2csri_comCert @ %chunk;
	if (strlen(%client.t2csri_comCert) > 20000)
	{
		%client.setDisconnectReason("Community certificate is too long.");
		%client.delete();
		return;
	}
}

// client has sent in a full community certificate... validate and parse it
function serverCmdt2csri_comCertSendDone(%client)
{
	if (%client.t2csri_sentComCertDone)
		return;

	%comCert = %client.t2csri_comCert;
	if (getFieldCount(%comCert) != 6)
	{
		%client.setDisconnectReason("Community certificate format is invalid.");
		%client.delete();
		return;
	}

	// parse
	%dceNum = getField(%comCert, 0);
	%issued = getField(%comCert, 1);
	%expire = getField(%comCert, 2);
	%guid = getField(%comCert, 3);
	%blob = getField(%comCert, 4);
	%sig = getField(%comCert, 5);
	%sumStr = getFieldS(%comCert, 0, 4);
	%calcSha = sha1Sum(%sumStr);

	// find the correct DCE
	%e = $T2CSRI::DCEE[%dceNum];
	%n = $T2CSRI::DCEN[%dceNum];

	// what if we don't have it? ask the client for a copy
	if (%e $= "")
	{
		%client.t2csri_pendingDCE = 1;
		commandToClient(%client, 't2csri_requestUnknownDCECert', %dceNum);
		return;
	}

	// get the signature SHA1
	rubyEval("tsEval '$temp = \"' + rsa_mod_exp('" @ %sig @ "'.to_i(16), '" @ %e @ "'.to_i(16), '" @ %n @ "'.to_i(16)).to_s(16) + '\";'");
	while (strlen($temp) < 40)
		$temp = "0" @ $temp;
	%sigSha = $temp;

	if (%sigSha !$= %calcSha)
	{
		%client.setDisconnectReason("Community cert is not signed by a known/valid DCE.");
		%client.delete();
		return;
	}

	// check expiration
	%currentTime = currentEpochTime();
	if (%currentTime > %expire)
	{
		%client.setDisconnectReason("Community cert has expired. Get a fresh one from the DCE.");
		%client.delete();
		return;
	}

	// valid cert... set the field for processing in the auth-phase code
	%len = strlen(%blob);
	for (%i = 0; %i < %len; %i += 2)
	{
		%decoded = %decoded @ collapseEscape("\\x" @ getSubStr(%blob, %i, 2));
	}
	%client.t2csri_comInfo = %decoded @ "\n";
	%client.t2csri_sentComCertDone = 1;
}