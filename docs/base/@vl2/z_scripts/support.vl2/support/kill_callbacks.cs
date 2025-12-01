// #name = Kill Callbacks
// #version = 1.0.1
// #date = September 9, 2002
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Simplified kill tracking Callback.
// #status = Release
// #include = support/map.cs
// #include = support/callback.cs
// #include = support/mute_tools.cs
// #include = support/team_tracker.cs

// This creates a single callback for all kill types, "KillCallback", with the following
// passed arguments:
//
// %type	: the MessageCallback type, such as "MsgLegitKill"
// %killer	: the playerRef of the player who performed the kill.
// %victim  : the playerRef of the player who was killed.
// %weapon	: the name of the implement that did the killing (e.g. "disc", "impact", "suicide").
// %i_die	: boolean flag - if true the player was killed in the exchange. Avoids name comparisons.
// %i_win	: boolean flag - if true the player was who performed this kill. Avoids name comparisons.
// %suicide	: boolean flag - if true the player just killed himself, either by CTRL-K or with a weapon.
// %tk		: boolean flag - if true this kill was a teamkill.

// It is posible to register other messages as kills and suicides (potentially useful for mods).
//
// killTypes.addKillType(%message);		: adds a new kill message
// killTypes.addSuicideType(%message);	: adds a new suicide message

if (!isObject(killTypes)) {

	new ScriptObject(killTypes) {

		class = "killTypes";
		typeMap = Container::newVectorMap();
		suicideMap = Container::newVectorMap();
	};
}

function killTypes::addKillType(%this, %typeName) {

	%this.typeMap.add(%typeName, true);
}

function killTypes::addSuicideType(%this, %typeName) {

	%this.suicideMap.add(%typeName, true);
}

function killTypes::isKillType(%this, %typeName) {

	if (%this.typeMap.value(%typeName)) return 1;
	return 0;
}

function killTypes::isSuicideType(%this, %typeName) {

	if (%this.suicideMap.value(%typeName)) return 1;
	return 0;
}

package killCallbacks {

	function defaultMessageCallback(%msgType, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8, %a9, %a10) 	{

		%type = detag(%msgType);

		// Ignore damage type value of zero
		if (killTypes.isKillType(%type) && detag(%a8)) {

			%weapon = detag(%a9);

			%victimName = detag(%a2);
			%victim = $PlayerList[TeamTracker.idsByName[%victimName]];
			%suicide = killTypes.isSuicideType(%type);

			%killerName = detag(%a5);
			if (%killerName !$= "") {

				%killer = $PlayerList[TeamTracker.idsByName[%killerName]];

				//%tk = ((%killer.teamID == %victim.teamID) || (%type $= "msgTeamKill"));
				%tk = %type $= "msgTeamKill";
				%i_win = (teamTracker.myID == %killer.clientID);
			}
			else {
				%tk = %i_win = false;
			}

			%i_die = (teamTracker.myID == %victim.clientID);

			Callback.trigger("KillCallback", %type, %killer, %victim, %weapon, %i_die, %i_win, %suicide, %tk);

			if(!Callback.returned("KillCallback", mute)) {
				parent::defaultMessageCallback(%msgType, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8, %a9, %a10);
			}
		}
		else parent::defaultMessageCallback(%msgType, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8, %a9, %a10);
	}
};

// mute_tools.cs can end up blocking calls to defaultMessageCallback. To avoid this I make sure
// it's loaded first (in the #include list) to force its package to be invoked after this one.

activatepackage(killCallbacks);

killTypes.addKillType("MsgHeadshotKill");
killTypes.addKillType("MsgLegitKill");
killTypes.addKillType("MsgRogueMineKill");
killTypes.addKillType("MsgRearshotKill");
killTypes.addKillType("msgCTurretKill");
killTypes.addKillType("msgCampKill");
killTypes.addKillType("msgExplosionKill");
killTypes.addKillType("msgLavaKill");
killTypes.addKillType("msgLightningKill");
killTypes.addKillType("msgOOBKill");
killTypes.addKillType("msgSelfKill");
killTypes.addKillType("msgSuicide");
killTypes.addKillType("msgTeamKill");
killTypes.addKillType("msgTurretKill");
killTypes.addKillType("msgTurretSelfKill");
killTypes.addKillType("msgVehicleKill");
killTypes.addKillType("msgVehicleSpawnKill");

killTypes.addSuicideType("msgSuicide");
killTypes.addSuicideType("msgSelfKill");
killTypes.addSuicideType("msgTurretSelfKill");