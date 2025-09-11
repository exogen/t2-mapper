// Training Script
//echo("Running Training Script");

datablock EffectProfile(TrainingHudUpdateEffect)
{
   effectname = "gui/objective_notification";
   minDistance = 10;
};

datablock AudioProfile(TrainingHudUpdateSound)
{
   filename    = "gui/objective_notification.wav";
   description = AudioDefault3d;
   effect = TrainingHudUpdateEffect;
   preload = true;
};

datablock AudioProfile(MessageRecieveSound)
{
   filename    = "gui/objective_notification.wav";
   description = AudioDefault3d;
   preload = true;
};

// for training5
datablock ForceFieldBareData(defaultNoTeamLavaLightField)
{
   fadeMS           = 1000;
   baseTranslucency = 1;
   powerOffTranslucency = 0;
   teamPermiable    = false;
   otherPermiable   = false;
   color            = "1.0 0.4 0.0";
   targetTypeTag    = 'ForceField'; 

   texture[0] = "skins/forcef1";
   texture[1] = "skins/forcef2";
   texture[2] = "skins/forcef3";
   texture[3] = "skins/forcef4";
   texture[4] = "skins/forcef5";

   framesPerSec = 10;
   numFrames = 5;
   scrollSpeed = 15;
   umapping = 1.0;
   vmapping = 0.15;
};

// load the voice text and wav file
exec("scripts/spDialog.cs");

 
function setSinglePlayerGlobals() 
{
	// server settings
	//$MPRestoreBotCount 			= $Host::BotCount; this one is done automatically in server.cs
	$MPRestoreBotMatchBotCount 	= $Host::BotMatchBotCount; 
	$MPRestoreBotsEnabled 		= $Host::BotsEnabled;
	$MPRestoreMaxBotDifficulty 	= $Host::MaxBotDifficulty; 
	$MPRestoreMaxPlayers 		= $Host::MaxPlayers;
	$MPRestoreMinBotDifficulty 	= $Host::MinBotDifficulty; 
	$MPRestoreTimeLimit 		= $Host::TimeLimit;
	$MPRestoreTournamentMode 	= $Host::TournamentMode; 
	$MPRestorewarmupTime 		= $Host::warmupTime;
	$MPRestoreTeamDamage		= $teamDamage;

	//$Host::BotCount 			= "0";
	$Host::BotMatchBotCount 	= "0";
	$Host::BotsEnabled 			= "0";
	$Host::MaxBotDifficulty 	= "1";
	$Host::MaxPlayers 			= "64";
	$Host::MinBotDifficulty 	= "0";
	$Host::TimeLimit 			= "9999999";
	$Host::TournamentMode 		= "false";
	$Host::warmupTime 			= "0";

	if($pref::trainingDifficulty < 1 || $pref::trainingDifficulty > 3)
		$pref::trainingDifficulty = 1;
		
	if($pref::trainingDifficulty == 1)
		$teamDamage = false;
	else
		$teamDamage = true;	
	

	// game settings
	$MPRestoreteamSkin[1] 		= $teamSkin[1];
	$MPRestoreteamName[1]		= $teamName[1];
	$MPRestoreholoName[1] 		= $holoName[1];
	$MPRestoreswitchSkin[1] 	= $switchSkin[1];
	
	$MPRestoreteamSkin[2] 		= $teamSkin[2];
	$MPRestoreteamName[2]		= $teamName[2];
	$MPRestoreholoName[2] 		= $holoName[2];
	$MPRestoreswitchSkin[2] 	= $switchSkin[2];
	
	$playerTeam 				= 1;
	$teamSkin[$playerTeam] 		= 'swolf';
	$teamName[$playerTeam] 		= 'StarWolf';
	$holoName[$playerTeam] 		= "StarWolf";
	$switchSkin[$playerTeam] 	= 'swolf';
	$playerLivesAtEasy			= 3; 	
	
	$EnemyTeam 					= 2;
	$teamSkin[$EnemyTeam] 		= 'Horde';
	$teamName[$EnemyTeam] 		= 'Bioderm Horde';
// 	$holoName[$enemyTeam] 		= "Bioderm";
// 	$switchSkin[$enemyTeam] 	= 'Bioderm';
	
	if($enemyName $= "")
		$EnemyName = "Enemy";
	
	$trainingDefenseTauntList = "bas.enemy slf.att.attack slf.def.defend wrn.enemy tgt.acquired gbl.brag slf.def.base vqk.help";
	$trainingOffenseTauntList = "slf.att.attack gbl.brag vqk.help att.distract att.attack ene.disarray glb.awesome need.cover";
}

function resetSinglePlayerGlobals() 
{
	
	//error("================ single player global vars reset!");
	// server settings
	//$Host::BotCount 			= $MPRestoreBotCount; 		
	$Host::BotMatchBotCount  	= $MPRestoreBotMatchBotCount; 
	$Host::BotsEnabled 			= $MPRestoreBotsEnabled; 	
	$Host::MaxBotDifficulty  	= $MPRestoreMaxBotDifficulty; 
	$Host::MaxPlayers 			= $MPRestoreMaxPlayers; 		
	$Host::MinBotDifficulty  	= $MPRestoreMinBotDifficulty; 
	$Host::TimeLimit 			= $MPRestoreTimeLimit; 		
	$Host::TournamentMode 		= $MPRestoreTournamentMode; 	
	$Host::warmupTime 			= $MPRestorewarmupTime; 		
	$teamDamage					= $MPRestoreTeamDamage;

	// game settings
	$teamSkin[1]				= $MPRestoreteamSkin[1]; 		
	$teamName[1]				= $MPRestoreteamName[1];		
	$holoName[1]				= $MPRestoreholoName[1]; 		
	$switchSkin[1]			 	= $MPRestoreswitchSkin[1]; 	
	
	$teamSkin[2]				= $MPRestoreteamSkin[2]; 		
	$teamName[2]				= $MPRestoreteamName[2];		
	$holoName[2]				= $MPRestoreholoName[2]; 		
	$switchSkin[2]			 	= $MPRestoreswitchSkin[2]; 	
}

