// Tribes 2 Unofficial Authentication System
// http://www.tribesnext.com/
// Written by Electricutioner/Thyth
// Copyright 2008 by Electricutioner/Thyth and the Tribes 2 Community System Reengineering Intitiative

// Authentication Server Interface Version 1.0: 12/29/2008

$Authentication::Mode::Available = 1;
$Authentication::Mode::Name = 2;
$Authentication::Mode::Recover = 3;
$Authentication::Mode::Sign = 4;

$Authentication::Settings::Timeout = 30000;

function AuthenticationInterface::onLine(%this, %line)
{
	//warn(%line);
	if (isEventPending($Authentication::TransactionCompletionSchedule))
		cancel($Authentication::TransactionCompletionSchedule);
	$Authentication::TransactionCompletionSchedule = schedule(700, 0, Authentication_transactionComplete);

	if ($Authentication::Status::ActiveMode != 0)
	{
		$Authentication::Buffer[$Authentication::Status::ActiveMode] = $Authentication::Buffer[$Authentication::Status::ActiveMode] @ "\n" @ %line;
	}
}

// connection complete... send the buffer
function AuthenticationInterface::onConnected(%this)
{
	%this.send(%this.data);
}

function Authentication_transactionComplete()
{
	// terminate the connection
	AuthenticationInterface.disconnect();

	%buffer = trim($Authentication::Buffer[$Authentication::Status::ActiveMode]);
	if ($Authentication::Status::ActiveMode == $Authentication::Mode::Available)
	{
		if (strlen(%buffer) > 0 && %buffer $= "AVAIL")
		{
			echo("Authentication: Server is available.");
			$Authentication::Status::Available = 1;
		}
		else
		{
			error("Authentication: Server is not available.");
			$Authentication::Status::Available = 0;
		}
	}
	else if ($Authentication::Status::ActiveMode == $Authentication::Mode::Name)
	{
		if (%buffer $= "TOOSHORT")
		{
			$Authentication::Status::Name = "Requested name is too short.";
			error("Authentication: " @ $Authentication::Status::Name);

		}
		else if (%buffer $= "TOOLONG")
		{
			$Authentication::Status::Name = "Requested name is too long.";
			error("Authentication: " @ $Authentication::Status::Name);
		}
		else if (%buffer $= "INVALID")
		{
			$Authentication::Status::Name = "Requested name is rejected.";
			error("Authentication: " @ $Authentication::Status::Name);
		}
		else if (%buffer $= "TAKEN")
		{
			$Authentication::Status::Name = "Requested name is taken.";
			error("Authentication: " @ $Authentication::Status::Name);
		}
		else if (%buffer $= "SUCCESS")
		{
			$Authentication::Status::Name = "Name is available and acceptable.";
			echo("Authentication: " @ $Authentication::Status::Name);
		}
		else
		{
			// this shouldn't happen
			$Authentication::Status::Name = "Unknown name status code returned from server.";
			error("Authentication: " @ $Authentication::Status::Name);
		}
	}
	else if ($Authentication::Status::ActiveMode == $Authentication::Mode::Recover)
	{
		if (%buffer $= "RECOVERERROR")
		{
			// this generic error happens if a malformed request is sent to the server
			error("Authentication: Unknown credential recovery status code returned from server.");
		}
		else if (%buffer $= "NOTFOUND")
		{
			error("Authentication: No user with that name exists.");
		}
		else if (%buffer $= "INVALIDPASSWORD")
		{
			error("Authentication: Invalid password provided for that user.");
		}
		else if (getWord(%buffer, 0) $= "CERT:")
		{
			%cert = getSubStr(%buffer, 0, strstr(%buffer, "\n"));
			%buffer = getSubStr(%buffer, strstr(%buffer, "\n") + 1, strlen(%buffer));
			%exp = getSubStr(%buffer, 0, (strstr(%buffer, "\n") == -1 ? strlen(%buffer) : strstr(%buffer, "\n")));

			$Authentication::Status::LastCert = %cert;
			$Authentication::Status::LastExp = %exp;
			echo("Authentication: Successfully downloaded certificate and encrypted key.");
		}
		else
		{
			error("Authentication: Unknown recovery status code returned from server.");
		}
	}
	else if ($Authentication::Status::ActiveMode == $Authentication::Mode::Sign)
	{
		if (%buffer $= "REJECTED")
		{
			// this is returned if the user created an account from this IP in the last week, or 5 accounts total
			$Authentication::Status::Signature = "Server chose to reject account generation request.";
			error("Authentication: " @ $Authentication::Status::Signature);
		}
		else if (%buffer $= "INVALIDNAME")
		{
			// name taken, or otherwise not allowed
			$Authentication::Status::Signature = "Server rejected account name.";
			error("Authentication: " @ $Authentication::Status::Signature);
		}
		else if (%buffer $= "SIGNERROR")
		{
			$Authentication::Status::Signature = "Corrupt signature request rejected.";
			error("Authentication: " @ $Authentication::Status::Signature);
		}
		else if (strlen(%buffer) > 0 && getFieldCount(%buffer) > 4)
		{
			%cert = %buffer;
			$Authentication::Status::LastCert = %cert;
			$Authentication::Status::Signature = "Account generation successful.";
			echo("Authentication: " @ $Authentication::Status::Signature);
		}
		else
		{
			$Authentication::Status::Signature = "Unknown signature status code returned from server.";
			error("Authentication: " @ $Authentication::Status::Signature);
		}
	}

	// clear out the buffer
	$Authentication::Buffer[$Authentication::Status::ActiveMode] = "";
	$Authentication::Status::ActiveMode = 0;
}

