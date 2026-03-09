// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Version 1.0 initialization and glue file (server side)

if (isObject(ServerGroup))
{
	// load the Ruby utils and cryptography module
	exec("t2csri/rubyUtils.cs");
	rubyExec("t2csri/crypto.rb");

	// load the torque script components
	exec("t2csri/serverSide.cs");
	exec("t2csri/serverSideClans.cs");
	exec("t2csri/bans.cs");
	exec("t2csri/ipv4.cs");
	exec("t2csri/base64.cs");

	// get the global IP for sanity testing purposes
	schedule(32, 0, ipv4_getInetAddress);
}
