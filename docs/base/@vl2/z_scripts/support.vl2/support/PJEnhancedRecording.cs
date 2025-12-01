// #autoload
// #name = Enhanced Recordings
// #version = 1.0.1
// #date = November 20, 2002
// #author = Mark Dickenson ([AKA]PanamaJack)
// #warrior = Panama Jack
// #email = panamajack@planettribes.com
// #web = http://www.planettribes.com/pj
// #category = Support
// #description = Support for adding more information to demo recordings.
// #acknowledgements = none
// #status = working

// This script will add extra useful information to all REC files when they are created.  This will allow scripters to
// retreive useful information about the recording.  Scripters can also ADD their own special information to any
// recording that can only be procecessed by their scripts if a client has them installed.
//
// The standard information that is stored in each recording is easy to use and is stored in the following variables.
//
// Variable			Description
//----------------------------------------------------------------------------------------------
//
// NewRecordingData.clientid - The client id of the person who made the recording.
//
// NewRecordingData.playername - The Name of the Player including their Tribes Tag (if any) who made the recording.
//
// NewRecordingData.friendlyteam - The name of the team the Player was on.
//
// NewRecordingData.guid - The GUID of the player who made the recording.
//
// NewRecordingData.servername - The name of the Server where the recording was made.
//
// NewRecordingData.serverip - The IP Address of the server where the recording was made.
//
// NewRecordingData.date - The Date and Time the recording was made (IE: NOV-12-2002 10:30PM)
//
// NewRecordingData.mapname - The name of the Map where the recording was started.
//
// NewRecordingData.ruleset - The Ruleset or MOD running on the server (IE: Base, Variant, Shifter, ect).
//
// NewRecordingData.gametype - The Gamtype being played (IE: Cpature the Flag, Team Rabbit 2, ect).
//
// NewRecordingData.tourneymode - The mode the server was running "Free for All" or "Tournament".  FFA = 0, Tournament = 1
//
// All of the above data is accessable by any client sided script after a demo starts and will be standard in all recordings when this script is used.
//

// Something to store all of the variables in.

new scriptobject(NewRecordingData){
	elements = 0;
	tourneymode = 0;
	FirstInfo = 0;
};


// 1, clientid, playername, friendlyteam, guid
// 2, servername, serverip, date, mapname
// 3, ruleset, gametype,tourneymode(0 - Tourney Off/ 1 - Tourney On)

function readplayerinfo(%group, %arg1, %arg2, %arg3, %arg4){

	if(%group == 1){
		NewRecordingData.clientid = %arg1; //
		NewRecordingData.playername = %arg2; //
		NewRecordingData.friendlyteam = %arg3;
		NewRecordingData.guid = %arg4;
	}
	if(%group == 2){
		NewRecordingData.servername = %arg1; //
		NewRecordingData.serverip = %arg2; //
		NewRecordingData.date = %arg3; //
		NewRecordingData.mapname = %arg4; //
	}
	if(%group == 3){
		NewRecordingData.ruleset = %arg1; //
		NewRecordingData.gametype = %arg2; //
		NewRecordingData.tourneymode = %arg3; //
	}
}

