// DisplayName = SkiFree

//--- GAME RULES BEGIN ---
//Ski through all the gates in order
//Use discjumps when needed
//Compete for the best time
//Happy 20th Anniversary to Tribes 2
//<spush><color:FFFF80>Version 1.04 (2021-03-29)<spop>
//--- GAME RULES END ---

$SkiFreeVersionString = "1.04";

// version 1.04 (2021-03-29)
// - fix issue with comparison numbers at the end of the run (floating point sucks)
// - fix issue with daily seed always generating the same set of gates in medium/hard modes (floating point still sucks)
// - add tourney 2021 map and add qualifier support
// - removed beacons because you can't see them anyway
// - removed Xtra_Ashen_Powder because i can't fucking read the terrain
// - added "prestige title" concept. currently only bots and i have a prestige title

// version 1.03 (2021-03-25)
// - fixed issue where spawn platform was sometimes cutting into terrain (it was checked but it was just ignoring the result)
// - spin spawn platform to match up to the first gate
// - removed the SURVIVAL scoring system. game will always be TIME TRIAL
// - yeti fixes for yeeting, intereference, correct skin
// - added hilarious april fool joke modes

// version 1.02 (2021-03-22)
// - show time instead of score in server query (escape menu is still wrong but i'm not fixing that shit)
// - added interference detection (discs that slow down players do not do anything)
// - added player-to-player discing toggle (turning it off makes it so discs do nothing to other players)

// version 1.01 (2021-03-15)
// - added version number to the game rules
// - fixed observer displaying score instead of time at the end of map
// - added a sound for <= 60 seconds (and yes, i also added one for 69 seconds)
// - removed ctrl+k messages

// version 1.00 (2021-03-14)
// - eat some pi

// Created by Red Shifter
// Thanks to:
// - DarkTiger for the phase through players code
// - Rooster128 for testing and saying stupid shit on stream
// - A bunch of people on T2 Discord for testing
// SkiFree is dedicated to the memory of Zengato, who was always there to read any shitty gametype idea I had, regardless of how stupid it was.
// Happy 20th Anniversary to Tribes 2. One more year until this game is old enough to drink.

// mapping instructions:
//
// step 1. make sure you add a terrainblock and it is named Terrain. this is how dynamix already did things...
// (one would be created if you didn't have one, but the SkiFree map already does that. no reason to make another)
//
// step 2. if you want to define where the spawnplatform is, grab it under shapes -> SkiFree Objects -> SkiFreeSpawnPlatform
// this generates the interior you need. don't rotate or resize it!
// (you'll need to restart the map for it to work)
//
// step 3. if you want to set up custom gate locations, grab it under shapes -> SkiFree Objects -> SkiFreeCustomGate
// place it on the ground where you want the gate to spawn - moving the waypoint into the air, etc is automatically handled
// there's a few properties you will want to define, and you need the underscore:
// - gateNum__ will be the gate number
// - isFinish__ will be the Finish Gate if the server is using Time Trial scoring. remember that it'll keep generating gates in Survival mode!

// NOTES FOR LATER:
//
// vaporware racing mode (will probably be SkiRace instead of SkiFree, which means i need to unify this code when i get there)
// - starts out as SkiFree without scoring, but game turns into a race when 2+ players join the game. should allow player joins up until 5 seconds after race starts
// - normal races will have minimum of 4 gates, and increase by 1 for every 2 extra players, up to a maximum of 8 gates at 8+ players
// - elimination races (minimum 4 players) will have 1 gate per player up to the maximum of 8 gates. the last person to not have crossed each gate dies (if someone dies between gates, count that as the gate kill)
// - race timer will be gate x 20 seconds (with a 30 second timer to explode a player that fails to cross a gate every 30 seconds)
// - exploding deadstop does not kill you
// - gates should give you extra repair so you can discjump more
// - enemies you MA have their momentum cut in half
// - ambient crowd noise should exist
// --- gets louder if the first 2/3 players are close to each other
// --- collective gasp if first place loses more than 40% of speed inside a second (from a deadstop, flubbing the route, or getting MA'ed)
// --- cheering at the end

if( $Host::SkiRacePhaseThroughPlayers $= "" ) {
	$Host::SkiRacePhaseThroughPlayers = 0;
}
if( $Host::SkiRaceTimeTrialScoringSystem $= "" ) {
	$Host::SkiRaceTimeTrialScoringSystem = 1;
}
if( $Host::SkiRaceAllowPvPDiscBoosting $= "" ) {
	$Host::SkiRaceAllowPvPDiscBoosting = 1;
}
if( $Host::SkiRaceAprilFoolsDisabledYear $= "" ) {
	$Host::SkiRaceAprilFoolsDisabledYear = 2020;
}

exec("scripts/SkiFreeDatablock.cs");
exec("scripts/SkiFreeOverrides.cs");
exec("scripts/SkiFreeAI.cs");
compile("scripts/SkiFreeTerrains.cs"); // compile for consistency's sake, not needed until it's time

function SkiFreeGame::sendGameVoteMenu( %game, %client, %key ) {
	DefaultGame::sendGameVoteMenu(%game, %client, %key);
	
	if(%client.isAdmin) {
		messageClient( %client, 'MsgVoteItem', "", %key, 'VotePhaseThroughPlayers', "", 
			$Host::SkiRacePhaseThroughPlayers
			? 'SkiFree: Turn Player Phasing OFF'
			: 'SkiFree: Turn Player Phasing ON'
		);
		
		// removed for lack of interest
		//messageClient( %client, 'MsgVoteItem', "", %key, 'VoteChangeScoringSystem', "", 
		//	$Host::SkiRaceTimeTrialScoringSystem
		//	? 'SkiFree: Change to SURVIVAL scoring (next map)'
		//	: 'SkiFree: Change to TIME TRIAL scoring (next map)'
		//);

		// player-to-player disc 
		messageClient( %client, 'MsgVoteItem', "", %key, 'VoteAllowPlayerDiscing', "", 
			$Host::SkiRaceAllowPvPDiscBoosting
			? 'SkiFree: Turn Player-to-Player Disc Boosting OFF'
			: 'SkiFree: Turn Player-to-Player Disc Boosting ON'
		);
		
		// april fools
		if( %game.isAprilFools($Host::SkiRaceAprilFoolsDisabledYear) ) {
			messageClient( %client, 'MsgVoteItem', "", %key, 'VoteToggleAprilFools', "", 
				'SkiFree: Turn hilarious April Fools joke OFF (next map)'
			);
		}
		else if( %game.isAprilFools() && $Host::SkiRaceAprilFoolsDisabledYear <= formatTimeString("yy") ) {
			messageClient( %client, 'MsgVoteItem', "", %key, 'VoteToggleAprilFools', "", 
				'SkiFree: Turn stupid April Fools joke ON (next map)'
			);
		}
	}
}

function SkiFreeGame::checkSkiFreeVote(%game, %client, %typeName) {
	if( %typeName $= "VotePhaseThroughPlayers" ) {
		$Host::SkiRacePhaseThroughPlayers = !$Host::SkiRacePhaseThroughPlayers;
		Game.phaseThroughPlayers($Host::SkiRacePhaseThroughPlayers);
		
		// TODO need to trap this event in skifree client script for best performance
		if( $Host::SkiRacePhaseThroughPlayers ) {
			messageAll('MsgAdminForce', '\c0%1 turned ON player phasing.', %client.name);
		}
		else {
			messageAll('MsgAdminForce', '\c0%1 turned OFF player phasing.', %client.name);
		}
	}
	else if( %typeName $= "VoteChangeScoringSystem" ) {
		//$Host::SkiRaceTimeTrialScoringSystem = !$Host::SkiRaceTimeTrialScoringSystem;
		//
		//if( $Host::SkiRaceTimeTrialScoringSystem ) {
		//	messageAll('MsgAdminForce', '\c0%1 switched to TIME TRIAL scoring (next map).', %client.name);
		//}
		//else {
		//	messageAll('MsgAdminForce', '\c0%1 switched to SURVIVAL scoring (next map).', %client.name);
		//}

		messageClient( %client, 0, 'Removed for lack of interest.' );
	}
	else if( %typeName $= "VoteAllowPlayerDiscing" ) {
		$Host::SkiRaceAllowPvPDiscBoosting = !$Host::SkiRaceAllowPvPDiscBoosting;
		
		if( $Host::SkiRaceAllowPvPDiscBoosting ) {
			messageAll('MsgAdminForce', '\c0%1 turned ON player-to-player Disc Boosting.', %client.name);
		}
		else {
			messageAll('MsgAdminForce', '\c0%1 turned OFF player-to-player Disc Boosting.', %client.name);
		}
	}
	else if( %typeName $= "VoteToggleAprilFools" ) {
		if( %game.isAprilFools($Host::SkiRaceAprilFoolsDisabledYear) ) {
			messageAll('MsgAdminForce', '\c0%1 turned OFF the hilarious April Fools joke (next map).', %client.name);
			$Host::SkiRaceAprilFoolsDisabledYear = formatTimeString("yy");
		}
		else if( %game.isAprilFools() && $Host::SkiRaceAprilFoolsDisabledYear <= formatTimeString("yy") ) {
			messageAll('MsgAdminForce', '\c0%1 turned ON the stupid April Fools joke (next map).', %client.name);
			$Host::SkiRaceAprilFoolsDisabledYear = 0;
		}
		else if( !%game.isAprilFools() ) {
			messageClient( %client, 0, 'The clock struck midnight, Cinderella.' );
		}
		else {
			messageClient( %client, 0, 'A mysterious force blocked this command.' );
		}
	}
}

