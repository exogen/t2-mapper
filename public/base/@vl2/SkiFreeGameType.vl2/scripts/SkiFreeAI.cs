// SkiFreeAI.cs
// no, not aiSkiFree.cs - that naming convention is stupid

// level 1 - the bot will just be handled by the game
// level 2 - ski down hills, everything else the same (skiing doesn't work very well because bots are too afraid of fall damage)
// level 3 - don't be afraid of fall damage, ski down hills, jet up/over hills
// level 4 - don't ski down hills that are sloped to the side (to avoid going way off-course)

// yeti - just wrecks your shit if you're not going fast enough

function SkiFreeGame::addNamedBot(%game, %name) {
	// why did i do this lol
	return aiConnect(%name, 1, 1.00);
	// TODO make more methods for rooster's stupid marbles parody
}

function SkiFreeGame::addBots(%game) {
	// please don't call this more than once
	for( %i = 0; %i < ClientGroup.getCount(); %i++ ) {
		%cl = ClientGroup.getObject(%i);
		if( %cl.isAIControlled() ) return;
	}
	
	// note: there's something fucky with this code so it should be BELOW the skill level seen in AIHasJoined method
	aiConnect("Level 4", 1, 1.00);
	aiConnect("Level 3", 1, 0.70);
	aiConnect("Level 2", 1, 0.45);
	aiConnect("Level 1", 1, 0.20);
}

function SkiFreeGame::AIHasJoined(%game, %client) {
	%skill = %client.getSkillLevel();
	if( %skill <= 0.25 ) {
		%client.AI_skiFreeBotLevel = 1;
	}
	else if( %skill <= 0.50 ) {
		%client.AI_skiFreeBotLevel = 2;
	}
	else if( %skill <= 0.75 ) {
		%client.AI_skiFreeBotLevel = 3;
	}
	else {
		%client.AI_skiFreeBotLevel = 4;
	}
	
	if( %client.bestTime $= "" ) {
		%client.bestTime = %game.trialDefaultTime;
	}
}

function SkiFreeGame::AIinit(%game) {
	// keeps ai from spamming the console - no idea what else it does
	AIInit();
}

function SkiFreeGame::onAIRespawn(%game, %client) {
	// start a heartbeat
	%player = %client.player;
	%game.schedule(1000, AI_heartbeat, %client, %player);

	// give a vgcg (but reduce the amount of spam that comes out)
	if( !$SkiFreeYetiSpawning && getSimTime() - 1000 >= %game.AI_lastGoodGame ) {
		if( getRandom(0, ClientGroup.getCount()) < 3 ) {
			schedule(100, 0, AIPlay3DSound, %client, "gbl.goodgame");
			%game.AI_lastGoodGame = getSimTime();
		}
	}

	%player.schedule(0, use, TargetingLaser); // have you ever heard 16 bots all with disc launchers out? it's LOUD
}