// This function is how you would add your own data to the REC file.  You must be very carefull about what you place in here.
//
// %variable =	This is a special variable that is looked for by this script to determine if the script that will use the added REC information has been installed.
//		I could have used a file check but this needed to be very, very fast and checking for a file would cause enough delay to cause problems if there
//		were a large number of added entries to the REC file.  You MUST use a variable for this entry and place it inside QUOTES.
//
//		EXAMPLE:	addRecordingInfo("$MyVariable", ...  RIGHT
//		EXAMPLE:	addRecordingInfo("MyScriptObject.Variable", ...  RIGHT
//
//		EXAMPLE:	addRecordingInfo($MyVariable, ...  WRONG
//		EXAMPLE:	addRecordingInfo(1, ...  WRONG
//
//		This script will look for that variable and check to see if it equals 0 or 1.  If the variable equals 0 or is missing your information in the REC file will
//		not be processed and it will be bypassed.  If the variable equals 1 then the script will process your data frrom the REC file.
//
//		Just add a unique variable to the end of the script that will be using the information from the REC file you added.  Make sure it is equal to 0.
//
//
// %function =	This is the Function you would like to call to procecss the added data.  This function name MUST be inclosed in QUOTES and should not include
//		ANY parenthesis or semi-colons.
//
//		EXAMPLE:	addRecordingInfo("MyScriptObject.Variable", "myfunction", ...  RIGHT
//
//		EXAMPLE:	addRecordingInfo("MyScriptObject.Variable", "myfunction()", ...  WRONG
//		EXAMPLE:	addRecordingInfo("MyScriptObject.Variable", "myfunction();", ... WRONG
//
// %arg0-%arg4 =	These 5 arguments contain the data you would like to store in the REC file.  Be very carfull because the total data size of these arguments
//		cannot exceed 250 characters or they will be discarded.  The arguments work very similarly to the %variable and %function listed above.
//		The arguments can be variables, text, functions or a combination of any as long as they are enclosed in QUOTES.  If you wish to save just a text
//		string it must be enclosed in two sets of quotes IE: "\"My Text\""
//
//		VARIABLE EXAMPLE:	"$anothervariable"   RIGHT
//		FUNCTION EXAMPLE:	"myfunction()"   RIGHT
//		EXPRESSION EXAMPLE:	"$clTeamScore[$PlayerList[NewRecordingData.clientid].teamId,0]"   RIGHT
//		TEXT EXAMPLE:		"\"Test Text\""   RIGHT
//		NUMERIC EXAMPLE:	"2"   RIGHT
//
// 		Each argument is called and the information returned from the argument is saved in the REC file.
//
// FINAL EXAMPLE: addRecordingInfo("MyScriptObject.Variable", "myfunction", "$anothervariable", "myfunction()", "$clTeamScore[$PlayerList[NewRecordingData.clientid].teamId,0]", "\"Test Text\"", "2");
//
//
// When a REC file is played back this information is retrieved frrom the recording and processed.
//
// The data that was stored as the %variable is retrieved and processed.  If the variable is equal to 1 then the script that will use the data is present and the following data is proceessed.
// If the variable is equal to 0 or not present then the data is bypassed and the next set of data is checked.
//
// If the variable equalled 1 then the reset of the data is retrieved from the REC file and the function that was included in the %function is called and the argument data is passed to it.
//
//	IE: myfunction(%arg0, %arg1, %arg2, %arg3, %arg4);
//
// It is thin upto your function to proceess the data.
//


function addRecordingInfo(%variable, %function, %arg0, %arg1, %arg2, %arg3, %arg4){

	if(%variable $= "" || %function $= ""){
		error("Either the variable Variable or Function Variable is missing.");
		return;
	}

	NewRecordingData.variable[NewRecordingData.elements] = %variable;
	NewRecordingData.func[NewRecordingData.elements] = %function;

	NewRecordingData.arguments[NewRecordingData.elements @ "_0"] = %arg0;
	NewRecordingData.arguments[NewRecordingData.elements @ "_1"] = %arg1;
	NewRecordingData.arguments[NewRecordingData.elements @ "_2"] = %arg2;
	NewRecordingData.arguments[NewRecordingData.elements @ "_3"] = %arg3;
	NewRecordingData.arguments[NewRecordingData.elements @ "_4"] = %arg4;

	NewRecordingData.elements++;
}

// Get the current Map Name and Gametype and store for later use.
// This is part of the basic information prestored in all REC files for any scripter to use.

function RecMissionCheck(%msgType, %msgString, %bitmapName, %mapName, %missionType) {

	if(NewRecordingData.FirstInfo == 0){
		NewRecordingData.mapname = detag(%mapName);
		NewRecordingData.gametype = detag(%missionType);
		NewRecordingData.FirstInfo= 1;
	}
}

// Get the players Client ID and Player Name and store them for later use.

function RecJoin(%msgType, %msgString, %clientName, %clientId, %targetId, %isAI, %isAdmin, %isSuperAdmin, %isSmurf, %guid) {

	if(StrStr(%msgString, "Welcome to Tribes") != -1) {
		NewRecordingData.clientid = %clientId;
		NewRecordingData.playername = detag(%clientName);
	}
}

// All of the lovely function that need to be hooked into...