function SkiFreeGame::checkDeadstop(%game, %targetObject, %oldVector) {
	%newVector = %targetObject.getVelocity();
//	error("velocity " SPC %oldVector SPC ">" SPC %newVector);
	%ox = mAbs(getWord(%oldVector,0)); %nx = mAbs(getWord(%newVector,0));
	%oy = mAbs(getWord(%oldVector,1)); %ny = mAbs(getWord(%newVector,1));
	%deadx = %nx <= 0.01 && %ox > 0.01;
	%deady = %ny <= 0.01 && %oy > 0.01;
	
	%deadstop = false;
	if( %deadx && %deady ) {
		%deadstop = true;
	}
	else if( %deadx && %oy == %ny ) {
		%deadstop = true;
	}
	else if( %deady && %ox == %nx ) {
		%deadstop = true;
	}
	
	if( %deadstop ) {
		// violent deadstop? check around the perimeter!
		%minh = 500;
		%maxh = -100;
		%h = %game.findHeight( getWords(%targetObject.position, 0, 1) );

		if( mAbs(getWord(%targetObject.position, 2) - %h) > 0.01 ) {
			// deadstops happen on the ground
			return;
		}
		
		for( %x = -1; %x <= 1; %x++ ) {
			for( %y = -1; %y <= 1; %y++ ) {
				%pos = (getWord(%targetObject.position, 0) + %x) SPC (getWord(%targetObject.position, 1) + %y);
				%nh = %game.findHeight(%pos);
				if( %minh > %h ) %minh = %h;
				if( %maxh < %h ) %maxh = %h;
			}
		}
		
		if( %minh != %maxh ) {
			//error("deadstop detected at" SPC %targetObject.position SPC "but variance is" SPC mAbs(%minh - %maxh) SPC "- no explosion");
			return;
		}
		// check the terrain height - should be close to 0

		//error("deadstop detected at" SPC %targetObject.position SPC "- kill the run");
		
		// what if, instead of exploding, we just go back to playing? just kidding! unless...
		// it is possible, though unlikely, to cut out like 50% of deadstops (the ones that do damage)
		// you would need to remove ground damage and schedule it to after the deadstop check
		// so it is possible, but getting to 100% is definitely not going to be easy
		//%targetObject.setVelocity(%oldVector);
		//return;
		
		// if we made it out of here, explode the player for deadstopping
		%targetObject.scriptKill($DamageType::Crash);
		
		%charge = new Item("lolDeadstop") {
			dataBlock = SatchelChargeDeadstop;
			rotation = "0 0 1 " @ (getRandom() * 360);
		};
		MissionCleanup.add(%charge);
		%charge.setTransform(%targetObject.getTransform());
		%charge.schedule(200, setDamageState, "Destroyed");
		%charge.schedule(200, blowup);
		%charge.schedule(2000, delete);
	}
}

function SkiFreeGame::initGameVars(%game) {
	// running tallies
	%game.gate = 0;
	
	// player variables
	%game.followTime = 5 * 1000; // if someone follows you off the spawn platform in this amount of time, give a message

	// always time trial for single player, otherwise use host setting
	if( %game.isSinglePlayer() ) {
		%game.timeTrial = 1;
	}
	else {
		%game.timeTrial = $Host::SkiRaceTimeTrialScoringSystem;
	}

	if( %game.timeTrial ) {
		// scoring by time trial
		%game.trialGates = 8;
		%game.trialDefaultTime = 5 * 60;
		%game.yetiSpawnTime = 200; // you're not done yet? get fucking going already
	}
	else {
		// scoring by distance
		%game.survivalLifeTime    = 60 * 1000; // length of run
		%game.survivalWarningTime = 10 * 1000; // amount of time remaining until warning
	}
	
	// auto-generation variables
	%game.firstGateMin   =  800;
	%game.firstGateMax   = 1100;
	%game.extraGateMin   =  600;
	%game.extraGateMax   =  900;
	%game.minGateAngle   = 45 * (3.1415927 / 180); // should be up to 22.5 degrees offset from last gate
	%game.angleIncrement = 15 * (3.1415927 / 180);
	%game.maxGateAngle   = 90 * (3.1415927 / 180); // should be up to 45.0 degrees offset from last gate
}

function SkiFreeGame::setUpTeams(%game) {  
	%group = nameToID("MissionGroup/Teams");
	if(%group == -1)
		return;
	
	// create a team0 if it does not exist
	%team = nameToID("MissionGroup/Teams/team0");
	if(%team == -1)
	{
		%team = new SimGroup("team0");
		%group.add(%team);
	}

	// 'team0' is not counted as a team here
	%game.numTeams = 0;
	while(%team != -1)
	{
		// create drop set and add all spawnsphere objects into it
		%dropSet = new SimSet("TeamDrops" @ %game.numTeams);
		MissionCleanup.add(%dropSet);

		%spawns = nameToID("MissionGroup/Teams/team" @ %game.numTeams @ "/SpawnSpheres");
		if(%spawns != -1)
		{
			%count = %spawns.getCount();
			for(%i = 0; %i < %count; %i++)
				%dropSet.add(%spawns.getObject(%i));
		}

		// set the 'team' field for all the objects in this team
		%team.setTeam(0);

		clearVehicleCount(%team+1);
		// get next group
		%team = nameToID("MissionGroup/Teams/team" @ %game.numTeams + 1);
		if (%team != -1)
			%game.numTeams++;
	}

	// set the number of sensor groups (including team0) that are processed
	setSensorGroupCount(10);
	%game.numTeams = 1;

	// allow teams 1->31 to listen to each other (team 0 can only listen to self)
	for(%i = 1; %i < 10; %i++)
		setSensorGroupListenMask(%i, 0xfffffffe);
}


function SkiFreeGame::equip(%game, %player) {
	for(%i =0; %i<$InventoryHudCount; %i++)
		%player.client.setInventoryHudItem($InventoryHudData[%i, itemDataName], 0, 1);
	%player.client.clearBackpackIcon();

	//%player.setArmor("Light");
	
	%player.clearInventory();

	%player.setInventory(EnergyPack, 1);
	%player.setInventory(TargetingLaser, 1);
//	%player.setInventory(Beacon, 3); // you can't see them anyway

	%player.setDamageLevel(0);
	%player.setEnergyLevel(60);
	%player.setInventory(FlareGrenade,5);
	%player.setInventory(Disc,1);
	%player.setInventory(DiscAmmo, 15);
	%player.setInventory(RepairKit,1);
	%player.weaponCount = 1;
	%player.use("Disc");
}

function SkiFreeGame::pickPlayerSpawn(%game, %client, %respawn) {
	if( isObject(SpawnPlatform) ) {
		// hackaround if yeti yeeted the platform
		if( SpawnPlatform.originalTransform !$= "" ) {
			SpawnPlatform.setTransform(SpawnPlatform.originalTransform);
		}
		
		%z = getWord(SpawnPlatform.position, 2) + 63.02;
		
		for( %i = 0; %i < 420; %i++ ) {
			%loc = %game.spawnPosition[%i];
			if( %loc $= "" ) {
				// game breaks down in other ways if we have this many people, lol
				return %game.spawnPosition[%i] SPC "300";
			}
			else {
				%adjUp = VectorAdd(%game.spawnPosition[%i] SPC %z, "0 0 1.0");
				if( ContainerBoxEmpty( $TypeMasks::PlayerObjectType, %adjUp, 2.0) ) {
					break;
				}
			}
		}
		
		// point the player in the direction of gate 1
		%rot = %game.selectSpawnFacing(%loc, nameToID("GatePoint1").position, 0);
		
		return %loc SPC %z SPC %rot;
	}
	
	return "0 0 300";
}

function SkiFreeGame::clientJoinTeam( %game, %client, %team, %respawn )
{
	%game.assignClientTeam( %client );
	%game.spawnPlayer( %client, %respawn );
}

function SkiFreeGame::assignClientTeam(%game, %client)
{
	// let's not even do the stupid DM thing
	// everyone drops to team 1 (except the yeti)
	if( !$SkiFreeYetiSpawning ) {
		%client.team = 1;
		
		// set player's skin pref here
		setTargetSkin(%client.target, %client.skin);

		// Let everybody know you are no longer an observer:
		messageAll( 'MsgClientJoinTeam', '\c1%1 has joined the race.', %client.name, "", %client, 1 );
		updateCanListenState( %client );
	}
	else {
		%client.team = 0;
	}
}

function SkiFreeGame::clientMissionDropReady(%game, %client) {
	if( %client.hasSkiGameClient ) {
		// TODO are we even going to make this?
	}
	else {
		// invoke bounty to give player info (mostly score and terrain info)
		messageClient(%client, 'MsgClientReady',"", BountyGame);
		messageClient(%client, 'msgBountyTargetIs', "", %game.terrain); // terrain
		if( %game.timeTrial ) {
			messageClient(%client, 'MsgYourScoreIs', "", '<none>');
		}
		else {
			messageClient(%client, 'MsgYourScoreIs', "", 0);
		}
	}
	
	%game.resetScore(%client);

	messageClient(%client, 'MsgMissionDropInfo', '\c0You are in mission %1 (%2).', $MissionDisplayName, $MissionTypeDisplayName, $ServerName ); 
	
	DefaultGame::clientMissionDropReady(%game, %client);
}

function SkiFreeGame::createPlayer(%game, %client, %spawnLoc, %respawn)
{
	DefaultGame::createPlayer(%game, %client, %spawnLoc, %respawn);
	%client.setSensorGroup(%client.team);
}

function SkiFreeGame::resetScore(%game, %client) {
	%client.score = 0;
	%client.bestTime = %game.trialDefaultTime;
	%client.lastTime = %game.trialDefaultTime;
	%client.bestHandicap = "";
	%client.maxGates = 0;
	
	for( %i = 1; %i < 420; %i++ ) {
		if( %client.gateTime[%i] $= "" ) break;
		%client.gateTime[%i] = "";
	}
	
	%game.prestigeTitle(%client);
}

// calculate how good a run it was
function SkiFreeGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement, %damageLocation) {
	%player = %clVictim.player;
	
	if( %damageType == $DamageType::Ground && %player.modGlass ) {
		// explode tha player into tiny pieces and make them watch
		%player.blowup();
		%player.schedule(0, setVelocity, "0 0 0");

		// make the shattering louder by doing it multiple times, lol
		for( %i = 0; %i < 2; %i++ ) messageClient(%clVictim, 0, '~wfx/Bonuses/horz_perppass3_glasssmash.wav');
	}
	
	// if we skipped a gate, don't bother
	if( %damageType != $DamageType::ForceFieldPowerup ) {
		if( !%game.timeTrial ) {
			%game.calculateSurvivalScore(%clVictim, %player, %damageType);
		}
	}
	
	Parent::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement, %damageLocation);
}