function SkiFreeGame::AI_heartbeat(%game, %client, %player) {
	if( !isObject(%player.client) ) return;
	if( %player.getState() $= "Dead" ) return;
	
	// check what our current task is
	if( !$missionRunning || !$MatchStarted ) {
		// no task yet - check back later
		%heartbeat = 1000;
	}
	else if( %client == $SkiFreeYeti ) {
		// this is the yeti - do yeti things
		%heartbeat = %game.AI_Yeti(%client, %player);
	}
	else if( %player.getControllingClient() != %player.client ) {
		// we're possessed (probably for debugging purposes) - don't do anything weird
		%heartbeat = 1000;
	}
	else if( !%player.AI_meantToLaunch ) {
		%game.AI_mingle(%client, %player);
		%heartbeat = 1000;
	}
	else if( %client.AI_skiFreeBotLevel <= 1 ) {
		// level 1 is just "turn off the heartbeat and use the standard bot behavior"
		// it already knows where it needs to go, t2 can handle that much
		%heartbeat = -1;
	}
	else if( %client.AI_skiFreeBotLevel == 2 ) {
		// level 2 is "ski down hills, otherwise let t2 handle it"
		// weaknesses:
		// - it uses jets to try and avoid fall damage because that's the default t2 behavior
		// - it's really not much better than level 1
		%game.AI_playGameLevel2(%client, %player);
		%heartbeat = 20;
	}
	else if( %client.AI_skiFreeBotLevel == 3 ) {
		// level 3 is "ski down hills, jet over hills"
		// weaknesses:
		// - it doesn't see whether skiing down is actually a good idea or not
		// - it doesn't understand what to do once it has the speed
		// - sometimes it misses the downhill directly and lands on the next uphill
		// - sometimes it overshoots the gate because it's going too fast
		%game.AI_playGameLevel3(%client, %player);
		%heartbeat = 20;
	}
	else if( %client.AI_skiFreeBotLevel == 4 ) {
		// level 4 is level 3, except it doesn't ski off slopes that'll send the bot way off-course
		%game.AI_playGameLevel4(%client, %player);
		%heartbeat = 20;
	}
	
	// continue calling heartbeat to see what we should be doing
	if( %heartbeat <= 1000 && %heartbeat > 0 ) {
		%game.schedule(%heartbeat, AI_heartbeat, %client, %player);
	}
	else if( %heartbeat > 1000 || %heartbeat == 0 ) {
		// heartbeat isn't set correctly - throw an error
		messageAll(0, 'AI heartbeat error. See console for details.~wfx/powered/station_denied.wav');
		error("Heartbeat error for cl=" @ %client @ " pl=" @ %player @ " heartbeat=" @ %heartbeat);
	}
}

function SkiFreeGame::AI_mingle(%game, %client, %player) {
	// PRIORITY 1. if alone in the game for 5 beats (no non-AI players on team1) and none of the AI are in the field, start a run
	%alone = true;
	for( %i = 0; %i < ClientGroup.getCount(); %i++ ) {
		%cl = ClientGroup.getObject(%i);
		if( !%cl.isAIControlled() && %cl.team == 1 ) {
			// player in game, don't go on your own
			%alone = false;
			break;
		}
		else if( %cl.isAIControlled() ) {
			if( !isObject(%cl.player) ) {
				// a bot is dead, so they're respawning
				%alone = false;
				break;
			}
			else if( %cl.player.launchTime !$= "" ) {
				// a bot is still in the field, don't desync
				%alone = false;
				break;
			}
		}
	}
	if( %alone ) {
		%player.AI_alone++;
		if( %player.AI_alone >= 5 ) {
			%game.AI_startRun(%client, %player);
			return;
		}
	}
	else {
		%player.AI_alone = 0;
	}
	
	// PRIORITY 2. if someone just jumped off the platform, start a run behind them
	if( getSimTime() - 2000 < %game.lastLaunchTime ) {
		%game.AI_startRun(%client, %player);
		return;
	}
	
	// PRIORITY 3. if a new (non-AI) player spawned, say hello
	for( %i = 0; %i < ClientGroup.getCount(); %i++ ) {
		%cl = ClientGroup.getObject(%i);
		if( !%cl.isAIControlled()
			&& %cl.team == 1
			&& isObject(%cl.player)
			&& !%cl.player.AI_sentGreeting
			&& isObject(%cl.player.client)
			&& %cl.player.getState() !$= "Dead"
		) {
			%cl.player.AI_sentGreeting = true; // only one bot should greet the player
			schedule(250, %client, "AIPlayAnimSound", %client, %cl.player.position, "gbl.hi", $AIAnimWave, $AIAnimWave, 0);
			return;
		}
	}
}

function SkiFreeGame::AI_startRun(%game, %client, %player) {
	// start the run
	%player.AI_meantToLaunch = 1;
	%client.stepMove(GatePoint1.position, 5);
	%player.use(Disc);
	
	// tell the other bots that it's time to go
	%game.lastLaunchTime = getSimTime();
}

function SkiFreeGame::AI_crossedGate(%game, %client, %player) {
	// is there anything else to do here
	%client.stepMove(nameToID("GatePoint" @ %player.gate).position, 5);
}

// in case some asshole knocks a bot off the platform
function SkiFreeGame::AI_resetPosition(%game, %client, %player) {
	// what the fuck did you do to him?!
	if( !isObject(%player.client) ) return;
	if( %player.getState() $= "Dead" ) return;
	
	%player.setTransform(Game.pickPlayerSpawn(%client));
	%player.setVelocity("0 0 0");
	%player.setDamageLevel(0);
	%player.resetThread = "";
	
	// watch where you're shooting
	schedule(100, 0, AIPlay3DSound, %client, "wrn.watchit");
}

