// #name = Flag Tracking Support
// #version = 0.0.3
// #date = January 30, 2003
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Provides information about flag status, events and carrier kills.
// #status = Beta
// #include = support/team_tracker.cs 0.0.4
// #include = support/events 1.0.3
// #include = support/kill_callbacks.cs

// Currently only supports CTF
// Defines the following flag event callbacks:
//   onCTFGrab    -  Flag was taken from stand
//   onCTFCap     -  Flag was captured
//   onCTFDrop    -  Flag was dropped by carrier
//   onCTFPicked  -  Flag was taken from field
//   onCTFReturn  -  Flag was returned

// All of these callbacks pass a single parameter, %flagRef.
// A flagRef is the stateful object for each flag.

// A flagRef has the following data fields:
//   stateCurrent   -   Current state of this flag, see below for state definitions
//   statePrevious  -   Previous state of this flag (the one before the current one)
//   actorCurrent   -   PlayerRep of player who caused the change to the current state
//						For example, if the state is "Taken" this field will be the capper.
//   actorPrevious  -   PlayerRep of player who caused the change to the previous state
//   teamID         -   TeamID of team to whom this flag belongs (1 or 2)

// Valid states are all currently defined as strings. They are self explanitory:
//   "At Home"
//   "In Field"
//   "Taken"

// Also defines one additional callback 'CarrierKillCTF'
// This has all the parameters of a standard KillCallback (see kill_callbacks.cs)

// For CTF there is one other object, FlagTracker. This is a container object for the
// flagRef objects for each team.
// FlagTracker.team[1] is team 1's flag
// FlagTracker.team[2] is team 2's flag

$FT_gameTypeMap["CTFPlusGame"]     = "CTFgame";
$FT_gameTypeMap["PracticeCTFGame"] = "CTFgame";
   
//=============================================================================
// Flag state base class code
//=============================================================================

// Change to a new state based on current state and an event. Record the playerRep
// associated with the change.
function FlagState::updateState(%this, %event, %actorRef) {

	%this.statePrevious = %this.stateCurrent;
	%this.stateCurrent = %this.data.stateChange[%this.stateCurrent,%event];

	%this.actorPrevious = %this.actorCurrent;
	%this.actorCurrent = %actorRef;

	// Trigger any callback associated with a state change
	%callback = %this.data.callback[%this.statePrevious,%this.stateCurrent];
	if (%callback !$= "") {
		Callback.trigger(%callback,%this);
	}

	return %this.stateCurrent;
}

// Assign initial state based on an input string
// Used in CTF to assign state from the CTF objective HUD
function FlagState::initStatus(%this, %status) {

	%this.stateCurrent = %this.data.initialState[%status];
}

//=============================================================================
// Gametype agnostic code
//=============================================================================

function FT_activatePackage(%gameType) {

	error("==========="@$FT_gameType@"===========");

	if ($FT_gameTypeMap[%gameType] !$= "") %gameType = $FT_gameTypeMap[%gameType];

	%pkg = "FlagTrack" @ %gameType;
	
	if (%pkg !$= $FlagTrack::currentPkg) {

		if (isActivePackage($FlagTrack::currentPkg)) {
			warn("Deactivating" SPC $FlagTrack::currentPkg);
			deactivatePackage($FlagTrack::currentPkg);
		}
	
		if (isPackage(%pkg) && !isActivePackage(%pkg)) {
			warn("Activating" SPC %pkg);
			activatePackage(%pkg);
			$FlagTrack::currentPkg = %pkg;
		}
		else $FlagTrack::currentPkg = "";
	}
}

// Activate handler package based on current gametype
function FT_onGameType(%msgType, %msgString, %gameType) {

	%gameType = detag(%gameType);
	$FT_gameType = %gameType;
	
	FT_activatePackage(%gameType);
	call(FT_onMissionBegin);
}
addMessageCallback('MsgClientReady', FT_onGameType);

function FT_onLoadDemoSettings() {
		
	%pkg = "FlagTrack" @ objectiveHud.gameType;

	$FT_gameType = objectiveHud.gameType;
	FT_activatePackage(objectiveHud.gameType);
	call(FT_onDemoPlayBack);
	call(FT_onMissionBegin);
}
Callback.add(postLoadDemoSettings,"FT_onLoadDemoSettings");

// By default do nothing here. Registered gametypes will override this.
function FT_onMissionBegin() {

	echo("NO Flag Tracker");
}

//=============================================================================
// CTF code
//=============================================================================

// Constants for CTF Flag states
new ScriptObject(FlagStatesCTF) {

	state["In Field"] = 0;
	state["At Home"]  = 1;
	state["Taken"]    = 2;

	stateChange["At Home",  "MsgCTFFlagTaken"]    = "Taken";
	stateChange["Taken",    "MsgCTFFlagCapped"]   = "At Home";
	stateChange["Taken",    "MsgCTFFlagDropped"]  = "In Field";
	stateChange["In Field", "MsgCTFFlagTaken"]    = "Taken";
	stateChange["In Field", "MsgCTFFlagReturned"] = "At Home";

	initialState["<At Base>"]      = "At Home";
	initialState["<In the Field>"] = "In Field";
	//anything else                = "Taken";

	callback["At Home","Taken"]    = "onCTFGrab";
	callback["Taken","At Home"]    = "onCTFCap";
	callback["Taken","In Field"]   = "onCTFDrop";
	callback["In Field","Taken"]   = "onCTFPicked";
	callback["In Field","At Home"] = "onCTFReturn";
};