function SkiFreeGame::calculateTimeTrialScore(%game, %client, %player) {
	// finished a run
	%time = (getSimTime() - %player.launchTime) / 1000;
	%dot = strlen(strchr(%time, "."));
	if( %dot == 0 ) %time = %time @ ".000";
	else {
		while( %dot < 4 ) {
			%dot++;
			%time = %time @ "0";
		}
	}
	
	%client.lastTime = %time;
	
	if( %player.handicap $= "NONE" ) {
		%handicap = "";
	}
	else {
		%handicap = "in a" SPC %player.handicap SPC "run ";
	}
	
	%playerName = stripChars( getTaggedString( %client.name ), "\cp\co\c6\c7\c8\c9" );
	
	// play a sound on the client based on how well they did
	%qualified =
		MissionGroup.SkiFree_qualifierTime $= ""
			? 1
			: %time < MissionGroup.SkiFree_qualifierTime;

	if( %time <= 60 && %qualified ) {
		// are you fucking kidding (7.5 seconds per gate)
		// also make it louder for effect (and echo-y?)
		for( %i = 0; %i < 2; %i++ ) messageClient(%client, 0, '~wfx/misc/gamestart.wav');
		//%performance = "Are you fucking kidding me?!";
	}	
	else if( %time >= 69 && %time < 70 && %qualified ) {
		// 69 seconds (nice)
		messageClient(%client, 0, '~wfx/Bonuses/horz_straipass2_heist.wav');
		//%performance = "NICE";
	}
	else if( %time <= 80 && %qualified ) {
		// 10 seconds per gate
		messageClient(%client, 0, '~wfx/misc/MA2.wav');
		//%performance = "A very good performance!";
	}
	else if( %time <= 120 ) {
		// 15 seconds per gate
		messageClient(%client, 0, '~wfx/misc/MA1.wav');
		//%performance = "A good performance.";
	}
	else if( %time <= 160 ) {
		// 20 seconds per gate
		messageClient(%client, 0, '~wfx/misc/slapshot.wav');
		//%performance = "Try harder next time.";
	}
	else {
		// llama lol
		messageClient(%client, 0, '~wfx/bonuses/Nouns/llama.wav');
		//%performance = "You're a llama.";
	}
	
	if( %client.bestTime != %game.trialDefaultTime ) {
		if( %client.bestTime < %time ) {
			%formatL = "(\c5+";
			%compare = mFloor((%time - %client.bestTime) * 1000)/1000;
		}
		else if( %client.bestTime > %time ) {
			%formatL = "(\c3-";
			%compare = mFloor((%client.bestTime - %time) * 1000)/1000;
		}
		else {
			%formatL = "(+";
			%compare = "0.000";
		}
		
		%timeCompare = " " @ %formatL @ %compare @ "\c2)";
	}
	
	// recalculate score so we know who the best player is
	if( %client.bestTime > %time ) {
		%client.bestTime = %time;
		
		%client.score = %game.trialDefaultTime - %time;
		
		%client.bestHandicap =
			%player.handicap !$= "NONE"
			? %player.handicap
			: "";
		
		for( %i = 1; %i < 420; %i++ ) {
			if( %player.curGateTime[%i] $= "" ) break;
			%client.gateTime[%i] = %player.curGateTime[%i];
		}

		%game.recalcScore(%client);
		
		if( $TeamRank[0, count] > 1 ) {
			%rankNumber = 0;
			for( %i = 0; %i < $TeamRank[0, count]; %i++ ) {
				if( $TeamRank[0, %i] == %client ) {
					%rankNumber = %i + 1;
					break;
				}
			}
			
			if( %rankNumber > 0 ) {
				%rankPersonal = " You are now in" SPC %game.getWordForRank(%rankNumber) SPC "place.";
				%gender = (%client.sex $= "Male" ? "He" : "She");
				%rankOthers = " " SPC %gender SPC "is now in" SPC %game.getWordForRank(%rankNumber) SPC "place.";
			}
		}
	}

	
	messageAllExcept(%client, -1, 0, '%1 finished the course %3in %2 seconds.%4', %playerName, %time, %handicap, %rankOthers);
	messageClient(%client, 0, '\c2You finished the course %3in %2 seconds%5.%4', %playerName, %time, %handicap, %rankPersonal, %timeCompare);

	if( !%qualified ) {
		%diff = %time - MissionGroup.SkiFree_qualifierTime;
		if( %diff < 2 ) {
			%comment = "You're so close...";
		}
		else if( %diff < 5 ) {
			%comment = "Just a little more...";
		}
		else if( %diff < 10 ) {
			%comment = "You're almost there!";
		}
		else if( %diff < 15 ) {
			%comment = "You can do it!";
		}
		else if( %diff < 20 ) {
			%comment = "That was a good try.";
		}
		else {
			%comment = "If you dare...";
		}
		messageClient(%client, 0, '\c3Try to beat %1! %2', MissionGroup.SkiFree_qualifierTime, %comment);
	}
	else if( MissionGroup.SkiFree_qualifierTime !$= "" ) {
		messageClient(%client, 0, '\c3You have a qualifying time!');
	}
}

function SkiFreeGame::calculateSurvivalScore(%game, %client, %player, %damageType) {
	// make sure we started and that this is a valid run
	if( %player.launchTime !$= "" && %player.gate > 1 ) {
		// calculate score for the run v2
		%score = 0;
		for( %i = 1; %i < %player.gate; %i++ ) {
			%score += nameToID("GatePoint" @ %i).gateDistance;
			//echo("dist after gate " SPC %i SPC %distance);
		}
		
		// measure distance between the current point and the next point, then compare to player/next point
		%nextGate = nameToID("GatePoint" @ %player.gate);
		%nextPos = getWords(%nextGate.position, 0, 1) SPC "0";
		%playerPos = getWords(%player.position, 0, 1) SPC "0";
		
		%progress = %nextGate.gateDistance - vectorDist(%nextPos, %playerPos);
		if( %progress < 0 ) %progress = 0;
		
		%score += %progress;
		%score = mFloor(%score * 10) / 10;

		%playerName = stripChars( getTaggedString( %client.name ), "\cp\co\c6\c7\c8\c9" );
		
		if( %player.handicap $= "NONE" ) {
			%handicap = "";
		}
		else {
			%handicap = %player.handicap @ " ";
		}

		if( %damageType == $DamageType::NexusCamping ) {
			// also need a sound for the client
			if( %player.gate > 6 ) {
				messageClient(%client, 0, '~wfx/misc/MA2.wav');
			}
			else if( %player.gate > 4 ) {
				messageClient(%client, 0, '~wfx/misc/MA1.wav');
			}
			else if( %player.gate > 2 ) {
				messageClient(%client, 0, '~wfx/misc/slapshot.wav');
			}
			else {
				messageClient(%client, 0, '~wfx/bonuses/Nouns/llama.wav');
			}
		}
		
		if( %client.score != 0 ) {
			if( %client.score < %score ) {
				%formatL = "(\c3+";
				%compare = %score - %client.score;
			}
			else if( %client.score > %score ) {
				%formatL = "(\c5-";
				%compare = %client.score - %score;
			}
			else {
				%formatL = "(+";
				%compare = "0.0";
			}
			%compare = mFloor(%compare * 10) / 10;
			if( strpos(%compare, ".") == -1 ) %compare = %compare @ ".0";
			
			%scoreCompare = %formatL @ %compare @ "\c2) ";
		}
		
		// recalculate score so we know who the best player is
		if( %client.score < %score ) {
			%client.score = %score;
			%client.maxGates = (%player.gate - 1);
			
			for( %i = 1; %i < 420; %i++ ) {
				if( %player.curGateTime[%i] $= "" ) break;
				%client.gateTime[%i] = %player.curGateTime[%i];
			}

			%game.recalcScore(%client);
			
			%client.bestHandicap =
				%player.handicap !$= "NONE"
				? %player.handicap
				: "";

			if( $TeamRank[0, count] > 1 ) {
				%rankNumber = 0;
				for( %i = 0; %i < $TeamRank[0, count]; %i++ ) {
					if( $TeamRank[0, %i] == %client ) {
						%rankNumber = %i + 1;
						break;
					}
				}
				
				if( %rankNumber > 0 ) {
					%rankPersonal = " You are now in" SPC %game.getWordForRank(%rankNumber) SPC "place.";
					%gender = (%client.sex $= "Male" ? "He" : "She");
					%rankOthers = " " SPC %gender SPC "is now in" SPC %game.getWordForRank(%rankNumber) SPC "place.";
				}
			}
		}
		
		messageAllExcept(%client, -1, 0, '%1 did a %2m %5run (%3 gates).%4', %playerName, %score, %player.gate - 1, %rankOthers, %handicap);
		messageClient(%client, 0, '\c2That %5run went %2m %6(%3 gates).%4', %playerName, %score, %player.gate - 1, %rankPersonal, %handicap, %scoreCompare);
	}
}

function SkiFreeGame::updateKillScores(%game, %clVictim, %clKiller, %damageType, %implement) {
	// no killing
}

// need to do this to get the recalculations
function SkiFreeGame::recalcScore(%game, %client){
	if( %game.timeTrial ) {
		if( %client.bestTime == %game.trialDefaultTime ) {
			messageClient(%client, 'MsgYourScoreIs', "", '<none>');
		}
		else {
			messageClient(%client, 'MsgYourScoreIs', "", %client.bestTime);
		}
	}
	else {
		messageClient(%client, 'MsgYourScoreIs', "", %client.score);
	}

	%game.recalcTeamRanks(%client);
	%game.checkScoreLimit(%client);
}

function SkiFreeGame::timeLimitReached(%game) {
	logEcho("game over (timelimit)");
	%game.gameOver();
	cycleMissions();
}

function SkiFreeGame::scoreLimitReached(%game) {
	// no score limit
}

function SkiFreeGame::checkScoreLimit(%game) {
	// no score limit
}

function SkiFreeGame::gameOver(%game) {
	//call the default
	DefaultGame::gameOver(%game);

	messageAll('MsgGameOver', "Match has ended.~wvoice/announcer/ann.gameover.wav" );

	cancel(%game.timeThread);
	messageAll('MsgClearObjHud', "");
	for(%i = 0; %i < ClientGroup.getCount(); %i ++) {
		%client = ClientGroup.getObject(%i);
		%game.resetScore(%client);
	}
	
	// turn off phasing in case we're moving to a new gametype
	%game.phaseThroughPlayers(false);
}