function SkiFreeGame::getAverageBotTime(%game) {
	%time = 0;
	%count = 0;
	for(%i = 0; %i < ClientGroup.getCount(); %i ++) {
		%client = ClientGroup.getObject(%i);
		if( %client.isAIControlled() ) {
			if( %client.lastTime !$= "" ) {
				%time += %client.lastTime;
				%count++;
			}
		}
	}
	
	echo(%time / %count);
}

function SkiFreeGame::AI_playGameLevel2(%game, %client, %player) {
	// return if we haven't launched yet - just do standard bot things up to that point
	if( %player.launchTime $= "" ) return;
	
	// this is little more than "is the target point downhill? hold ski" bot
	%objDir = VectorSub(%player.position, nameToID("GatePoint" @ %player.gate).position);
	%objDir = VectorNormalize(getWords(%objDir, 0, 1) SPC "0");
	%objDir = VectorScale(%objDir, 2);
	%x = getWord(%player.position, 0);
	%y = getWord(%player.position, 1);
	
	%terrainHeight = %game.findHeight(%x SPC %y);
	
	%xslope = %x + getWord(%objDir, 0);
	%yslope = %y + getWord(%objDir, 1);
	%hslope = %game.findHeight(%xslope SPC %yslope);
	%slope = %terrainHeight - %hslope;

	if( %slope < 0.02 ) {
		// going downhill, try skiing?
		%client.pressjump();
		%aiHandled = true;
	}
}

function SkiFreeGame::AI_playGameLevel3(%game, %client, %player) {
	// return if we haven't launched yet - just do standard bot things up to that point
	if( %player.launchTime $= "" ) return;
	
	// disable the bot's jets when i don't tell you to use them
	if( %player.storedEnergy > 0 ) {
		%player.setEnergyLevel(%player.getEnergyLevel() + %player.storedEnergy);
		%player.storedEnergy = 0;
	}
	%fireJets = false;
	
	%aiHandled = false;
	
	// PRIORITY 1. check distance to gate - if we're very close, return from method (use default bot behavior)
	%dist = VectorDist(%player.position, nameToID("GatePoint" @ %player.gate));
	%vel = %player.getVelocity();
	if( %dist < 100 ) {
		return;
	}

	%objDir = VectorSub(%player.position, nameToID("GatePoint" @ %player.gate).position);
	%objDir = VectorNormalize(getWords(%objDir, 0, 1) SPC "0");
	%x = getWord(%player.position, 0);
	%y = getWord(%player.position, 1);
	%terrainHeight = %game.findHeight(%x SPC %y);
	
	// PRIORITY 2. check slope
	// going down slope - hold jump
	// going up slope - hit the jets, unless too high (if there's a mountain in front of you, there's no such thing as too high)
	if( !%aiHandled ) {
		%xslope = %x + getWord(%objDir, 0);
		%yslope = %y + getWord(%objDir, 1);
		%hslope = %game.findHeight(%xslope SPC %yslope);
		%slope = %terrainHeight - %hslope;
		
		if( %slope < 0.02 ) {
			// going down
			%client.pressjump();
			%aiHandled = true;
		}
		else { 
			// going up
			// make sure we aren't too high off the ground - 10m is plenty
			if( getWord(%player.position,2) - %terrainHeight < 10 ) {
				%fireJets = true;
				%aiHandled = true;
			}
			else {
				%hit = ContainerRayCast(%player.position, VectorScale(%objDir, 50) SPC getWord(%player.position,2) - 25, $TypeMasks::TerrainObjectType);
				if( VectorDist(%player.position, getWords(%hit, 1, 3)) < 25 ) {
					%fireJets = true;
					%aiHandled = true;
				}
			}
		}
	}
	
	if( %fireJets ) {
		%client.pressjump();
		%client.pressjet();
	}
	else {
		%player.storedEnergy = %player.getEnergyLevel();
		%player.setEnergyLevel(0);
	}
}