// Actors
//=======================================================================================

function addEnemies()
{
 	%num = $numberOfEnemies[$pref::TrainingDifficulty];
	error("Adding " @ %num @" enemies!");

	%group = nameToId("MissionGroup/Teams/Team2/DropPoints");

	for(%i = 0; %i < %num; %i++){
		%name = getUniqueEnemyName();
 		%voice = "Derm"@getRandom(1,3);
		%voicePitch = 1 - ((getRandom(20) - 10)/100);

		//%client = AIConnect($EnemyName@%i, $EnemyTeam, $missionBotSkill[$pref::TrainingDifficulty], true);
		%client = AIConnect(%name, $EnemyTeam, $missionBotSkill[$pref::TrainingDifficulty], true, %voice, %voicePitch);
 		$Enemy[%i] = %client;
 		%client.race = "Bioderm";
 
 		setTargetSkin(%client.target, $teamSkin[$enemyTeam]);
      //setTargetVoice(%client.target, addTaggedString(%client.voice));
 		
 		//error("Setting race of "@$Enemy[%i]@" to "@$Enemy[%i].race);
 		if(%group.getObject(%i).Equipment  || %group.getObject(%i).specialObjectives) {
 			%client.equipment = %group.getObject(%i).Equipment;
 			//error("Client: "@%client@ " has equipment "@%client.equipment);
 			%client.SpecialObjectives =	%group.getObject(%i).SpecialObjectives;
 			//error("Client: "@%client@ " has specialEd "@%client.SpecialObjectives);
 			game.equip(%client.player);
 		}
 		
 		// this seems redundant after equip
 		%client.player.setArmor(%client.armor);
	}
}

// there are times (missions 2 and 4) where bots are not added with
// addEnemies().  there are x waves of bots with y number in each wave
// i do it a couple of times so im going to localize it here rather than
// do it twice or cut and paste it
function spawnWave(%wave)
{
	for(%i=1; %i<=$numberInWave[$pref::TrainingDifficulty]; %i++) {
		%name = getUniqueEnemyName();
 		%voice = "Derm"@getRandom(1,3);
		%voicePitch = 1 - ((getRandom(20) - 10)/100);
		%thisAi = aiConnect(%name, $enemyTeam, $missionBotSkill[$pref::TrainingDifficulty], false, %voice, %voicePitch);
		//%thisAi = aiConnect("Wave"@%wave@"num"@%i, $enemyTeam, $missionBotSkill[$pref::TrainingDifficulty], false);
		// here we differentiate the different drop points for wave spawned bots (these spawned bots are "!offense")
		//error("added enemy "@%thisAi);
		%thisAi.race = "Bioderm";
		%thisAi.voice = "Derm"@getRandom(3);
		setTargetSkin(%thisAI.target, $teamSkin[$enemyTeam]);
      setTargetVoice(%thisAI.target, addTaggedString(%thisAI.voice));
		%equipment = pickEquipment();
		game.equip(%thisAi.player, %equipment);
 		//%client.player.setArmor(%thisAi.armor);

		//create a little group
		game.NumberInWave[%wave]++;
		%thisAI.MemberOfWave = %wave;
		
		//anything mission specific that has to be done with this client
		missionSpawnedAI(%thisAi);
	}
	game.spawnWaveTimer = spawnWaveTimer(%wave, false);
}


function addPlayersTeam(%num)
{
	//echo($player.team@"<---------players team on addPlayerTeam");

	getTeammateGlobals();

	for(%i=0; %i< %num; %i++){
		$Teammate[%i] = %client = AIConnect($TeammateWarnom[%i], $playerTeam, $teammateSkill[%i], true, $teammateVoice[%i]);

		%client.sex = $teammateGender[%i];
		%client.equipment = $teammateEquipment[%i];
		setTargetSkin(%client.target, $teamSkin[$playerTeam]);
		game.equip(%client.player);
		%client.player.setArmor(%client.armor);

		if (! %client.defaultTasksAdded)
		{
			%client.defaultTasksAdded = true;
			%client.addTask(AIEngageTask);
			%client.addTask(AIPickupItemTask);
			%client.addTask(AIUseInventoryTask);
			%client.addTask(AIEngageTurretTask);
			%client.addtask(AIDetectMineTask);
		}

	}

	//add Player===============================================================
	$player.lives = $playerLivesAtEasy - $pref::TrainingDifficulty; 

	game.spawnPlayer($player, false);
	setTargetSkin($player.target, $teamSkin[$playerTeam]);

}

