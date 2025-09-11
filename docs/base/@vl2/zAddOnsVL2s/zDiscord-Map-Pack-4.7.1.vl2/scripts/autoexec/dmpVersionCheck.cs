// Tells the server what version of the DMP pack the client is using
// This is used primarily for the server logo on the loading screen
// As the server will skip showing the server logo image if a 
// Version isnt detected
// Alternatively, this can also be used to debug aspects as the Pack version
// will be known to the server

$DMP::Version = 4.7;

// Client Only
addMessageCallback('MsgDMPVer', DMPReturn);

function DMPReturn()
{
   commandToServer('ClientDMPVersion',$DMP::Version);
}

// Server Only
function serverCmdClientDMPVersion(%client, %version)
{
	if(!%client.dmpVersion)
		%client.dmpVersion = %version;
}

package dmpVersionCheck
{

function GameConnection::onConnect( %client, %name, %raceGender, %skin, %voice, %voicePitch )
{
	parent::onConnect( %client, %name, %raceGender, %skin, %voice, %voicePitch );
	
	messageClient(%client, 'MsgDMPVer');
}

};

// Prevent package from being activated if it is already
if (!isActivePackage(dmpVersionCheck))
	activatePackage(dmpVersionCheck);