function SkiFreeGame::enterMissionArea(%game, %playerData, %player) {
	// do nothing
}

function SkiFreeGame::leaveMissionArea(%game, %playerData, %player) {
	// do nothing
}

function SkiFreeGame::updateScoreHud(%game, %client, %tag)
{
	// Clear the header:
	messageClient( %client, 'SetScoreHudHeader', "", "" );

	// Send the subheader:
	//messageClient(%client, 'SetScoreHudSubheader', "", '<tab:15,247,430>\tPLAYER\tRUNS (FULL)\tBEST');
	messageClient(%client, 'SetScoreHudSubheader', "", '<tab:15,460>\tPLAYER\tBEST');

	for (%index = 0; %index < $TeamRank[0, count]; %index++)
	{
		//get the client info
		%cl = $TeamRank[0, %index];

		%clStyle = %cl == %client ? "<color:dcdcdc>" : "";
		
		if( %game.timeTrial ) {
			if( %cl.bestTime != %game.trialDefaultTime ) {
				%score = %cl.bestTime;
			}
			else {
				%score = %game.trialDefaultTime @ ".000";
			}
				
			%scoreAddendum = "";
		}
		else {
			%score = mFloor(%cl.score) == %cl.score
				? %cl.score @ ".0"
				: %cl.score;
				
			%scoreAddendum = " (" @ %cl.maxGates @ " gates)";
		}
		
		if( %cl.isAIControlled() && %cl.SkiFreeTitle $= "" ) {
			%game.prestigeTitle(%cl);
		}
		
		//if the client is not an observer, send the message
		if (%client.team != 0)
		{
			// why am i using word wrap lol
			messageClient( %client, 'SetLineHud', "", %tag, %index, '%5<tab:20,450,500>\t<clip:200>%1</clip><rmargin:400><just:right>%2<rmargin:490><just:right>%3<rmargin:580><just:left>%4', %cl.name, %cl.SkiFreeTitle, %score, %scoreAddendum, %clStyle, %cl);
		}
		//else for observers, create an anchor around the player name so they can be observed
		else
		{
			messageClient( %client, 'SetLineHud', "", %tag, %index, '%5<tab:20,450,500>\t<clip:200><a:gamelink\t%6>%1</a></clip><rmargin:400><just:right>%2<rmargin:490><just:right>%3<rmargin:580><just:left>%4', %cl.name, %cl.SkiFreeTitle, %score, %scoreAddendum, %clStyle, %cl);
		}
	}

	// Tack on the list of observers:
	%observerCount = 0;
	for (%i = 0; %i < ClientGroup.getCount(); %i++)
	{
		%cl = ClientGroup.getObject(%i);
		if( %cl == $SkiFreeYeti ) continue; // it's a secret to everybody
		if (%cl.team == 0)
			%observerCount++;
	}

	if (%observerCount > 0)
	{
		messageClient( %client, 'SetLineHud', "", %tag, %index, "");
		%index++;
		messageClient(%client, 'SetLineHud', "", %tag, %index, '<tab:10, 310><spush><font:Univers Condensed:22>\tOBSERVERS (%1)<rmargin:260><just:right>TIME<spop>', %observerCount);
		%index++;
		for (%i = 0; %i < ClientGroup.getCount(); %i++)
		{
			%cl = ClientGroup.getObject(%i);
			if( %cl == $SkiFreeYeti ) continue; // it's a secret to everybody
			//if this is an observer
			if (%cl.team == 0)
			{
				%obsTime = getSimTime() - %cl.observerStartTime;
				%obsTimeStr = %game.formatTime(%obsTime, false);
				messageClient( %client, 'SetLineHud', "", %tag, %index, '<tab:20, 310>\t<clip:150>%1</clip><rmargin:260><just:right>%2',
									%cl.name, %obsTimeStr );
				%index++;
			}
		}
	}

	//clear the rest of Hud so we don't get old lines hanging around...
	messageClient( %client, 'ClearHud', "", %tag, %index );
}

function SkiFreeGame::missionLoadDone(%game) {
	Parent::missionLoadDone(%game);
	%game.generateLevel();
	
	// change gate colors
	%game.setSensorWaypointColors();
	
	// see if phasing should be on or not
	%game.phaseThroughPlayers($Host::SkiRacePhaseThroughPlayers);
}

function SkiFreeGame::setSensorWaypointColors(%game) {
	for( %group = 0; %group <= 1; %group++ ) {
		setSensorGroupColor(%group, 1 << 1, "0 255 0 255"); // team1 should be green and be perceived as green
		// the rest are for waypoint colors
		setSensorGroupColor(%group, 1 << 2, "255 0 0 255");
		setSensorGroupColor(%group, 1 << 3, "255 128 0 255");
		setSensorGroupColor(%group, 1 << 4, "255 255 0 255");
		setSensorGroupColor(%group, 1 << 5, "0 255 0 255"); // yes we used this color twice. it'd be way too much work to not do that
		setSensorGroupColor(%group, 1 << 6, "0 0 255 255");
		setSensorGroupColor(%group, 1 << 7, "128 0 255 255");
		setSensorGroupColor(%group, 1 << 8, "255 0 255 255");
		setSensorGroupColor(%group, 1 << 9, "255 255 255 255");
	}
	
	// focus assist
	for( %group = 2; %group <= 9; %group++ ) {
		setSensorGroupColor(%group, 1 << 1, "0 255 0 255"); // team1 should be green and be perceived as green
		
		for( %target = 2; %target <= 9; %target++ ) {
			if( %group == %target ) {
				// next gate always shows up green
				setSensorGroupColor(%group, 1 << %target, "0 255 0 255");
			}
			else if( %group == %target - 1 ) {
				// gate after next always shows up red
				setSensorGroupColor(%group, 1 << %target, "255 0 0 255");
			}
			else {
				// other gates should just not show up
				setSensorGroupColor(%group, 1 << %target, "0 0 0 0");
			}
		}
	}

	// let team1 see each other (?)
	setTargetAlwaysVisMask(1, 1 << 1);
	setTargetFriendlyMask(1, 1 << 1);
	
	// make team1 show up to everyone (needed for focus assist)
	setSensorGroupAlwaysVisMask(1, 0xffffffff);
	setSensorGroupFriendlyMask(1, 0xffffffff);
}

function SkiFreeGame::applyConcussion(%game, %player) {}
function SkiFreeGame::dropFlag(%game, %player) {}

// make a spawn platform and calculate where the spawn points should be
function SkiFreeGame::addSpawnPlatform(%game, %position) {
	// position should on the ground
	
	// best interior: bwall4.dif, scaled 3 3 3 (Z-scale will need fine tuning based on experience)
	// it's about 30x30 in game units at the 3x3 scale. this is a perfect square and big enough to fit a lot of people on it. in fact, it might be TOO BIG
	if( !isObject(SpawnPlatform) ) {
		%spawnPlatform = new InteriorInstance("SpawnPlatform") {
			position = %position;
			rotation = "1 0 0 0";
			scale = "3 3 3";
			interiorFile = "bwall4.dif";
			showTerrainInside = "0";
		};
		MissionCleanup.add(%spawnPlatform);
	}
	
	// add other stuff directly
	%waypointPosition = 
		getWord(%position, 0) 
		SPC getWord(%position, 1)
		SPC (getWord(%position, 2) + 63);

	%waypointObj = new WayPoint("GatePoint0") {
		position = %waypointPosition;
		rotation = "1 0 0 0";
		scale = "1 1 1";
		dataBlock = "WayPointMarker";
		team = 1;
		name = "Starting Point";
	};
	MissionCleanup.add(%waypointObj);

	// add an observer camera pointed at the platform because why not
	%cameraPosition = 
		(getWord(%position, 0) - 40)
		SPC (getWord(%position, 1) + 40)
		SPC (getWord(%position, 2) + 81);
	
	%cameraObj = new Camera("ObserverCameraLocation") {
		position = %cameraPosition;
		rotation = "0.0949807 -0.215256 0.971928 133.575";
		scale = "1 1 1";
		dataBlock = "Observer";
		lockCount = "0";
		homingCount = "0";

		team = "0";
	};
	MissionCleanup.add(%cameraObj);
	
	// add a trigger to specify that a player's run has begun
	%triggerPosition = (getWord(%position, 0) - 15)
		SPC (getWord(%position, 1) + 15)
		SPC (getWord(%position, 2) + 63);

	%triggerObj = new Trigger("SpawnTrigger") {
		position = %triggerPosition;
		rotation = "1 0 0 0";
		scale = "30 30 5";
		dataBlock = "SkiFreeTriggerSpawn";
		lockCount = "0";
		homingCount = "0";
		polyhedron = "0 0 0 1 0 0 -0 -1 -0 -0 -0 1";
		
		gate = %gate;
	};
	
	MissionCleanup.add(%triggerObj);
	
	// build spawn platforms
	%x = getWord(%position, 0);
	%y = getWord(%position, 1);
	%game.spawnPosition[0] = %x SPC %y;
	
	%i = 1;
	%i = %game.createMoreSpawns(%x, %y, %i,  7.0);
	%i = %game.createMoreSpawns(%x, %y, %i, 14.0);
	%i = %game.createMoreSpawns(%x, %y, %i,  3.5);
	%i = %game.createMoreSpawns(%x, %y, %i, 10.5);
}

function SkiFreeGame::createMoreSpawns(%game, %ox, %oy, %i, %extent) {
	for( %x = %ox - %extent; %x <= %ox + %extent; %x += 7 ) {
		for( %y = %oy - %extent; %y <= %oy + %extent; %y += 7) {
			//echo(%x SPC %y);
			%game.spawnPosition[%i] = %x SPC %y;
			%i++;
		}
	}
	
	return %i;
}