function getUniqueEnemyName()
{
	if(!$enemyNameCount)
		return;

	%used = false;
	%name = pickUniqueEnemyName(); 
	%used = enemyNameIsUsed(%name);
	while(%used)
	{
		if(%emergency++ > 1000)
		{
			//error("Too many times in the name while loop...using DEFAULT");
			return $enemyName;
		}
		%name = pickUniqueEnemyName();
		%used = enemyNameIsUsed(%name);
	}
	return %name;
}

function pickUniqueEnemyName()
{
	%random = getRandom(1, $enemyNameCount);
	%name = $EnemyNameList[%random];
	//error("returning" SPC %name SPC "from pick");
	return %name;
}

function enemyNameIsUsed(%name)
{
	%number = game.usedNameCount;
	for(%i = 0; %i <= %number; %i++)
	{
		if(game.usedName[%i] $= %name)
			return true;
	}
	// the name is unused
	game.usedName[game.usedNameCount++] = %name;
	return false;
}

function spawnWaveTimer(%wave, %reset)
{
	//error("SpawnTimer ACTIVATED");
	
	if(%reset)
	{
		cancel(game.spawnWaveTimer);
		%timeForAction = 60000 * 2;   //2 min
	}
	else %timeForAction = 60000 * 4;   //4 min
	
	game.spawnWaveTimer = schedule(%timeForAction, game, destroyWave, %wave);
}

function DestroyWave(%wave)
{
	// this group has enemies in it that are dawdling and
	// need to be killed to keep the game progressing
	%num = clientGroup.getCount();
	for(%i = 0; %i < %num; %i++)
	{
		%client = clientGroup.getObject(%i);
		if(%client.player && %client.MemberOfWave == %wave)
		{
		   %client.player.applyDamage(%client.player.getDataBlock().maxDamage);   
			enemyWaveMemberKilled(%client);
		}
	}
}


function SinglePlayerGame::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement)
{
	if(game.missionOver)
		return;
	%clVictim.dead = true;
	if(%clvictim.team == $enemyTeam && getRandom(1,1000) == 69)
		doText(Any_jingo02);
	missionClientKilled(%clVictim, %clKiller);
	if(%clVictim.MemberOfWave)
		enemyWaveMemberKilled(%clVictim );

	Parent::onClientKilled(%game, %clVictim, %clKiller, %damageType, %implement);
	cancel(%clVictim.respawnTimer);

	if(%clVictim == $player) {
		// dead players are not out of bounds
		cancel($player.OOB);
		
		$player.deaths++;
		%num = $player.lives;
		if( %num >= 1) {
			if(%num == 1)
				%textNum = "one life";
			else %textNum = %num SPC "lives";
			messageBoxOk("Restart", "You have" SPC %textNum SPC "remaining.", "spawnSinglePlayer();");
		}
		else schedule(3000, $player.player, singlePlayerDead);
	}
}

function enemyWaveMemberKilled(%client)
{
	%wave = %client.MemberOfWave;
	%remaining = game.numberInWave[%wave]--;
	//error("Debug: Script reports that client " @ %client @ " was a member of wave " @ %wave @ " that now has " @ %remaining @ " members remaining.");
	if(%remaining == 0) {
		missionWaveDestroyed(%wave);
		
		if (%wave+1 <= $numberOfWaves[$pref::TrainingDifficulty])
			spawnWave(%wave+1);
		//else error("Debug: " @ %wave @ " was the last wave.");
	}
}

function SinglePlayerGame::assignClientTeam(%game, %client)
{
	// The players team is set in singlePlayer::clientMissionDropReady
	// and the bots are added to a team with aiConnect
	// so this is unnecessary
}

function singlePlayerGame::AIHasJoined()
{
	// Big deal...my missions are crawling with AI
	// lets get rid of this mundane console spam
}

function SinglePlayerGame::updateKillScores()
{
   // Do nothing other than get rid of the console warning...
}

function singlePlayerGame::biodermAssume(%game, %client)
{
	//error(%client SPC "might talk.");
	// dont do anything if we have just done this
	if(%client.spgSpeaking)
		return;
	
	%probability = 2;
	%time = 30;  // secs
		
	// we are going to POSSIBLY talk.  flag it for %time secs
	%client.spgSpeaking = true;
	schedule(%time * 1000, %client, resetSpeakingFlag, %client);

	if(getRandom(%probability) == 1)
		trainingBiodermSpeaks(%client);

}

function resetSpeakingFlag(%client)
{
	//error(%client SPC "can now speak again.");
	%client.spgSpeaking = false;
}

function trainingBiodermSpeaks(%client)
{
	if(%client.offense)							  // offense = defense?
		%tauntlist = $trainingDefenseTauntList;  //yes this seem wrong but its not
	else
		%tauntlist = $trainingOffenseTauntList;
	%num = getWordCount(%tauntList);
	%random = getRandom(%num - 1);
	%use = getWord(%tauntList, %random);
	//echo("Derm taunting:" SPC %use);

   playTargetAudio( %client.target, addTaggedString(%use), AudioClose3d, false );
}

function singlePlayerDead()
{
	missionFailed($player.miscMsg[trainingDeathLoss]);
	AIMissionEnd();
	$objectiveQ[$enemyTeam].clear();
	cancel($player.distanceCheckSchedule);
}

function SinglePlayerGame::missionLoadDone(%game)
{																		 
	DefaultGame::missionLoadDone(%game);

	setSinglePlayerGlobals();
	$matchStarted = true;
	//this has to happen sometime because game.startMatch never gets called
	%game.clearDeployableMaxes();
}