// determine if the server is available
function Authentication_checkAvail()
{
	if ($Authentication::Status::ActiveMode != 0)
	{
		// already a request active, retry this one in 10 seconds
		schedule(10000, 0, Authentication_checkAvail);
		return;
	}

	$Authentication::Status::ActiveMode = $Authentication::Mode::Available;

	if (isObject(AuthenticationInterface))
		AuthenticationInterface.delete();
	new TCPObject(AuthenticationInterface);

	AuthenticationInterface.data = "AVAIL\n";
	AuthenticationInterface.connect($AuthServer::Address);
	$Authentication::TransactionCompletionSchedule = schedule($Authentication::Settings::Timeout, 0, Authentication_transactionComplete);
}

// determine if the given name is acceptable/available
function Authentication_checkName(%name)
{
	if ($Authentication::Status::ActiveMode != 0)
	{
		// already a request active, retry this one in 10 seconds
		schedule(10000, 0, Authentication_checkName, %name);
		return;
	}

	$Authentication::Status::ActiveMode = $Authentication::Mode::Name;

	if (isObject(AuthenticationInterface))
		AuthenticationInterface.delete();
	new TCPObject(AuthenticationInterface);

	AuthenticationInterface.data = "NAME\t" @ %name @ "\n";
	AuthenticationInterface.connect($AuthServer::Address);
	$Authentication::TransactionCompletionSchedule = schedule($Authentication::Settings::Timeout, 0, Authentication_transactionComplete);
}

// request a certificate and encrypted exponent from the authentication server
function Authentication_recoverAccount(%payload)
{
	if ($Authentication::Status::ActiveMode != 0)
	{
		// already a request active, retry this one in 10 seconds
		schedule(10000, 0, Authentication_recoverAccount, %payload);
		return;
	}

	$Authentication::Status::ActiveMode = $Authentication::Mode::Recover;

	if (isObject(AuthenticationInterface))
		AuthenticationInterface.delete();
	new TCPObject(AuthenticationInterface);

	AuthenticationInterface.data = "RECOVER\t" @ %payload @ "\n";
	AuthenticationInterface.connect($AuthServer::Address);
	$Authentication::TransactionCompletionSchedule = schedule($Authentication::Settings::Timeout, 0, Authentication_transactionComplete);
}

// request a new account certificate
function Authentication_registerAccount(%payload)
{
	if ($Authentication::Status::ActiveMode != 0)
	{
		// already a request active, retry this one in 10 seconds
		schedule(10000, 0, Authentication_registerAccount, %payload);
		return;
	}

	$Authentication::Status::ActiveMode = $Authentication::Mode::Sign;

	if (isObject(AuthenticationInterface))
		AuthenticationInterface.delete();
	new TCPObject(AuthenticationInterface);

	AuthenticationInterface.data = "SIGN\t" @ %payload @ "\n";
	AuthenticationInterface.connect($AuthServer::Address);
	$Authentication::TransactionCompletionSchedule = schedule($Authentication::Settings::Timeout, 0, Authentication_transactionComplete);
}