function SkiFreeGame::addGate(%game, %gate, %position) {
	// debugging
	if( isObject(nameToID("GatePoint" @ %gate)) ) {
		for( %i = %gate; %i < 420; %i++ ) {
			if( !isObject(nameToID("GatePoint" @ %i)) ) break;
			nameToId("GatePoint" @ %i).delete();
			nameToId("GateFF" @ %i).delete();
			nameToId("GateTrigger" @ %i).delete();
		}
	}
	
	// waypoint should have +25 to Z so it's slightly off the ground
	%waypointPosition = 
		getWord(%position, 0) 
		SPC getWord(%position, 1)
		SPC (getWord(%position, 2) + 25);
		
	// get distance from last point
	%distanceFromLastGate =
		vectorDist(
			getWords(%waypointPosition, 0, 1) SPC "0",
			getWords(nameToID("GatePoint" @ (%gate - 1)).position, 0, 1) SPC "0"
		);

	// give out a number 2-9 (just repeat the gate colors)
	%gateColor = ((%gate - 1) % 8) + 2;
	
	if( %game.timeTrial && %gate == %game.trialGates ) {
		%gateName = "Finish Gate";
	}
	else {
		%gateName = "Gate " @ %gate;
	}

	%waypointObj = new WayPoint("GatePoint" @ %gate) {
		position = %waypointPosition;
		rotation = "1 0 0 0";
		scale = "1 1 1";
		dataBlock = "WayPointMarker";
		team = %gateColor;
		name = %gateName;
		
		gateDistance = %distanceFromLastGate;
	};

	// subtract 12.5 from X and Y so it's centered
	// also subtract 50 from Z
	%gatePosition =
		(getWord(%position, 0) - 12.5)
		SPC (getWord(%position, 1) - 12.5) 
		SPC (getWord(%position, 2) - 50.0);
	
	// create the forcefield as our visual indicator
	%gateType = "SkiFreeGateField" @
		(%gate <= 7 ? %gate : "")
	;
	%gateObj = new ForceFieldBare("GateFF" @ %gate) {
		position = %gatePosition;
		rotation = "1 0 0 0";
		scale = "25 25 500";
		dataBlock = %gateType;
	};
	
	// trigger spawns with wrong Y coordinate and needs to be +25, don't ask me Y
	%triggerPosition = 
		getWord(%gatePosition, 0) 
		SPC (getWord(%gatePosition, 1) + 25) 
		SPC getWord(%gatePosition, 2);
	
	// create the trigger that will actually process the player touching the gate
	%triggerObj = new Trigger("GateTrigger" @ %gate) {
		position = %triggerPosition;
		rotation = "1 0 0 0";
		scale = "25 25 500";
		dataBlock = "SkiFreeTriggerGate";
		lockCount = "0";
		homingCount = "0";
		polyhedron = "0 0 0 1 0 0 -0 -1 -0 -0 -0 1";
		
		gate = %gate;
	};

	MissionCleanup.add(%waypointObj);
	
	MissionCleanup.add(%gateObj);
	%gateObj.open();
	
	MissionCleanup.add(%triggerObj);
}

function SkiFreeGame::pickObserverSpawn(%game, %client, %next) {
	if( isObject(nameToID("ObserverCameraLocation")) ) {
		return nameToId("ObserverCameraLocation");
	}
	else {
		DefaultGame::pickObserverSpawn(%game, %client, %next);
	}
}

function SkiFreeGame::leaveSpawnTrigger(%game, %player) {
	if( !isObject(%player.client) ) return;
	if( %player.getState() $= "Dead" ) return;
	
	// make sure we didn't jump the gun already
	if( %player.launchTime !$= "" ) return;
	
	// check if we're ai controlling ourselves and if we meant to launch
	if( %player.client.isAIControlled() && !%player.AI_meantToLaunch && %player.getControllingClient() == %player.client ) {
		// just set the player back on the platform
		if( !isObject(%player.resetThread) ) {
			%player.resetThread = Game.schedule(2000, AI_resetPosition, %player.client, %player);
		}
		return;
	}
	
	// start the run for this player
	%mod = "";
	
	if( %player.getDamageLevel() >= 0.649 ) {
		%player.modGlass = 1;
		%mod = %mod @ "glass ";

		%player.setInventory(RepairKit, 0);
		Game.schedule(1000, GlassModeAnticheat, %player); // in case we ate a repair kit at exactly the right time
	}
	else if( %player.getInventory("Disc") == 0 ) {
		// check velocity
		if( !%player.hasDiscjumped ) {
			%mod = %mod @ "discless ";
		}
		else {
			%mod = %mod @ "single discjump ";
		}
	}
	
	if( %player.getInventory("EnergyPack") == 0 ) {
		%player.modHard = 1;
		%mod = %mod @ "hard mode ";
	}
	
	if( %mod !$= "" ) {
		%player.handicap = getSubStr(%mod, 0, strlen(%mod) - 1);
	}
	else {
		%player.handicap = "NONE";
	}
	
 	%client = %player.client;
	
	if( %game.timeTrial ) {
		%objective = "Ski through the gates in order until you get to the Finish Gate.";
		
		if( !Game.isSinglePlayer() ) {
			%player.schedule(Game.trialDefaultTime * 1000, scriptKill, $DamageType::NexusCamping);
		}
		else {
			if( %player.getInventory(FlareGrenade) == 0 ) {
				// taunted the yeti
				Game.createYetiFor(%player, nameToID("GatePoint" @ Game.trialGates).getTransform());
			}
			else {
				Game.schedule(Game.yetiSpawnTime * 1000, createYetiFor, %player, nameToID("GatePoint" @ Game.trialGates).getTransform());
			}
		}
	}
	else {
		%objective = "You have" SPC (Game.survivalLifeTime / 1000) SPC "seconds to go as far as you can.";
		%player.schedule(Game.survivalLifeTime, scriptKill, $DamageType::NexusCamping);
		Game.schedule(Game.survivalLifeTime - Game.survivalWarningTime, warningMessage, %player);
	}
	
	messageClient(%client, 0, '\c2Your %1run has begun. %2~wfx/misc/target_waypoint.wav', %mod, %objective);
	%player.launchTime = getSimTime();
	Game.lastLaunchTime = getSimTime();
	Game.setPlayerGate(%player, 1);
	
	// remove invincibility
	%player.setInvincibleMode(0 ,0.00);
	%player.setInvincible( false );
	
	Game.checkFollowingPlayers(%player);
	Game.schedule(Game.followTime, listFollowingPlayers, %player);
}

function SkiFreeGame::setPlayerGate(%game, %player, %gate) {
	%player.gate = %gate;
	if( isObject(%player.client) ) {
		%team = %gate + 1;
		if( %team > 9 ) %team = 1;
		%player.client.setSensorGroup(%team);
	}
}

function SkiFreeGame::enterSpawnTrigger(%game, %player) {
	if( !isObject(%player.client) ) return;
	if( %player.getState() $= "Dead" ) return;
	
	// we jumped the gun
	if( %player.launchTime !$= "" && !%player.noMulligans ) {
		%player.noMulligans = true;
		%client = %player.client;
		messageClient(%client, 0, '\c2Hey, no mulligans! Your timer is still running!~wfx/packs/shield_hit.wav');
	}
}

function SkiFreeGame::checkFollowingPlayers(%game, %player) {
	%client = %player.client;
	
	for( %i = 0; %i < ClientGroup.getCount(); %i++ ) {
		%clTarget = ClientGroup.getObject(%i);
		if( %clTarget == %client ) continue;
		%plTarget = %clTarget.player;
		if( !isObject( %plTarget ) || %plTarget.launchTime $= "" ) continue;

		// get everyone that started a run within 5 seconds of you
		if( %player.launchTime - %game.followTime <= %plTarget.launchTime ) {
			// three different variables based on handicap
			if( %plTarget.handicap $= "NONE" ) {
				%plTarget.following++;
				%plTarget.followName = %client.name;
			}
			else if( %plTarget.handicap $= %player.handicap ) {
				%plTarget.followingMatch++;
				%plTarget.followMatchName = %client.name;
			}
			else if( %plTarget.handicap !$= %player.handicap ) {
				%plTarget.followingNoMatch++;
				%plTarget.followNoMatchName = %client.name;
			}
			
			if( %player.handicap $= "NONE" ) {
				%player.following++;
				%player.followName = %clTarget.name;
			}
			else if( %player.handicap $= %plTarget.handicap ) {
				%player.followingMatch++;
				%player.followMatchName = %clTarget.name;
			}
			else if( %player.handicap !$= %plTarget.handicap ) {
				%player.followingNoMatch++;
				%player.followNoMatchName = %clTarget.name;
			}
		}
	}
}

function SkiFreeGame::listFollowingPlayers(%game, %player) {
	if( !isObject(%player.client) ) return;
	if( %player.getState() $= "Dead" ) return;
	
	%client = %player.client;
	
	if( %player.handicap $= "NONE" ) {
		if( %player.following > 1 )
			messageClient(%client, 0, 'You are in a run with %1 other players.', %player.following);
		else if( %player.following == 1 )
			messageClient(%client, 0, 'You are in a run with %1.', %player.followName);
	}
	else {
		if( %player.followingMatch > 1 )
			messageClient(%client, 0, 'You are in a %2 run with %1 other players.', %player.followingMatch, %player.handicap);
		else if( %player.followingMatch == 1 )
			messageClient(%client, 0, 'You are in a %2 run with %1.', %player.followMatchName, %player.handicap);
			
		if( %player.followingNoMatch > 1 )
			messageClient(%client, 0, '%1 players did not choose the same handicap.', %player.followingNoMatch);
		else if( %player.followingNoMatch == 1 )
			messageClient(%client, 0, '%1 did not choose the same handicap as you.', %player.followNoMatchName);
			
	}
}

function SkiFreeGame::GlassModeAntiCheat(%game, %player) {
	if( !isObject(%player.client) ) return;
	if( %player.getState() $= "Dead" ) return;

	if( %player.getDamageLevel() < 0.649 ) {
		%player.setDamageLevel(0.65);
		Game.schedule(100, GlassModeAnticheat, %player);
	}
}