function SinglePlayerGame::notifyMatchStart(%game, %time)
{
	//do nothing
}


function SinglePlayerGame::clientMissionDropReady(%game, %client)
{
	DefaultGame::clientMissionDropReady(%game, %client);

	//echo(%client @ " is single player Ready!!!");
	messageClient(%client, 'MsgClientReady', "", %game.class);

	$Player = %client;
	$player.race = "Human";
	$player.team = $playerTeam;
	$player.setTeam($playerTeam);
	setTargetSkin($teammate[%i].target, $teamSkin[$playerTeam]);
   $player.clearBackpackIcon();

	createText($player);
	HUDMessageVector.clear();
   	messageClient(%client, 'MsgMissionDropInfo', "", $MissionDisplayName, $MissionTypeDisplayName, $ServerName ); 
	
   // We don't start in observer mode, so disable:
   commandToClient(%client, 'setHudMode', 'Standard');

	//custom training keymap
	%game.createCustomKeyMap();


	addEnemies();
	//echo($player.team@"<---------players team on mission drop ready");
	addPlayersTeam($numberOfTeammates);

	//everybody's in, enable the AI system
	AISystemEnabled(true);

   $player.setControlObject( $player.player );
   $player.camera = new Camera() 
   {
      dataBlock = Observer;
   };
   
   startCurrentMission(%game);
}

function SinglePlayerGame::AIInit(%game)
{
	//error("initializing Bot Q's for SinglePlayerGame...");
	for (%i = 0; %i <= %game.numTeams; %i++)
	{
		if (!isObject($ObjectiveQ[%i]))
		{
			$ObjectiveQ[%i] = new AIObjectiveQ();
			MissionCleanup.add($ObjectiveQ[%i]);
		}

		//error("team " @ %i @ " objectives load...");
		$ObjectiveQ[%i].clear();
		AIInitObjectives(%i, %game);
	}

	AIInit();
	
	// Bots never throw grenades on Easy skills
	if($pref::TrainingDifficulty == 1)
		$AIDisableGrenades = true;
}

// unlike the MP game, sometimes we start with switches (flipFlops)
// already on one team or the other and they are unskinned
function setFlipFlopSkins(%group)
{
	if(!%group)
		%group = nameToID("Teams");

	for(%i = 0; %i < %group.getCount(); %i++) {
		%this = %group.getObject(%i);
		if(%this.getClassName() $= "SimGroup")
			setFlipFlopSkins(%this);
		else if(%this.getDataBlock().getName() $= "FlipFlop")
			setTargetSkin(%this.getTarget(), $teamSkin[%this.team]);
	}
}



function singlePlayerGame::gameOver(%game)
{
	moveMap.push();

   ServerConnection.setBlackOut(false, 0);

	$timeScale = 1;
	
	game.missionOver = true;

	// clear the inventory and weapons hud
   // BH: This doesn't actually DO anything...
	//error("clearing Inv HUD for client " @ $player);
	//$player.SetInventoryHudClearAll();
	
	// im gonna try dropping all the clients
	%count = clientGroup.getCount();
	echo("count=" SPC %count);
	for(%i = 0; %i < %count; %i++) {
		%client = clientGroup.getObject(%i);
		game.client[%i] = %client;
		freeClientTarget(%client);
	}
	for(%i = 0; %i < %count; %i++) {
		%client = game.client[%i];
		echo("client=" SPC %client);
		if(%client.isAIControlled())
			%client.drop();
	}	

	//disable the AI system
	AISystemEnabled(false);
	$AIDisableChatResponse = "";
	
	game.deactivatePackages();

	if(isObject( $player.currentWaypoint ))
		$player.currentWaypoint.delete();

	if($player.OOB)
		cancel($player.OOB);
	
	// clear the objective HUD
	messageClient($player, 'MsgClearObjHud', "");

	resetSinglePlayerGlobals();

   $currentMissionType = "";
	DefaultGame::GameOver(%game);
}

function singlePlayerGame::deactivatePackages(%game)
{
	error("singlePlayerGame packages deactivated");
	//Deactivate packages...gotta catch'm all
	//deactivatepackage(SinglePlayer);
	deactivatepackage(Training1);
	deactivatepackage(Training2);
	deactivatepackage(Training3);
	deactivatepackage(Training4);
	deactivatepackage(Training5);
	deactivatepackage(Training6);
	deactivatePackage(singlePlayerMissionAreaEnforce);
}
//------------------------------------------------------------------------------------


// Voice line, text, function and audio parsing
//=================================================================================
// this is how we handle ALL the voice distribition and playing
// its NOT pretty
function doText(%name, %extraTime, %priority)
{
	if($player.text[%name, priority] || %priority)
		addToQueueNext(%name);
	else addToQueueEnd(%name);
	
	$player.text[%name, extraTime] = %extraTime;
	processText(false);
}