function FlagStateCTF::initStatus(%this, %status) {

	parent::initStatus(%this, %status);

	if (%this.stateCurrent $=  "") {

		// The state passed was a player name (with no tags) - they have the flag
		%this.stateCurrent = "Taken";
		%name = stripMLControlChars(%status);
		// Go find which player this is by looking in the PlayerListGroup
		%sz = PlayerListGroup.getCount();
		for (%i=0; %i < %sz; %i++) {
			%player = PlayerListGroup.getObject(%i);
			if (%name $= baseName(%player)) {
				%this.actorCurrent = %player;
				break;
			}
		}
	}
}

// Add a flag tracking object for each team.
// FlagTracker object created in CTF package version of FT_onMissionBegin()
function FT_ProcessCTFInit(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6) {

	%teamNum = detag(%a1);
	%flagStatus = detag(%a3);
	
	warn("Initializing flag state object for team" SPC %teamNum SPC "with state" SPC %flagStatus);

	FlagTracker.team[%teamNum] = new ScriptObject() {

		class = FlagStateCTF;
		superClass = FlagState;

		data = FlagStatesCTF;

		stateCurrent = "";
		statePrevious = "";

		teamID = %teamNum;

		actorCurrent = "";
		actorPrevious = "";
	};
	
	FlagTracker.team[%teamNum].initStatus(%flagStatus);
	FlagTracker.teamCount++;
}

// This is the main CTF event engine. All CTF callbacks are routed here and used to drive
// the state machine.
function FT_ProcessCTFMsg(%msgType, %msgString, %playerName, %flagTeam, %flagTeamID) {

	%playerName = detag(%playerName);

	// Base CTF callbacks are very inconsistent in their paramater values.
	// The same callback will pass different values depending on the context of the call
	// For example, the player name is sent as "0" if the message is sent to the player
	// in question.
	// To avoid string parsing, I reviewed the callbacks and assign meningful values
	// when I receive a "0" instead of a player name.
	// None of this matters in Classic, where Yogi enforced sending all the values.

	if (%playerName $= "0") {
		// If I got a "0" on flag return the flag returned due to timer.
		if (detag(%msgType) $= "MsgCTFFlagReturned") %playerRef = "";
		// Otherwise I got a "0" because it was *me* that acted on the flag
		else %playerRef = $PlayerList[TeamTracker.myID];
	}
	else %playerRef = $PlayerList[TeamTracker.idsByName[%playerName]];

	// In all cases where the flagTeamID is zero it pertains to the enemy flag.
	if (%flagTeamID == 0) %flagTeamID = TeamTracker.enemyTeamID;

	%flagRef = FlagTracker.team[%flagTeamID];
	%flagRef.updateState(detag(%msgType),%playerRef);
}

// Mutate kill callbacks to see if they are kills on a carrier and retrigger them as a new callback.
// The kill message is sent by CTF game code before the flag dropped message, so it's valid to
// check the current state of the flag
function FT_testCTFCarrierKill(%type, %killerRef, %victimRef, %weapon, %i_die, %i_win, %suicide, %tk) {

	// Assume only two teams here
	%flagRef = FlagTracker.team[(%victimRef.teamID == 1) ? 2 : 1];

	if ((%flagRef.stateCurrent $= "Taken") && (%victimRef == %flagRef.actorCurrent)) {
		Callback.trigger("CarrierKillCTF", %type, %killerRef, %victimRef, %weapon, %i_die, %i_win, %suicide, %tk);
	}
}

Callback.add(KillCallback,FT_testCTFCarrierKill);

package FlagTrackCTFGame {

	// CTF-specific startup code. Create a holder object for one flag state machine per team
	// Will be populated in FT_ProcessCTFInit()
	function FT_onMissionBegin() {

		echo("CTF Flag Tracker");

		if (isObject(FlagTracker)) {
			for (%i=1; %i <= FlagTracker.teamCount; %i++) {
				FlagTracker.team[%i].delete();
			}
			FlagTracker.delete();
		}

		new ScriptObject(FlagTracker) {

			class = FlagTracker;
		};
	}
	
	function FT_onDemoPlayBack() {
	
		%str = objectiveHud.getObject(6).getValue();
		if (%str $= "") FT_ProcessCTFInit("","",1,"","<At Base>");
		else FT_ProcessCTFInit("","",1,"",%str);

		%str = objectiveHud.getObject(7).getValue();
		if (%str $= "") FT_ProcessCTFInit("","",2,"","<At Base>");
		else FT_ProcessCTFInit("","",2,"",%str);
		
		FT_onMissionBegin();
	}
};

addMessageCallback('MsgCTFFlagReturned', FT_ProcessCTFMsg);
addMessageCallback('MsgCTFFlagDropped',  FT_ProcessCTFMsg);
addMessageCallback('MsgCTFFlagTaken',    FT_ProcessCTFMsg);
addMessageCallback('MsgCTFFlagCapped',   FT_ProcessCTFMsg);
addMessageCallback('MsgCTFAddTeam',      FT_ProcessCTFInit);