function SkiFreeGame::AI_playGameLevel4(%game, %client, %player) {
	// return if we haven't launched yet - just do standard bot things up to that point
	if( %player.launchTime $= "" ) return;
	
	// disable the bot's jets when i don't tell you to use them
	if( %player.storedEnergy > 0 ) {
		%player.setEnergyLevel(%player.getEnergyLevel() + %player.storedEnergy);
		%player.storedEnergy = 0;
	}
	%fireJets = false;
	
	%aiHandled = false;
	
	// PRIORITY 1. check distance to gate - if we're very close, return from method (use default bot behavior)
	// TODO check distance to gate - if we're going fast, check trajectory. if we're off, return from method (use default bot behavior)
	%dist = VectorDist(%player.position, nameToID("GatePoint" @ %player.gate));
	%vel = %player.getVelocity();
	// TODO remove this shit and make it good
	if( %dist < 100 ) {
		return;
	}
	//%speed = VectorLen(%vel);
	//if( %speed >= 70 ) {
		// i have no idea how to do this shit
	//}

	//%objDir = VectorNormalize(getWords(%vel,0,1) SPC "0");
	%objDir = VectorSub(%player.position, nameToID("GatePoint" @ %player.gate).position);
	%objDir = VectorNormalize(getWords(%objDir, 0, 1) SPC "0");
	//%objDir = VectorScale(%objDir, 2); // why are we doing this?
	%x = getWord(%player.position, 0);
	%y = getWord(%player.position, 1);
	%terrainHeight = %game.findHeight(%x SPC %y);
	
	// PRIORITY 2. check slope
	// going down slope - hold jump
	// going up slope - hit the jets, unless too high (if there's a mountain in front of you, there's no such thing as too high)
	// TODO use parabolas
	
	if( !%aiHandled ) {
		%xslope = %x + getWord(%objDir, 0);
		%yslope = %y + getWord(%objDir, 1);
		%hslope = %game.findHeight(%xslope SPC %yslope);
		%slope = %terrainHeight - %hslope;
		
		// check perpendicular slope to make sure we're going to send ourselves off-course
		%xhor1 = %x - getWord(%objDir, 1);
		%yhor1 = %y + getWord(%objDir, 0);
		%hor1slope = %game.findHeight(%xhor1 SPC %yhor1);
		%xhor2 = %x + getWord(%objDir, 1);
		%yhor2 = %y - getWord(%objDir, 0);
		%hor2slope = %game.findHeight(%xhor2 SPC %yhor2);
		%horislope = mAbs(%hor1slope - %hor2slope);
		
		if( %horislope < 0.5 && %slope < 0.02 ) {
			// going down
			%client.pressjump();
			%aiHandled = true;
		}
		else { 
			// going up
			// make sure we aren't too high off the ground - 10m is plenty
			// TODO we need to do a distance check
			if( getWord(%player.position,2) - %terrainHeight < 10 ) {
				%fireJets = true;
				%aiHandled = true;
			}
			else {
				%hit = ContainerRayCast(%player.position, VectorScale(%objDir, 50) SPC getWord(%player.position,2) - 25, $TypeMasks::TerrainObjectType);
				if( VectorDist(%player.position, getWords(%hit, 1, 3)) < 25 ) {
					%fireJets = true;
					%aiHandled = true;
				}
			}
		}
	}
	
	if( %fireJets ) {
		%client.pressjump();
		%client.pressjet();
	}
	else {
		%player.storedEnergy = %player.getEnergyLevel();
		%player.setEnergyLevel(0);
	}
}