function processText(%cont)
{
	//we may need to fudge everysound to get it timed right
	%universalSoundFudgingConstant = 400;

	if(isEventPending($currentlyPlaying) && !%cont)
		return;

	%name = $player.Textque0;
	if(%name $= "")
		return;

	//echo("processing: "@%name);
	if($player.Text[%name, eval] !$= "")
   {
      if (!isPureServer())
		   eval($player.text[%name, eval]);
      else
         processTextEval($player.text[%name, eval]);
   }
	if($player.Text[%name, text] !$= "") {
		// the old way: messageClient($player, 0, '\c2%1: %2',$trainerName, $player.Text[%name, line]);
		messageClient($player, 0, "\c5"@$player.Text[%name, text]);
		serverPlay2d(MessageRecieveSound);
	}
	if($player.Text[%name, wav] !$= "") {
		//messageClient($player, 0, "~w"@$player.Text[%name, wav]);
		%audio = alxCreateSource( AudioChat, $player.Text[%name, wav] );
		alxPlay( %audio );
	}
	
	removeFromQueue();
	
	%wavLen = alxGetWaveLen($player.text[%name, wav]);
	//if(%wavLen < 400)
	//	%wavLen = 400; // you cant go back in time, vge

   %time =  %wavLen + $player.text[%name, extraTime] + %universalSoundFudgingConstant;
   //echo("total delay time of"@%time);

   $currentlyPlaying = schedule(%time, $player.player, processText, true);
   //if (!isPureServer())
	//   schedule(%time, 0, eval, "$currentlyPlaying = false;");
   //else
	//   schedule(%time, 0, SPUnsetCurrentlyPlaying);
}

function SPUnsetCurrentlyPlaying()
{
	$currentlyPlaying = "";
error(getSimTime() SPC "DEBUG setting currentlyPlaying null");
}

function processTextEval(%evalStmt)
{
   switch$ (%evalStmt)
   {
	   case "singlePlayerPlayGuiCheck();":
	      singlePlayerPlayGuiCheck();
      
      case "schedule(3000, 0, disconnect);":
         schedule(3000, 0, disconnect);

      case "lockArmorHack();autoToggleHelpHud(true);":
         lockArmorHack();autoToggleHelpHud(true);

      case "flashMessage();":
         flashMessage();

      case "flashObjective();":
         flashObjective();
   	
      case "flashCompass();":
         flashCompass();

      case "flashHealth();":
         flashHealth();

      case "flashEnergy();":
         flashEnergy();

      case "flashInventory();":
         flashInventory();

      case "flashSensor();":
         flashSensor();

      case "autoToggleHelpHud(false);":
         autoToggleHelpHud(false);
   	
      case "setWaypointAt(\"-287.5 393.1 76.2\", \"Health Patches\");movemap.push();$player.player.setMoveState(false);":
         setWaypointAt("-287.5 393.1 76.2", "Health Patches");movemap.push();$player.player.setMoveState(false);

      case "$player.hurryUp = schedule(40000, 0, hurryPlayerUp); endOpeningSpiel(); updateTrainingObjectiveHud(obj8);":
         $player.hurryUp = schedule(40000, 0, hurryPlayerUp); endOpeningSpiel(); updateTrainingObjectiveHud(obj8);

      case "updateTrainingObjectiveHud(obj7);":
         updateTrainingObjectiveHud(obj7);
   	
      case "flashWeapon(0);":
         flashWeapon(0);

      case "flashWeapon(2);":
         flashWeapon(2);

      case "flashWeapon(3); ":
         flashWeapon(3); 

      case "flashWeaponsHud();":
         flashWeaponsHud();

      case "use(Blaster);":
         use(Blaster);

      case "queEnemySet(0); activatePackage(singlePlayerMissionAreaEnforce);":
         queEnemySet(0); activatePackage(singlePlayerMissionAreaEnforce);

      case "setWaypointat(nameToId(Tower).position, \"BE Tower\"); updateTrainingObjectiveHud(obj4);":
         setWaypointat(nameToId(Tower).position, "BE Tower"); updateTrainingObjectiveHud(obj4);

      case "flashPack();":
         flashPack();
   	
      case "updateTrainingObjectiveHud(obj3);":
         updateTrainingObjectiveHud(obj3);
   	
      case "setWaypointAt(\"-8.82616 -131.779 119.756\", \"Control Switch\");":
         setWaypointAt("-8.82616 -131.779 119.756", "Control Switch");

      case "setWaypointAt(nameToId(InitialPulseSensor).position, \"Sensor\");":
         setWaypointAt(nameToId(InitialPulseSensor).position, "Sensor");

      case "setWaypointAt(\"-8.82616 -131.779 119.756\", \"Tower\");":
         setWaypointAt("-8.82616 -131.779 119.756", "Tower");

      case "setWaypointAt(\"380.262 -298.625 98.9719\", \"Tower\");":
         setWaypointAt("380.262 -298.625 98.9719", "Tower");
   	
      case "firstPersonQuickPan();":
         firstPersonQuickPan();
   	
      case "ThreeAEval();":
         ThreeAEval();
   	
      case "game.ExpectiongSupportButton = true;":
         game.ExpectiongSupportButton = true;
   	
      case "game.expectingRepairOrder = true;":
         game.expectingRepairOrder = true;
   	
      case "$random = getRandom(20,40);schedule($random, 0, doText, T4_TipDefense06);":
         $random = getRandom(20,40);schedule($random, 0, doText, T4_TipDefense06);

      case "training5addSafeDistance();":
         training5addSafeDistance();
   }
}


function removeFromQueue()
{
	%i = 1;
	while($player.textque[%i] !$= "") {
		$player.textque[%i-1] = $player.textque[%i];
		%i++;
	}
	$player.textque[%i-1] = "";	
}