function SkiFreeGame::enterGateTrigger(%game, %trigger, %player) {
	if( !isObject(%player.client) ) return;
	if( %player.getState() $= "Dead" ) return;
	if( %player.client == $SkiFreeYeti ) return;
	
	if( %trigger.gate == %player.gate ) {
		Game.setPlayerGate(%player, %player.gate + 1);
			
		if( %game.timeTrial && %trigger.gate == %game.trialGates ) {
			// finish the game
			%game.calculateTimeTrialScore(%player.client, %player);
			if( !%game.isSinglePlayer() ) {
				%player.schedule(3000, scriptKill, %player, 0);
			}
			else {
				%game.createYetiFor(%player);
			}
		}
		else {
			// ready the next gate
			if( !%player.modGlass ) %player.applyRepair(0.125);
			%player.setInventory(DiscAmmo, 15);
			
			// get other variables
			%timeMS = (getSimTime() - %player.launchTime) / 1000;
			%timeMS = mFloor(%timeMS * 1000)/1000;
			%kph = mFloor(VectorLen(setWord(%player.getVelocity(), 2, 0)) * 3.6);

			%bestTimeMS = %player.client.gateTime[%trigger.gate];
			
			if( %bestTimeMS !$= "" ) {
				if( %bestTimeMS < %timeMS ) {
					%formatL = '(\c5+';
					%compare = mFloor((%timeMS - %bestTimeMS) * 1000)/1000 ;
				}
				else if( %bestTimeMS > %timeMS ) {
					%formatL = '(\c3-';
					%compare = mFloor((%bestTimeMS - %timeMS) * 1000)/1000;
				}
				else {
					%formatL = '(+';
					%compare = 0;
				}
				%formatR = '\c0)';
			}
			
			%player.curGateTime[%trigger.gate] = %timeMS;
			
			messageClient(%player.client, 0, '\c0Passed Gate %1 at %2 seconds (Speed: %3kph) %4%5%6~wfx/misc/target_waypoint.wav', %trigger.gate, %timeMS, %kph, %formatL, %compare, %formatR);
			
			// generate gate +2 if it doesn't exist
			if( Game.gate == %player.gate ) {
				Game.generateGate(%player.gate + 1);
			}
			
			// deal with ai
			if( %player.client.isAIControlled() ) {
				%game.AI_crossedGate(%player.client, %player);
			}
		}
	}
	else if( %trigger.gate > %player.gate ) {
		messageClient(%player.client, 0, '\c2GATE SKIP DETECTED!~wfx/misc/red_alert_short.wav');
		%player.scriptKill($DamageType::ForceFieldPowerup);
		%player.setVelocity("0 0 0");
		%player.blowup();
	}
}

function SkiFreeGame::warningMessage(%game, %player) {
	if( !isObject(%player.client) ) return;
	if( %player.getState() $= "Dead" ) return;
	
	messageClient(%player.client, 0, '\c2Only %1 seconds left!~wfx/misc/bounty_objrem1.wav', %game.survivalWarningTime / 1000);
}

function SkiFreeGame::generateLevel(%game) {
	// randomizer hack
	if( $SkiFreeRandomSeed !$= "" ) {
		%oldseed = getRandomSeed();
		setRandomSeed($SkiFreeRandomSeed);
		for( %i = 0; %i < 420; %i++ ) getRandom(); // advance the seed
	}
	
	// choose a terrain
	if( !isObject(Terrain) ) {
		%game.generateTerrain();
	}

	// generate a spawn platform
	%game.generateSpawnPlatform();

	// add the first gates
	if( %game.timeTrial ) {
		for( %i = 1; %i <= %game.trialGates || isObject( %game.iterateCustomGate(MissionGroup, %i) ); %i++ ) {
			%game.generateGate(%i);
		}
	}
	else {
		// normally we would need to make more gates so we use the proper seeds, but the daily randomizer is enforced time trial anyway
		for( %i = 1; %i <= 2 || isObject( %game.iterateCustomGate(MissionGroup, %i) ); %i++ ) {
			%game.generateGate(%i);
		}
	}
	
	%game.spinSpawnPlatform();
	
	if( %oldseed !$= "" ) {
		setRandomSeed(%oldseed);
		$SkiFreeRandomSeed = "";
	}
}

function SkiFreeGame::generateSpawnPlatform(%game) {
	// allow mappers to pre-define the spawn platform
	if( isObject(SpawnPlatform) ) {
		%game.addSpawnPlatform(SpawnPlatform.position);
	}
	else {
		// grab 8 random points - the spawn must be at or above this (is this actually something we want? lol)
		%max = -100;
		for( %i = 0; %i < 8; %i++ ) {
			%spawnPoint = getRandom(-1024,1024) SPC getRandom(-1024, 1024);
			%height = %game.findHeight(%spawnPoint);
			if( %height > %max ) {
				%max = %height;
			}
		}
		
		//messageAll(0, "max:" SPC %max);
		
		for( %i = 0; %i < 420; %i++ ) {
			// reduce the max at each iteration
			%max -= 2;

			// grab a random point
			%spawnPoint = getRandom(-1024,1024) SPC getRandom(-1024, 1024);
			%height = %game.findHeight(%spawnPoint);
			if( %height < %max ) {
				//messageAll(0, "not high enough" SPC %height SPC "<" SPC %max);
				continue;
			}
			
			// check all 9 points around the spawn point and keep track of them - use lowest Z point so the tower is embedded in the ground
			%maxZ = -100;
			%z = 500;
			for( %x = -1; %x <= 1; %x++ ) {
				for( %y = -1; %y <= 1; %y++ ) {
					%dayZ = %game.findHeight((getWord(%spawnPoint,0) + (%x * 15)) SPC (getWord(%spawnPoint,1) + (%y * 15)));
					if( %z > %dayZ ) %z = %dayZ;
					if( %maxZ < %dayZ ) %maxZ = %dayZ;
				}
			}
			
			// variance should be less than 50 - if it's more, reroll it. we don't want the terrain to intersect the spawn platform
			//messageAll(0, "old variance=" @ (%maxZ - %z));
			if( %maxZ - %z >= 50 ) {
				continue;
			}
			
			break;
		}
		
		%game.addSpawnPlatform(%spawnPoint SPC %z);
	}
}

function SkiFreeGame::generateGate(%game, %gate) {
	if( %game.timeTrial && %gate > %game.trialGates ) {
		return;
	}

	// mapping mechanism for defining where each gate will be generated
	%gateMarker = %game.iterateCustomGate(MissionGroup, %gate);
	if( isObject(%gateMarker) ) {
		// don't hide the marker if editor is open
		if( !$TestCheats ) %gateMarker.hide(true);
		
		%position = %gateMarker.position;
		
		if( %game.timeTrial ) {
			if( %gateMarker.isFinish__ ) {
				%game.trialGates = %gate;
			}
			else if( %gateMarker.gateNum__ == %game.trialGates ) {
				%game.trialGates++;
			}
		}
	}
	else if( %gate == 1 ) {
		// angle should just be anywhere
		%pivot = nameToID("GatePoint0").position;
		%angle = getRandom(2 * 3.1415927 * 100000) / 100000;
		%dist = getRandom(%game.firstGateMin, %game.firstGateMax);
		
		%x = getWord(%pivot, 0) + (mCos(%angle) * %dist);
		%y = getWord(%pivot, 1) + (mSin(%angle) * %dist);
		%z = %game.findHeight(%x SPC %y);
		
		%position = %x SPC %y SPC %z;
	}
	else {
		%origin = nameToID("GatePoint" @ (%gate - 2)).position;
		%pivot = nameToID("GatePoint" @ (%gate - 1)).position;
		%angle = mAtan(
			getWord(%pivot, 1) - getWord(%origin, 1), 
			getWord(%pivot, 0) - getWord(%origin, 0) 
		);
		
		%modAngle = (%game.minGateAngle + (%game.angleIncrement * (%gate - 2))) / 2;
		if( %modAngle > %game.maxGateAngle ) %modAngle = %game.maxGateAngle;
		
		%angle += (getRandom(-%modAngle * 100000, %modAngle * 100000) / 100000);
		%dist = getRandom(%game.extraGateMin, %game.extraGateMax);
		
		%x = getWord(%pivot, 0) + (mCos(%angle) * %dist);
		%y = getWord(%pivot, 1) + (mSin(%angle) * %dist);
		%z = %game.findHeight(%x SPC %y);		
		
		%position = %x SPC %y SPC %z;
	}
	//%viewableAngle = (%angle / (3.1415927/180));
	//while( %viewableAngle < 0 ) %viewableAngle += 360;
	//echo("Gate" SPC %gate SPC "at" SPC %viewableAngle SPC "degrees");
	
	%game.addGate(%gate, %position);
	%game.gate = %gate;
}

function SkiFreeGame::iterateCustomGate(%game, %simgroup, %gate) {
	for( %i = 0; %i < %simgroup.getCount(); %i++ ) {
		%obj = %simgroup.getObject(%i);
		
		if( %obj.getClassName() $= "SimGroup" && %obj != nameToId(MissionCleanup) ) {
			%gateMarker = %game.iterateCustomGate(%obj, %gate);
			if( isObject(%gateMarker) ) return %gateMarker;
		}
		else if( %obj.dataBlock $= "SkiFreeCustomGate" && %obj.gateNum__ == %gate ) {
			return %obj;
		}
	}
	
	return 0;
}

function SkiFreeGame::generateTerrain(%game) {
	// clear this shit out just in case
	deleteVariables("$SkiFreeTerrainList*");

	%error = "";
	%valid = false;
	if( $TerrainTest $= "" ) {
		// pick a terrain from the list
		exec("scripts/SkiFreeTerrains.cs");
		
		if( $SkiFreeTerrainListMAX !$= "" ) {
			if( !%game.isAprilFools($Host::SkiRaceAprilFoolsDisabledYear) ) {
				%terrain = $SkiFreeTerrainList[getRandom($SkiFreeTerrainListMAX)];
			}
			else {
				%terrain = $SkiFreeTerrainListSuperHard[getRandom($SkiFreeTerrainListSuperHardMAX)];
			}
				
			if( isFile("terrains/" @ %terrain) ) {
				%valid = true;
			}
			else {
				%error = "Terrain file" SPC %terrain SPC "doesn't exist!";
			}
		}
		else {
			%error = "SkiFreeTerrains.cs does not exist or did not correctly compile!";
		}
		
		// don't leave this shit laying around
		deleteVariables("$SkiFreeTerrainList*");
	}
	else {
		%terrain = $TerrainTest;
		if( strpos(%terrain, ".ter") == -1 ) %terrain = %terrain @ ".ter";

		if( isFile("terrains/" @ %terrain) ) {
			%valid = true;
		}
		else {
			%error = "$TerrainTest file" SPC %terrain SPC "doesn't exist!";
			%valid = false;
		}
	}
	
	if( %valid ) {
		messageAll(0, 'Using Terrain: %1', %terrain);
	}
	else {
		messageAll(0, 'There was an error loading terrain %1 - %2', %terrain, %error);
		%terrain = "SunDried.ter";
	}
	
	%terrainObj = new TerrainBlock(Terrain) {
		rotation = "1 0 0 0";
		scale = "1 1 1";
		detailTexture = "details/lushdet1";
		terrainFile = %terrain;
		squareSize = "8";
	};
	MissionCleanup.add(%terrainObj);
	
	%game.terrain = getSubStr(%terrain, 0, strpos(%terrain, "."));
	messageAll('msgBountyTargetIs', "", %game.terrain); // terrain
}