// spawns the yeti (SINGLE PLAYER ONLY)
function SkiFreeGame::createYetiFor(%game, %player, %spawnPosition) {
	if( !%game.isSinglePlayer() ) {
		error("wtf you trying to pull? yeti doesn't spawn online!");
		return;
	}
	if( !isObject(%player) ) return;
	if( !isObject(%player.client) ) return;
	if( %player.getState() $= "Dead" ) return;
	if( isObject($SkiFreeYeti) ) return;

	%voice = "Derm"@getRandom(1,2); // do humans taste like chicken or fish?
	%voicePitch = 1 - ((getRandom(20) - 10)/100);

	// it doesn't get the client id until it's too late for certain things, so we need to hack around it
	$SkiFreeYetiSpawning = 1;
	%lastMissionType = $currentMissionType;
	$currentMissionType = "SinglePlayer"; // surpress yeti's join message
	$SkiFreeYeti = aiConnect("Yeti", 0, 1.00, true, %voice, %voicePitch);
	$SkiFreeYetiSpawning = "";
	$currentMissionType = %lastMissionType;
	
	$SkiFreeYeti.skin = getTaggedString("base");
	setTargetSkin( $SkiFreeYeti.target, 'base' );
	
	$SkiFreeYeti.stalkClient = %player.client;
	$SkiFreeYeti.stalkPlayer = %player;
	$SkiFreeYeti.race = "Bioderm";
	$SkiFreeYeti.player.setArmor("Heavy");
	
	if( %spawnPosition !$= "" ) {
		$SkiFreeYeti.player.schedule(0, setTransform, %spawnPosition);
	}
}