function addToQueueEnd(%name)
{
	%q = 0;
	while($player.Textque[%q] !$= ""){
		%q++;
	}
	$player.Textque[%q] = %name;
}

function addToQueueNext(%name)
{
	%q = 0;
	while($player.Textque[%q] !$= ""){
		%q++;
	}
	for(%i=%q; %i>0; %i--)
		$player.textque[%i] = $player.textque[%i-1];
	$player.textque0 = %name;
}

function echoQueue()
{
	echo("Textque -------------------------------");
	%i = 0;
	while($player.Textque[%i] !$= "") {
		echo(%i@": "@$player.Textque[%i]);
		%i++;
	}
}

function clearQueue()
{
	for(%i=0;%i<100; %i++)
		$player.textQue[%i] = "";
}

//handy waypoint setting tool
//=========================================================================
function setWaypointAt(%location, %name, %team)
{
	%team = (!%team ? $playerTeam : %team);
	// 	if(!%name)
	// 		%name = "";
	if ( isObject( $player.currentWaypoint ) )
		$player.currentWaypoint.delete();

	$player.currentWaypoint = new WayPoint(TurretTower) {
		position = %location;
		rotation = "1 0 0 0";
		scale = "1 1 1";
		dataBlock = "WayPointMarker";
		team = %team;
		name = %name;
	};
	MissionCleanup.add($player.currentWaypoint);
}

//this is just a little consolidation of functions
//its a little gregarious but allows text to live in spdialg.cs
//intent is to make hud updating easier and localization easier too ;)
function updateTrainingObjectiveHud( %objectiveNum )
{

	//sound
	objectiveHud.setVisible(false);
   if (!isPureServer())
	   schedule(400, game, eval, "objectiveHud.setVisible(true);"); 
   else
	   schedule(400, game, setObjHudVisible); 

	serverPlay2d(TrainingHudUpdateSound);

	//clear old text
	messageClient($player, 'MsgSPCurrentObjective1', "", ' ');
	messageClient($player, 'MsgSPCurrentObjective2', "", ' ');

	// find the lines from the spdialog file that are now attached to the sp client
	%who = $player;
	%mission = $currentMission;
	for(%x = 1; %x <= 2; %x++)
		%newObjectiveLine[%x] = $player.objHud[%mission, %objectiveNum, %x];

	//add new text
	messageClient($player, 'MsgSPCurrentObjective1', "", %newObjectiveLine1);
	if(%newObjectiveLine2 !$= "")
		messageClient($player, 'MsgSPCurrentObjective2', "", %newObjectiveLine2);
}

function setObjHudVisible()
{
	objectiveHud.setVisible(true);
}


// Misc/Overwrites
//=======================================================================================

function isSafe(%object, %radius)
{
	%team = %object.team;
	%position = %object.player.getTransform();

	//check for enemy players
	%num = clientGroup.getCount();
	for(%client = 0; %client <= %num; %client++)
	{
		if(%team != %client.team && %client.player) {
			%enemyPos = %client.player.getTransform();
			//okay, just in case we dont have a player for that client
			//AND are close to "0 0 0" vge
			if(!%enemyPos)
				%dist = 100000;
			else %dist = vectorDist(%position, %enemyPos);
			//error("Debug: Client "@%client@" is "@%dist@" away");
			if ( %dist < %radius){
				//error("Unsafe because of client "@%client@" at a distance of "@%dist@"!!!!");
				return false;
			}
		}
	}
	//error("Safe for a radius of "@%radius@"!");
	return true;
}

function singlePlayerGame::onAIRespawn(%game, %client)
{
	// add the default tasks

	if (! %client.defaultTasksAdded)
	{
		%client.defaultTasksAdded = true;
		%client.addTask(AIEngageTask);
		%client.addTask(AIPickupItemTask);
		%client.addTask(AIUseInventoryTask);
		%client.addTask(AIEngageTurretTask);
		%client.addtask(AIDetectMineTask);
		if(%client.team == $playerTeam || $pref::trainingDifficulty == 3)
			%client.addTask(AITauntCorpseTask);
	}
}


function singlePlayerGame::onAIKilled(%game, %clVictim, %clAttacker, %damageType, %implement)
{
	// dont respawn AI (this is overwritten in some of the mission packages)
}


function singleplayerGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %implement)
{ 
   //the DefaultGame will set some vars
   DefaultGame::onClientDamaged(%game, %clVictim, %clAttacker, %damageType, %implement);

   //now see if both were on the same team
   if(%clAttacker && %clAttacker != %clVictim && %clVictim.team == %clAttacker.team)
   {
	   %game.friendlyFireMessage(%clVictim, %clAttacker);
   }   
}

function singleplayerGame::onAIDamaged(%game, %clVictim, %clAttacker, %damageType, %implement)
{
	if(%clVictim.team != %clAttacker.team && %clVictim.MemberOfWave)
	{
		spawnWaveTimer(%clVictim.MemberOfWave, true);
	}

   if (%clAttacker && %clAttacker != %clVictim && %clAttacker.team == %clVictim.team)
   {
	   schedule(250, %clVictim, "AIPlayAnimSound", %clVictim, %clAttacker.player.getWorldBoxCenter(), "wrn.watchit", -1, -1, 0);
      
      //clear the "lastDamageClient" tag so we don't turn on teammates...  unless it's uberbob!
      %clVictim.lastDamageClient = -1;
   }
}