function SkiFreeGame::spinSpawnPlatform(%game) { 
	%pi = 3.1415927; // why isn't this just a global
	
	// calculate spin ratio
	%gate = nameToID("GatePoint1").position;
	%spawn = nameToID("GatePoint0").position;
	%angle = mAtan(
		getWord(%spawn, 1) - getWord(%gate, 1), 
		getWord(%spawn, 0) - getWord(%gate, 0) 
	);
	
	// calculate variance points and make sure we didn't cut into terrain - if we did, just return from method and pretend it's a feature
	%maxZ = -100;
	%z = 500;
	for( %x = -1; %x <= 1; %x++ ) {
		for( %y = -1; %y <= 1; %y++ ) {
			%tx = (getWord(SpawnPlatform.position, 0) + (%x * 15)) - getWord(SpawnPlatform.position, 0);
			%ty = (getWord(SpawnPlatform.position, 1) + (%y * 15)) - getWord(SpawnPlatform.position, 1);
			%ntx = (%tx * mCos(%angle)) - (%ty * mSin(%angle));
			%nty = (%tx * mSin(%angle)) + (%ty * mCos(%angle));
			%tx = %ntx + getWord(SpawnPlatform.position, 0);
			%ty = %nty + getWord(SpawnPlatform.position, 1);
			
			%dayZ = %game.findHeight(%tx SPC %ty);
			if( %z > %dayZ ) %z = %dayZ;
			if( %maxZ < %dayZ ) %maxZ = %dayZ;
		}
	}
	
	// variance should be less than 60 - if it's more, return from method
	//messageAll(0, "new variance=" @ (%maxZ - %z));
	if( %maxZ - %z >= 60 ) {
		return;
	}
	
	// spin the platform
	SpawnPlatform.setTransform(SpawnPlatform.position SPC "0 0 1" SPC -%angle); // reverse the angle and use radians because ????
	
	// spin the trigger
	%tx = getWord(SpawnPlatform.position, 0);
	%ty = getWord(SpawnPlatform.position, 1);
	%diagonal = 21.2132034; // sqrt(15^2 + 15^2)
	%tx += (mCos(%angle + (0.75 * %pi)) * %diagonal); // yes, this trigger is offset by 0.75 PI
	%ty += (mSin(%angle + (0.75 * %pi)) * %diagonal); // yes, this trigger is offset by 0.75 PI
	SpawnTrigger.setTransform(
		%tx SPC %ty SPC getWord(SpawnTrigger.position, 2) SPC
		"0 0 1" SPC -%angle
	);

	// spin the spawn points
	for( %i = 0; %i < 420; %i++ ) {
		if( %game.spawnPosition[%i] $= "" ) break;
		%tx = getWord(%game.spawnPosition[%i], 0) - getWord(SpawnPlatform.position, 0);
		%ty = getWord(%game.spawnPosition[%i], 1) - getWord(SpawnPlatform.position, 1);
		
		// what the fuck?
		%ntx = (%tx * mCos(%angle)) - (%ty * mSin(%angle));
		%nty = (%tx * mSin(%angle)) + (%ty * mCos(%angle));

		%tx = %ntx + getWord(SpawnPlatform.position, 0);
		%ty = %nty + getWord(SpawnPlatform.position, 1);
		
		%game.spawnPosition[%i] = %tx SPC %ty;
	}
}

function SkiFreeGame::findHeight(%game, %location) {
	%hit = ContainerRayCast(%location SPC "1000", %location SPC "-100", $TypeMasks::TerrainObjectType);
	return getWord(%hit,3);
}

function SkiFreeGame::displayDeathMessages(%game, %clVictim, %clKiller, %damageType, %implement) {
   // ----------------------------------------------------------------------------------
   // z0dd - ZOD, 6/18/02. From Panama Jack, send the damageTypeText as the last varible
   // in each death message so client knows what weapon it was that killed them.

   %victimGender = (%clVictim.sex $= "Male" ? 'he' : 'she');
   %victimName = %clVictim.name;
   //error("DamageType = " @ %damageType @ ", implement = " @ %implement @ ", implement class = " @ %implement.getClassName() @ ", is controlled = " @ %implement.getControllingClient());
   
	if(%damageType == $DamageType::ForceFieldPowerup)
	{
		messageAll('msgVehicleSpawnKill', '\c0%1 tried to skip a gate.', %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType, $DamageTypeText[%damageType]);
		logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") killed by Gate Skip");
	}
	else if( %damageType == $DamageType::Crash ) {
		messageAll('msgVehicleSpawnKill', '\c0%1 deadstopped.', %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType, $DamageTypeText[%damageType]);
		logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") killed by Deadstop");
	}
	else if( %damageType == $DamageType::NexusCamping ) {
		if( %game.timeTrial ) {
			messageAll('msgVehicleSpawnKill', '\c0%1 ran out of time.', %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType, $DamageTypeText[%damageType]);
		}
		
		// no message needed for a full run completed
		logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") killed by End of Run");
	}
	else if( %damageType == $DamageType::Ground && %clVictim.player.modGlass ) {
	      messageAll('msgSelfKill', '%1 shattered into a million pieces.', %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType, $DamageTypeText[%damageType]);
      logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") killed self ("@getTaggedString($DamageTypeText[%damageType])@")");
	}
	else if( %damageType == $DamageType::Suicide ) {
		// remove death message
		//messageAll('msgSuicide', '', %victimName, %victimGender, %victimPoss, %killerName, %killerGender, %killerPoss, %damageType, $DamageTypeText[%damageType]);
		logEcho(%clVictim.nameBase@" (pl "@%clVictim.player@"/cl "@%clVictim@") committed suicide (CTRL-K)");
	}
	else {
		Parent::displayDeathMessages(%game, %clVictim, %clKiller, %damageType, %implement);
	}
}

function SkiFreeGame::getWordForRank(%game, %rank) {
	if( %rank == 1 ) return "first";
	else if( %rank == 2 ) return "second";
	else if( %rank == 3 ) return "third";
	else if( %rank <= 20 ) return %rank @ "th";
	else if( %rank % 10 == 1 ) return %rank @ "st";
	else if( %rank % 10 == 2 ) return %rank @ "nd";
	else if( %rank % 10 == 3 ) return %rank @ "rd";
	else return %rank @ "th"; // just type the number
}

function SkiFreeGame::sendDebriefing( %game, %client )
{
	// Mission result:
	%winner = $TeamRank[0, 0];
	if ( %winner.score > 0 )
		messageClient( %client, 'MsgDebriefResult', "", '<just:center>%1 wins!', $TeamRank[0, 0].name );
	else
		messageClient( %client, 'MsgDebriefResult', "", '<just:center>Nobody wins.' );

	// Player scores:
	%count = $TeamRank[0, count];
	if( %game.timeTrial ) {
		messageClient( %client, 'MsgDebriefAddLine', "", '<spush><color:00dc00><font:univers condensed:18>PLAYER<lmargin%%:60>BEST<spop>' );
	}
	else {
		messageClient( %client, 'MsgDebriefAddLine', "", '<spush><color:00dc00><font:univers condensed:18>PLAYER<lmargin%%:60>BEST<lmargin%%:80>GATES<spop>' );
	}
	for ( %i = 0; %i < %count; %i++ ) {
		%cl = $TeamRank[0, %i];
		if( %game.timeTrial ) {
			if( %cl.bestTime == %game.trialDefaultTime )
				%bestTime = %game.trialDefaultTime @ ".000";
			else
				%bestTime = %cl.bestTime;

			messageClient( %client, 'MsgDebriefAddLine', "", '<lmargin:0><clip%%:60> %1</clip><lmargin%%:60><clip%%:20> %2</clip>', %cl.name, %bestTime );
		}
		else {
			if ( %cl.score $= "" )
				%score = "0.0";
			else if( mFloor(%cl.score) == %cl.score )
				%score = %cl.score @ ".0";
			else
				%score = %cl.score;

			if( %cl.maxGates $= "" )
				%gates = 0;
			else
				%gates = %cl.maxGates;

			messageClient( %client, 'MsgDebriefAddLine', "", '<lmargin:0><clip%%:60> %1</clip><lmargin%%:60><clip%%:20> %2</clip><lmargin%%:80><clip%%:20> %3', %cl.name, %score, %gates );
		}
	}


   //now go through an list all the observers:
   %count = ClientGroup.getCount();
   %printedHeader = false;
   for (%i = 0; %i < %count; %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%cl.team <= 0)
      {
         //print the header only if we actually find an observer
         if (!%printedHeader)
         {
            %printedHeader = true;
			if( %game.timeTrial ) {
				messageClient(%client, 'MsgDebriefAddLine', "", '\n<lmargin:0><spush><color:00dc00><font:univers condensed:18>OBSERVERS<lmargin%%:60>BEST<spop>');
			}
			else {
				messageClient(%client, 'MsgDebriefAddLine', "", '\n<lmargin:0><spush><color:00dc00><font:univers condensed:18>OBSERVERS<lmargin%%:60>SCORE<spop>');
			}
         }

		 if( %game.timeTrial ) {
			if( %cl.bestTime == %game.trialDefaultTime )
				%bestTime = %game.trialDefaultTime @ ".000";
			else
				%bestTime = %cl.bestTime;

			messageClient( %client, 'MsgDebriefAddLine', "", '<lmargin:0><clip%%:60> %1</clip><lmargin%%:60><clip%%:40> %2</clip>', %cl.name, %bestTime);
		 }
		 else {
			 //print out the client
			 if ( %cl.score $= "" )
				%score = "0.0";
			 else if( mFloor(%cl.score) == %cl.score )
				%score = %cl.score @ ".0";
			 else
				%score = %cl.score;

			messageClient( %client, 'MsgDebriefAddLine', "", '<lmargin:0><clip%%:60> %1</clip><lmargin%%:60><clip%%:40> %2</clip>', %cl.name, %score);
		 }
      }
   }
}