package PJPackagedRecording {

// Reset the FirstInfo and tourneymode flags when the player leave a server.

function DisconnectedCleanup() {

	parent::DisconnectedCleanup();

	NewRecordingData.FirstInfo = 0;
	NewRecordingData.tourneymode = 0;
}

// Reset the FirstInfo and tourneymode flags when the Map CHanges.

function DebriefGui::onWake(%this) {

	parent::onWake(%this);

	NewRecordingData.FirstInfo = 0;
	NewRecordingData.tourneymode = 0;
}

// Set the Tourney Mode flag is the server is in Tournament mode.

function clientCmdPickTeamMenu( %teamA, %teamB ){

	NewRecordingData.tourneymode = 1;

	parent::clientCmdPickTeamMenu( %teamA, %teamB );
}

// Get the Server Name, Server IP Address and the RuleSet(MOD) and store.

function GMJ_Browser::onSelect( %this, %address ) {

	parent::onSelect( %this, %address );

	%info = GMJ_Browser.getServerInfoString();
	NewRecordingData.servername = strlwr(getRecord( %info, 0));
	NewRecordingData.serverip = strlwr(getRecord( %info, 1));
	NewRecordingData.ruleset = strlwr(getRecord( %info, 2 ));
}

// Adds the new Recoding Information to the REC file.

function saveDemoSettings(){

	parent::saveDemoSettings();

	if(NewRecordingData.elements > 0){
		addDemoValue("NewDemoData");
		for(%i = 0; %i < NewRecordingData.elements; %i++){
			addDemoValue(NewRecordingData.variable[%i]);
			addDemoValue(NewRecordingData.func[%i]);
			eval("NewRecordingData.scripthold = " @ NewRecordingData.arguments[%i @ "_0"] @ ";");
			%temp = NewRecordingData.scripthold;
			for(%i1 = 1; %i1 < 5; %i1++){
				if(NewRecordingData.arguments[%i @ "_" @ %i1] $= "")
					%arg = "\"<BLANK>\"";
				else %arg = NewRecordingData.arguments[%i @ "_" @ %i1];

				eval("NewRecordingData.scripthold = " @ %arg @ ";");
				%temp = %temp TAB NewRecordingData.scripthold;
			}
			addDemoValue(%temp);
		}
	}
}

// Retreives the Recording information from the REC file and calls the associated functions if the required scripts are installed.

function loadDemoSettings(){

	parent::loadDemoSettings();

	%start = 0;

	for(%total = 0; $DemoValue[%total] !$= ""; %total++) {
		if($DemoValue[%total] $= "NewDemoData")
			%start = %total + 1;
	}

	if(%start != 0){
		for(%i = %start; %i < %total; %i++){
			NewRecordingData.scripthold = 0;
			eval("NewRecordingData.scripthold = " @ $DemoValue[%i] @ ";");
			if(NewRecordingData.scripthold $= "1"){
				for(%i1 = 0; %i1 < 5; %i1++){
					%a[%i1] = getField($DemoValue[%i + 2], %i1);
					if(%a[%i1] $= "<BLANK>")
						%a[%i1] = "";
				}
				call($DemoValue[%i + 1], %a[0], %a[1], %a[2], %a[3], %a[4]);
			}
			%i = %i + 2;
		}
	}
}

};

activatepackage(PJPackagedRecording);

// Setup the Basic Rocording Data that is saved in every recording.
// This is to establish a standard that all Scripters can pull data from without everyone duplicating the same data being stored in the REC file.

addRecordingInfo(1, "readplayerinfo", 1, "NewRecordingData.clientid", "NewRecordingData.playername", "$clTeamScore[$PlayerList[NewRecordingData.clientid].teamId,0]", "$playerlist[NewRecordingData.clientid].guid");
addRecordingInfo(1, "readplayerinfo", 2, "NewRecordingData.servername", "NewRecordingData.serverip", "formatTimeString(\"M-d-yy h:nnA\")", "NewRecordingData.mapname");
addRecordingInfo(1, "readplayerinfo", 3, "NewRecordingData.ruleset", "NewRecordingData.gametype", "NewRecordingData.tourneymode");

addMessageCallBack('MsgLoadInfo', RecMissionCheck);
addMessageCallback('MsgClientJoin', RecJoin);