function SkiFreeGame::AI_Yeti(%game, %client, %player) {
	// always face the stalked player (if they still exist)
	if( isObject(%client.stalkPlayer) ) {
		%client.aimAt(%client.stalkPlayer.getWorldBoxCenter());
	}

	if( %player.AI_meantToLaunch == 0 ) {
		// yeti only has one thing on his mind
		%player.setInventory(ShockLance,1);
		%player.setInventory(Disc, 0);
		%player.schedule(0, use, Shocklance);
		%player.AI_meantToLaunch = 1;
		
		// remove this shit and make the yeti fuck people up directly by doing a direct velocity check
		//%client.clientDetected($SkiFreeYeti.stalkClient);
		//%client.stepEngage($SkiFreeYeti.stalkClient);

		return 20;
	}
	else if(
		%client.stalkClient.player != 0
		&& %client.stalkClient.player != %client.stalkPlayer
	) {
		// player respawned - yeti drops
		%player.setCloaked(true);
		%client.drop();
		
		return -1;
	}
	else if( %client.throwTime > 600 ) {
		// you've made your point, now go eat the idiot
		%client.throwTime = 0;
		return 20;
	}
	else if( %client.throwTime > 0 ) {
		// throwing platform into the air
		%x = getWord(SpawnPlatform.position, 0);
		%y = getWord(SpawnPlatform.originalTransform, 1) + (%client.throwTime * %client.throwDir);
		
		// put the spawn platform in the air
		%z = getWord(SpawnPlatform.originalTransform, 2);
		
		// make an arc
		%arc = (-0.003 * mPow(%client.throwTime, 2)) + (1.3 * %client.throwTime);
		%z += %arc;
	
		%spin = (%client.throwTime / 2) < 180 ? (%client.throwTime / 2) : 179;
		
		SpawnPlatform.position = %x SPC %y SPC %z;
		SpawnPlatform.rotation = %client.throwDir SPC "0 0" SPC %spin;
		SpawnPlatform.setTransform(SpawnPlatform.getTransform());
		%client.throwTime++;
		return 10;
	}
	else if( %client.throwPlatform == 1 ) {
		// fuck this platform
		%client.throwDir = (getRandom(0, 100) % 2 == 0) ? 1 : -1;
		%client.throwTime = 1;
		%client.throwPlatform = 2;
		return 20;
	}
	else if( %client.yetiDone ) {
		// we're done, only task left is to despawn the yeti
		return 100;
	}
	else if( %client.yetiTaunt ) {
		// walk towards the corpse and taunt
		%player.setVelocity("0 0 0");
		%client.yetiTaunt = 0;
		%client.yetiDone = 0;
		%client.stepMove(%client.stalkPlayer.position, 5);
		schedule(1000, 0, AIPlay3DSound, %client, "gbl.obnoxious");
		return 100;
	}
	else if( !isObject(%client.stalkPlayer) || %client.stalkPlayer.getState() $= "Dead" ) {
		// player is dead, fuck it
		%player.setVelocity("0 0 0");
		%client.yetiDone = 1;
		%client.stepMove(%client.stalkPlayer.position, 5);
		return 100;
	}
	else if( %client.stunned ) {
		// yeti has been stunned, stun them for a few seconds
		%client.stunned = 0;
		%client.stunRecover += (3000 / 20);
		return 20;
	}
	else if( %client.stunRecover > 0 ) {
		// wait out the stun time
		%client.stunRecover--;
		return 20;
	}
	else {
		// workaround if we get deadstopped on the terrain
		if( %player.lastPosition == %player.position ) {
			%jetUp = 1;
		}

		// accelerate towards the player at like 3000kph
		%objDir = VectorSub(%client.stalkPlayer.position, %player.position);
		%dist = VectorDist(%player.position, %client.stalkPlayer.position);
		%objDir = VectorNormalize(%objDir);

		if( %dist > 300 ) {
			// cheat to get the yeti within your range
			%scale = %dist * 8.0;
		}
		else {
			// set scale based on how far away the player is (yeti gets closer but never actually reaches you)
			%scale = %dist * 5;
		}

		if( %scale > 800 ) %scale = 800; // speed limit to keep the yeti from crashing t2
			
		%objDir = VectorScale(%objDir, %scale);
		if( %jetUp ) {
			%objDir = getWords(%objDir, 0, 1) SPC (getWord(%objDir, 2) + 10);
		}
		%player.setVelocity(%objDir);
		%player.lastPosition = %player.position;
		
		// increase the yeti's anger each second (if player is going less kph than yeti's anger, lance will hit)
		if( %client.anger $= "" ) {
			%client.anger = 190;
		}
		%client.angerTicks++;
		if( %client.angerTicks >= 1000 / 20 ) {
			%client.angerTicks = 0;
			%client.anger++;
		}
		
		// too close to the yeti - check if the player dies
		if( %dist < 15 && getSimTime() - %client.zapTime >= 2500 ) {
			// yeti uses his shocklance
			%client.zapTime = getSimTime();
			%playerVelocity = VectorLen(%client.stalkPlayer.getVelocity()) * 3.6;

			if( %playerVelocity < %client.anger ) {
				// yeti actually uses his shocklance (this can still miss for some reason)
				%client.pressFire();
				
				%client.fireAttempts++;
				if( %client.fireAttempts == 3 ) {
					// on yeti's third attempt, he automatically hits you - not going to leave this up to the AI
					%player.playAudio(0, ShockLanceHitSound);

					%p = new ShockLanceProjectile() {
						dataBlock        = BasicShocker;
						initialDirection = %player.getMuzzleVector($WeaponSlot);
						initialPosition  = %player.getMuzzlePoint($WeaponSlot);
						sourceObject     = %player;
						sourceSlot       = $WeaponSlot;
						targetId         = %client.stalkPlayer;
					};
					MissionCleanup.add(%p);

					%client.stalkPlayer.getDataBlock().damageObject(%client.stalkPlayer, %p.sourceObject, %client.stalkPlayer.getWorldBoxCenter(), 100, $DamageType::ShockLance);
				}
			}
			else {
				// you're outside the yeti's speed range, so the attack misses. simulate a swing and a miss
				%player.playAudio($WeaponSlot, ShockLanceDryFireSound);
				%player.schedule(500, playAudio, 0, ShockLanceMissSound);

				%p = new ShockLanceProjectile() {
					dataBlock        = BasicShocker;
					initialDirection = %player.getMuzzleVector($WeaponSlot);
					initialPosition  = %player.getMuzzlePoint($WeaponSlot);
					sourceObject     = %player;
					sourceSlot       = $WeaponSlot;
				};
				MissionCleanup.add(%p);
			}
		}
		
		// check to see if the client is camping behind the spawn platform
		if( %client.throwPlatform == 0 ) {
			%distSpawn = VectorDist(%player.position, SpawnPlatform.position);
			if( %distSpawn < 100 ) {
				%client.rage++;
				if( %client.rage >= 5000 / 20 ) {
					// fuck this spawn platform, yeti is angry
					if( SpawnPlatform.originalTransform $= "" ) {
						SpawnPlatform.originalTransform = SpawnPlatform.getTransform();
					}
					messageAll(0, '~wfx/vehicles/tank_mortar_fire.wav');
					%client.throwPlatform = 1;
				}
			}
			else {
				%client.rage = 0;
			}
		}
		
		return 20;
	}
}

