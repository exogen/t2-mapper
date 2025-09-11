// TribesNext Project
// http://www.tribesnext.com/
// Copyright 2011

// Tribes 2 Community System
// Robot Browser Client - Prototype

$TribesNext::Community::Browser::Active = 0;

function CommunityBrowserInterface::onConnected(%this)
{
	//echo("Browser-Sending: " @ %this.data);
	%this.primed = 0;
	%this.send(%this.data);
}

function CommunityBrowserInterface::onDisconnect(%this)
{
	$TribesNext::Community::Browser::Active = 0;
	tn_community_Browser_executeNextRequest();
}

function CommunityBrowserInterface::onLine(%this, %line)
{
	if (trim(%line) $= "")
	{
		%this.primed = 1;
		return;
	}
	if (!%this.primed)
		return;

	//warn("Browser: " @ %line);
	%message = getField(%line, 0);
	switch$ (%message)
	{
		// display errors to the user -- some of these should never actually happen
		case "ERR":
			if (getField(%line, 1) $= "BROWSER")
			{
				%type = getField(%line, 2);
				switch$ (%type)
				{
					// TODO -- implement different message types
					case "BLAH":
						%message = "Blah!";
					default:
						%message = "Unknown error in browser system: " @ %line;
				}
				schedule(500, 0, MessageBoxOK, "ERROR", %message);
			}
		case "DCE":
			%dceCert = collapseEscape(getField(%line, 1));
			%index = getField(%dceCert, 1);
			$T2CSRI::ClientDCESupport::DCECert[%index] = %dceCert;
		case "CEC":
			$T2CSRI::CommunityCertificate = collapseEscape(getField(%line, 1));
			// schedule a refresh
			%expire = getField($T2CSRI::CommunityCertificate, 2);
			rubyEval("tsEval '$temp=\"' + (" @ %expire @ " - Time.now().to_i).to_s + '\";'");
			%expire = $temp - 60;
			if (%expire > 0)
			{
				if (isEventPending($TribesNext::Browser::CertRefreshSch))
					cancel($TribesNext::Browser::CertRefreshSch);
				$TribesNext::Browser::CertRefreshSch = schedule(1000 * %expire, 0, tn_community_Browser_request_cert);
			}
			else
			{
				schedule(500, 0, MessageBoxOK, "ERROR", "Received expired certificate from community server. Is your computer's clock set correctly?");
			}
	}
}


function tn_community_browser_initQueue()
{
	if (isObject($BrowserRequestQueue))
		$BrowserRequestQueue.delete();
	$BrowserRequestQueue = new MessageVector();
}
tn_community_browser_initQueue();

function tn_community_browser_processRequest(%request, %payload)
{
	if (%request !$= "")
	{
		%request = "?guid=" @ getField($LoginCertificate, 1) @ "&uuid=" @ $TribesNext::Community::UUID @ "&" @  %request;
	}
	if (%payload $= "")
	{
		%data = "GET " @ $TribesNext::Community::BaseURL @ $TribesNext::Community::BrowserScript @ %request;
		%data = %data @ " HTTP/1.1\r\nHost: " @ $TribesNext::Community::Host @ "\r\nUser-Agent: Tribes 2\r\nConnection: close\r\n\r\n";
	}
	else
	{
		%data = "POST " @ $TribesNext::Community::BaseURL @ $TribesNext::Community::BrowserScript @ " HTTP/1.1\r\n";
		%data = %data @ "Host: " @ $TribesNext::Community::Host @ "\r\nUser-Agent: Tribes 2\r\nConnection: close\r\n";
		%data = %data @ %payload;
	}

	$BrowserRequestQueue.pushBackLine(%data);

	if (!$TribesNext::Community::Browser::Active)
		tn_community_browser_executeNextRequest();
}

function tn_community_browser_executeNextRequest()
{
	if ($BrowserRequestQueue.getNumLines() <= 0)
		return;

	%data = $BrowserRequestQueue.getLineText(0);
	$BrowserRequestQueue.popFrontLine();

	$TribesNext::Community::Browser::Active = 1;

	if (isObject(CommunityBrowserInterface))
	{
		CommunityBrowserInterface.disconnect();
	}
	else
	{
		new TCPObject(CommunityBrowserInterface);
	}
	CommunityBrowserInterface.data = %data;
	CommunityBrowserInterface.connect($TribesNext::Community::Host @ ":" @ $TribesNext::Community::Port);
}

// implementation of API requests

function tn_community_Browser_request_cert()
{
	if ($TribesNext::Community::UUID $= "")
	{
		schedule(3000, 0, tn_community_Browser_request_cert);
		return;
	}
	//error("Browser: Downloading enhanced certificate from community server.");
	tn_community_Browser_processRequest("method=cert");
}

schedule(3000, 0, tn_community_Browser_request_cert);