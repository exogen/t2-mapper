// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Version 0.5: 2009-03-18

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

function clientCmdt2csri_requestUnknownDCECert(%dceNum)
{
	%cert = $T2CSRI::ClientDCESupport::DCECert[%dceNum];
	if (%cert $= "")
		return; // we don't have it, so we can't send it

	%len = strlen(%cert);
	for (%i = 0; %i < %len; %i += 200)
	{
		commandToServer('t2csri_getDCEChunk', getSubStr(%cert, %i, 200));
	}
	commandToServer('t2csri_finishedDCE');
}

function t2csri_sendCommunityCert()
{
	%cert = $T2CSRI::CommunityCertificate;
	if (%cert $= "")
		return; // we don't have it, so we can't send it

	%len = strlen(%cert);
	for (%i = 0; %i < %len; %i += 200)
	{
		commandToServer('t2csri_sendCommunityCertChunk', getSubStr(%cert, %i, 200));
	}
	commandToServer('t2csri_comCertSendDone');	
}