// find number of players on a team	
//  why isnt this in a std lib
function getPlayersOnTeam(%team)
{
	%num = clientGroup.getCount();
	for(%i=0; %i<%num; %i++){
		%client = clientGroup.getObject(%i);
		if(%client.team == %team && %client.player)
			%count++;
	}

	return %count;
}


//mission completion/falure stuff============================================
function missionComplete(%text)
{
	$player.endMission = schedule(15000, game, forceFinish);
	
	messageBoxOk("Victory", %text, "forceFinish();");

	//AI stop
	clearQueue();
	AIMissionEnd();
	$objectiveQ[$enemyTeam].clear();
}

function forceFinish()
{
	$timeScale = 1;
	//kill the thread if we pressed a button to get here...
	cancel($player.endMission);

	//make sure we end the game neatly
	Game.gameOver();

	//immediately disconnect - bringing us back to the main menu...
	Disconnect();
}

function missionFailed(%text)
{
		
	$player.endMission = schedule(30000, game, forceFinish);
	
	MessageBoxYesNo("Failure", %text, "reloadMission();", "forceFinish();");

	//AI stop
   cancel($Player.T1OpeningSpielSchedule);
   cancel($Player.distanceCheckSchedule);
	clearQueue();
	AIMissionEnd();
	$objectiveQ[$enemyTeam].clear();
}

function reloadMission()
{
	cancel($player.endMission);
	Game.gameOver();
   Canvas.setContent( LoadingGui );
	loadMission($currentMission, singlePlayer);
	debriefContinue();
}


// silly...we fed it a movemap binding it retuns the capitalized key in (almost) english
function findTrainingControlButtons( %name )
{
	%controlName = moveMap.getBinding(%name);
	if (%controlName $= "")
		return "[no key binding]";
	%prettyName = strupr(getMapDisplayName(getWord(%controlName, 0), getWord(%controlName, 1)));
	%next = 2;
	while( getWord( %controlName, %next ) !$= "" ) {
		%extra = "-"@strupr(getWord( %controlName, 2 ));
		%prettyName = %prettyName @ %extra;
		%next++;
	}
	return %prettyName;
}

// just a kinda cool little effect
function firstPersonQuickPan()
{
	if($firstperson) {
		toggleFirstPerson($player);
		schedule(4000, $player.player, toggleFirstPerson, $player);
	}

}


// Player spawning/respawning====================================================
//since we are going through pickTeamSpawn rather than pickPlayerSpawn
// and for a couple other reasons, we are going to need to manually determine
// if this is a respawn or not. 
function spawnSinglePlayer()
{
	$player.lives--;
	
	game.spawnPlayer($player, true);
	$player.setControlObject($player.player);
	//messageClient($player, 0, "Respawns Remaining: "@$player.lives);
}


function singleplayerGame::observerOnTrigger()
{
	//we dont want the player respawning (yet)
	return false;
}

function SinglePlayerGame::spawnPlayer( %game, %client, %respawn )
{
	//error("Spawn Player: %client = " @%client@" %respawn = "@%respawn);
   %spawnPoint = %game.pickPlayerSpawn( %client, %respawn );
   %game.createPlayer( %client, %spawnPoint, %respawn );
}

function singlePlayerGame::playerSpawned(%game, %player)
{
	defaultGame::playerSpawned(%game, %player);
}

function singleplayerGame::pickPlayerSpawn(%game, %client, %respawn)
{
	// the bots, for some reason, always pass in %respawn as true
	// well that's horse pucky, since the bots never respawn in SPG
	// so I do this stupid thing
	if(%client.isAIcontrolled())
		%respawn = false;

 	if(!%client.offense)  // this is a wave spawned attack bot
 		%respawn = true;
		
	
	%game.pickTeamSpawn( %client, %respawn);	
}

function singleplayerGame::pickTeamSpawn(%game, %client, %respawn)
{
	%team = %client.team;
	
	if(%respawn) {
		%group = nameToID("MissionGroup/Teams/team"@%team@"/DropPoints/Respawns");
		if(! isObject(%group)) {
			//error("Client" SPC %client SPC "is attempting a respawn with no drop point");
			return "0 0 300";
		}
		else %spawnLoc = %group.getObject(game.respawnPoint);
		//error("REspawn loc is: " @ %spawnLoc);
	}

	else {
		%group = nameToID("MissionGroup/Teams/team" @ %team @ "/DropPoints");
		%spawnLoc = %group.getObject(game.spawnLoc[%team]);
		//error("spawn loc is: "@game.spawnLoc[%team]);
		game.spawnLoc[%team]++;
	}
	return %spawnLoc.getTransform();
}


function SinglePlayerGame::createCustomKeymap(%game)
{
// 	new ActionMap(TrainingMap);
// 	TrainingMap.bindCmd( keyboard, "escape", "escapeFromGame();", "" );
}

//=======================================================================================
// Escape dialog functions:
//=======================================================================================
function SinglePlayerEscapeDlg::onWake( %this )
{
	$timeScale = 0;

	if( OptionsDlg.isAwake())
   {
		Canvas.popDialog( OptionsDlg );
   }
}

function SinglePlayerEscapeDlg::onSleep( %this )
{
//    spMap.pop();
//    spMap.delete();
}


