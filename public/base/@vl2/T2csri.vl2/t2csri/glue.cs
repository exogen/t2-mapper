// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Version 1.0 initialization and glue file

// enable debugging console
//enableWinConsole(1);

// load the torque script components
exec("t2csri/authconnect.cs");
exec("t2csri/authinterface.cs");
exec("t2csri/base64.cs");
exec("t2csri/clientSide.cs");
exec("t2csri/ipv4.cs");
exec("t2csri/rubyUtils.cs");

// load the Ruby components
rubyExec("t2csri/crypto.rb");
rubyExec("t2csri/certstore.rb");

rubyEval("certstore_loadAccounts");
rubyEval("tsEval '$RubyEnabled=1;'");

// connect to the auth server via signed lookup
schedule(32, 0, authConnect_findAuthServer);

// get the global IP for sanity testing purposes
schedule(32, 0, ipv4_getInetAddress);