function SkiFreeGame::phaseThroughPlayers(%game, %active) {
	// don't run unneeded mempatches!
	if( !%active && !%game.phaseActive ) return;
	
	// don't do this in single player
	if( %game.isSinglePlayer() ) return;
	
	%game.phaseActive = %active;
	
	// this code adds/removes the player mask from player collisions
	// so players can phase right through each other if this is active
	// thanks to DarkTiger for this code
	%patch1 = %active ? "3CA1" : "3CE1";
	%patch2 = %active ? "1C21" : "1C61";
	%patch3 = %active ? "1C21" : "1C61";
	
	memPatch("83FBF4", %patch1);
	memPatch("79B40C", %patch2);
	memPatch("83FBF8", %patch3);
}

function SkiFreeGame::runEditorTasks(%game) {
	%game.iterateRevealHiddenGates(MissionGroup);
	// do we even have anything else to do?
}

function SkiFreeGame::iterateRevealHiddenGates(%game, %simgroup) {
	for( %i = 0; %i < %simgroup.getCount(); %i++ ) {
		%obj = %simgroup.getObject(%i);
		
		if( %obj.getClassName() $= "SimGroup" && %obj != nameToId(MissionCleanup) ) {
			%game.iterateRevealHiddenGates(%obj);
		}
		else if( %obj.dataBlock $= "SkiFreeCustomGate" ) {
			%obj.hide(false);
		}
	}
}

function SkiFreeGame::getDailySeed(%game) {
	%d = formatTimeString("dd");
	%m = formatTimeString("mm");
	%y = formatTimeString("y");
	
	return %d + (%m * 32) + (%y * 420);
}

function SkiFreeGame::breakOutTerraformer(%game, %skill, %definedSeed) {
	%seed = (%definedSeed $= "") 
		? (getRandom() * 1999998) - 999999
		: %definedSeed;
	
	if(!isObject("terraformer")) new Terraformer("terraformer");
	
	// stop putting me under the terrain goddamnit
	%player = ClientGroup.getObject(0).player;
	if( isObject(%player) ) {
		%transform = %player.getTransform();
		%player.schedule(0, setTransform, %transform);
	}
	
	%minHeight = 25;
	%heightRange = 150;
	
	if( isObject(Terrain) ) {
		Terrain.delete();
	}
	
	// change the terrain based on day of the week, so nobody gets confused when they're a day off (like being in Guam)
	%dow = formatTimeString("D");
	if( %definedSeed !$= "" ) {
		if( %dow $= "Sun" ) %terrain = "Gauntlet.ter";
		if( %dow $= "Mon" ) %terrain = "DangerousCrossing_nef.ter";
		if( %dow $= "Tue" ) %terrain = "Snowblind_nef.ter";
		if( %dow $= "Wed" ) %terrain = "DangerousCrossing_nef.ter";
		if( %dow $= "Thu" ) %terrain = "Gauntlet.ter";
		if( %dow $= "Fri" ) %terrain = "Snowblind_nef.ter";
		if( %dow $= "Sat" ) %terrain = "DangerousCrossing_nef.ter";
	}
	else {
		if( %dow $= "Sun" ) %terrain = "DangerousCrossing_nef.ter";
		if( %dow $= "Mon" ) %terrain = "Snowblind_nef.ter";
		if( %dow $= "Tue" ) %terrain = "Gauntlet.ter";
		if( %dow $= "Wed" ) %terrain = "Snowblind_nef.ter";
		if( %dow $= "Thu" ) %terrain = "DangerousCrossing_nef.ter";
		if( %dow $= "Fri" ) %terrain = "Gauntlet.ter";
		if( %dow $= "Sat" ) %terrain = "Snowblind_nef.ter";
	}

	if( %skill == 1 ) {
		%terrainObj = new TerrainBlock(Terrain) {
			rotation = "1 0 0 0";
			scale = "1 1 1";
			detailTexture = "details/lushdet1";
			terrainFile = %terrain;
			squareSize = "8";
		};
		terraformer.setTerrainInfo( 256, 8, %minHeight, %heightRange, 0.0 );
		terraformer.fBm( 0, 5, 0.5, 0.5, %seed );
		terraformer.setTerrain(0);
		Game.terrain = "Easy";
	}
	else if( %skill == 2 ) {
		%terrainObj = new TerrainBlock(Terrain) {
			rotation = "1 0 0 0";
			scale = "1 1 1";
			detailTexture = "details/lushdet1";
			terrainFile = %terrain;
			squareSize = "8";
		};
		terraformer.setTerrainInfo( 256, 8, %minHeight, %heightRange, 0.0 );
		terraformer.fBm( 0, 8, 0.5, 0.5, %seed );
		terraformer.setTerrain(0);
		Game.terrain = "Medium";
	}
	else if( %skill == 3 ) {
		%terrainObj = new TerrainBlock(Terrain) {
			rotation = "1 0 0 0";
			scale = "1 1 1";
			detailTexture = "details/lushdet1";
			terrainFile = "Minotaur.ter";
			squareSize = "8";
		};
		terraformer.setTerrainInfo( 256, 8, %minHeight, %heightRange, 0.0 );
		terraformer.rigidMultiFractal( 0, 8, 0.5, 0.8, %seed );
		terraformer.turbulence( 0, 1, 0.8, 10 );
		terraformer.setTerrain(0);
		Game.terrain = "Hard";
	}
}

function SkiFreeGame::isSinglePlayer(%game) { 
	return $CurrentMission $= "SkiFree_Daily"
		|| $CurrentMission $= "SkiFree_Randomizer"
		|| $CurrentMission $= "SkiFreeZ_Championship_2021";
}

function SkiFreeGame::getServerStatusString(%game)
{
	if( %game.timeTrial ) {
		// server status modifcation for time trial (show time instead of score)
		%status = %game.numTeams;
		for ( %team = 1; %team - 1 < %game.numTeams; %team++ ) {
			%score = isObject( $teamScore[%team] ) ? $teamScore[%team] : 0;
			%teamStr = getTaggedString( %game.getTeamName(%team) ) TAB %score;
			%status = %status NL %teamStr;
		}

		%status = %status NL ClientGroup.getCount();
		for ( %i = 0; %i < ClientGroup.getCount(); %i++ ) {
			%cl = ClientGroup.getObject( %i );
			%time = %cl.bestTime $= "" ? %game.trialDefaultTime : %cl.bestTime;
			%playerStr = getTaggedString( %cl.name ) TAB getTaggedString( %game.getTeamName(%cl.team) ) TAB %time;
			%status = %status NL %playerStr;
		}
		return( %status );
	}
	else {
		Parent::getServerStatusString(%game);
	}
}

function SkiFreeGame::checkInterference(%game, %targetObject, %sourceObject, %oldVector) {
	// a player hit someone else with a disc
	%illegalHit = 0;
	
	// if boosting is off, illegal hit. otherwise...
	if( !$Host::SkiRaceAllowPvPDiscBoosting ) {
		%illegalHit = 1;
		
		if( !%sourceObject.interfered && isObject(%sourceObject.client) ) {
			messageClient(%sourceObject.client, 0, '\c2Disc Boosting is disabled. You cannot affect enemy momentum!~wfx/misc/red_alert_short.wav');
			%sourceObject.interfered = 1;
		}
		else {
			messageClient(%sourceObject.client, 0, '~wfx/misc/red_alert_short.wav');
		}
	}
	else {
		// check for intereference
		%oldSpeed = VectorLen(%oldVector);
		%curSpeed = VectorLen(%targetObject.getVelocity());
		if( %curSpeed < %oldSpeed ) {
			// interference detected!
			if( !%sourceObject.interfered && isObject(%sourceObject.client) ) {
				messageClient(%sourceObject.client, 0, '\c2INTERFERENCE! Tried to reduce enemy velocity - enemy momentum not affected!~wfx/misc/whistle.wav');
				%sourceObject.interfered = 1;
			}
			else {
				messageClient(%sourceObject.client, 0, '~wfx/misc/whistle.wav');
			}
				

			%illegalHit = 1;
		}
	}
	
	if( %illegalHit ) {
		%targetObject.setVelocity(%oldVector);
		//%targetObject.schedule(0, setVelocity, %oldVector);
	}
}

// is it april 1, and is it after the year passed in?
function SkiFreeGame::isAprilFools(%game, %year) {
	//if( $AprilFoolsTest ) return true;

	if( formatTimeString("m") != 4 ) return false;
	if( formatTimeString("d") != 1 ) return false;
	
	// it's april 1st - check the year qualifier
	if( %year $= "" ) return true;
	return (formatTimeString("yy") > %year);
}

function SkiFreeGame::prestigeTitle(%game, %client) {
	%client.SkiFreeTitle = "";
	if( %client.AI_skiFreeBotLevel !$= "" ) {
		%client.SkiFreeTitle = "<color:ff8080>Bot Level" SPC %client.AI_skiFreeBotLevel;
	}
	else {
		//%client.SkiFreeTitle = "<color:ffff00>Tourney 2021 Champion";
		//%client.SkiFreeTitle = "<color:e0e0e0>Tourney 2021 Runner-up";
		//%client.SkiFreeTitle = "<color:f6983c>Tourney 2021 3rd Place";
		//%client.SkiFreeTitle = "<color:B0D0FF>Tourney 2021 4th Place";
		//%client.SkiFreeTitle = "<color:B0B0B0>Tourney 2021 5th Place";
		//%client.SkiFreeTitle = "Tourney 2021 Qualifier";
		//%client.SkiFreeTitle = "Tourney 2021 Participant";
		
		switch( %client.guid ) {
		case 2019153: // red shifter
			%client.SkiFreeTitle = "<color:ff8080>SkiFree Lead Developer";
		}
	}
	
	if( %client.SkiFreeTitle !$= "" ) {
		%client.SkiFreeTitle = "<spush>" @ %client.SkiFreeTitle @ "<spop>";
	}
}