function SinglePlayerEscapeDlg::leaveGame( %this )
{
   Canvas.popDialog( SinglePlayerEscapeDlg );
   MessageBoxYesNo( "LEAVE GAME", $player.miscMsg[LeaveGame], "forceFinish();", "$timeScale = 1;" );
}

function SinglePlayerEscapeDlg::gotoSettings( %this )
{
   Canvas.popDialog( SinglePlayerEscapeDlg );
   Canvas.pushDialog( OptionsDlg );
}

function SinglePlayerEscapeDlg::returnToGame( %this )
{
   //error( "** CALLING SinglePlayerEscapeDlg::returnToGame **" );
	$timeScale = 1;
	Canvas.popDialog( SinglePlayerEscapeDlg );

	movemap.push();
	//trainingmap.push();
}


function singlePlayerGame::OptionsDlgSleep(%game)
{
   $enableDirectInput = 1;
   activateDirectInput();

   Canvas.pushDialog( SinglePlayerEscapeDlg );
	// the player may have changed his keys
	// we need to reload the big spdialog string table that
	// holds all the text related to the players keymappings
	createText($player);
}

// mission Area package
package singlePlayerMissionAreaEnforce {
// -begin mission area package-------------------------------------------------

//  OOB
function SinglePlayerGame::leaveMissionArea(%game, %playerData, %player)
{
	parent::leaveMissionArea(%game, %playerData, %player);
	if(%player == $player.player) {
		$player.leftMissionArea++;
		%timeAllowed = 30;
		$player.OOB = schedule(%timeAllowed *1000, 0, wussOut, %player);
		clearQueue();
		doText(Any_offcourse);
		MessageClient($player, 0, $player.miscMsg[OOB]);
		%player.playerLeftMissionArea = true;
	}
}
function SinglePlayerGame::enterMissionArea(%game, %playerData, %player)
{
	parent::enterMissionArea(%game, %playerData, %player);
	if(%player == $player.player && %player.playerLeftMissionArea) {
		//echo("player back in bounds");
		cancel($player.OOB);
		clearQueue();
		doText(Any_alright);
		MessageClient($player, 0, $player.miscMsg[InBounds]);
	}
}
function wussOut(%player)
{
	clearQueue();
	doText(Any_abort);
	missionFailed($player.miscMsg[OOBLoss]);
}

// -end mission area package-------------------------------------------------
};

// Custom Particle effects for training5

datablock ParticleData(BeforeT5particle)
{
    dragCoefficient = 0;
    gravityCoefficient = -0.017094;
    inheritedVelFactor = 0.0176125;
    constantAcceleration = -0.8;
    lifetimeMS = 1248;
    lifetimeVarianceMS = 0;
    useInvAlpha = 1;
    spinRandomMin = -200;
    spinRandomMax = 200;
    textureName = "particleTest";
    colors[0] = "1.000000 0.677165 0.000000 1.000000";
    colors[1] = "0.708661 0.507812 0.000000 1.000000";
    colors[2] = "0.000000 0.000000 0.000000 0.000000";
    colors[3] = "1.000000 1.000000 1.000000 1.000000";
    sizes[0] = 0.991882;
    sizes[1] = 2.99091;
    sizes[2] = 4.98993;
    sizes[3] = 1;
    times[0] = 0;
    times[1] = 0.2;
    times[2] = 1;
    times[3] = 2;
};

datablock ParticleData(AfterT5particle)
{
    dragCoefficient = 0;
    gravityCoefficient = -0.017094;
    inheritedVelFactor = 0.0176125;
    constantAcceleration = -1.1129;
    lifetimeMS = 2258;
    lifetimeVarianceMS = 604;
    useInvAlpha = 1;
    spinRandomMin = -200;
    spinRandomMax = 200;
    textureName = "special/Smoke/smoke_001";
    colors[0] = "1.000000 0.677165 0.000000 1.000000";
    colors[1] = "0.181102 0.181102 0.181102 1.000000";
    colors[2] = "0.000000 0.000000 0.000000 0.000000";
    colors[3] = "1.000000 1.000000 1.000000 1.000000";
    sizes[0] = 0.991882;
    sizes[1] = 2.99091;
    sizes[2] = 4.98993;
    sizes[3] = 1;
    times[0] = 0;
    times[1] = 0.2;
    times[2] = 1;
    times[3] = 2;
};

datablock ParticleEmitterData(BeforeT5)
{
    ejectionPeriodMS = 16;
    periodVarianceMS = 10;
    ejectionVelocity = 7.45968;
    velocityVariance = 0.25;
    ejectionOffset =   0;
    thetaMin = 0;
    thetaMax = 180;
    phiReferenceVel = 0;
    phiVariance = 360;
    overrideAdvances = 0;
    orientParticles= 0;
    orientToNormal = 0;
    orientOnVelocity = 1;
    particles = "BeforeT5particle";
};

datablock ParticleEmitterData(AfterT5)
{
    ejectionPeriodMS = 10;
    periodVarianceMS = 0;
    ejectionVelocity = 10.25;
    velocityVariance = 0.25;
    ejectionOffset =   0;
    thetaMin = 0;
    thetaMax = 180;
    phiReferenceVel = 0;
    phiVariance = 360;
    overrideAdvances = 0;
    orientParticles= 0;
    orientToNormal = 0;
    orientOnVelocity = 1;
    particles = "AfterT5particle";
};
