// don't want this executing when building graphs
if($OFFLINE_NAV_BUILD)
   return;

// script fror training mission 3
//-------------------------------------------------------------

//init
//-------------------------------------------------------------
echo("Running Mission 3 Script");
activatePackage(Training3);


$numberOfEnemies[1] = 5;
$numberOfEnemies[2] = 7;
$numberOfEnemies[3] = 7;
$numberOfTeammates = 0;
$missionBotSkill[1] = 0.0;
$missionBotSkill[2] = 0.5;
$missionBotSkill[3] = 0.9;
$missionEnemyThreshold[1] = 0;
$missionEnemyThreshold[2] = 3;
$missionEnemyThreshold[3] = 7;


//the Scout is very important
$Shrike = nameToId("Ride");
// activate the wings on the flyer
$Shrike.playThread($ActivateThread, "activate");

// for the distance checking
addMessageCallback('MsgWeaponMount', playerMountWeapon);

package training3 {
//===============================================begin the training 3 package stuff====

function SinglePlayerGame::initGameVars(%game)
{
   // for many of the objectives we are going to periodically
   // check the players distance vs some object
   // you could do this much prettier but its going to be very specific
   // so a cut and paste eyesore will be fine
   echo("initializing training3 game vars");
   %game.base = nameToId("Shield");
   %game.baseLocation = game.base.getTransform();
   %game.base.threshold = 400;
   %game.end = nameToId("PlayerDropPoint");
   %game.endLocation = game.end.getTransform();
}

function MP3Audio::play(%this)
{
	//too bad...no mp3 in training
}

// force always scope for testing
function singlePlayerGame::onAIRespawn(%game, %client)
{
	if(! isObject("MissionCleanup/TeamDrops2")) {
		//this is the snippet of script from default games that puts teamdrops
		// into the mission cleanup group...slightly modified to suit our needs
		%dropSet = new SimSet("TeamDrops2");
		MissionCleanup.add(%dropSet);

		%spawns = nameToID("MissionGroup/Teams/team2/TeamDrops");
		if(%spawns != -1)
		{
			%count = %spawns.getCount();
			for(%i = 0; %i < %count; %i++)
				%dropSet.add(%spawns.getObject(%i));
		}
	}
	
	// error("Forcing AI Scope!!!!!!!!!!!!!");
	// %client.player.scopeToClient($player);

	parent:: onAIRespawn(%game, %client);
}

function getTeammateGlobals()
{
	echo("You have no teammates in this mission");
}

function toggleScoreScreen(%val)
{
	if ( %val )
		//error("No Score Screen in training.......");
		messageClient($player, 0, $player.miscMsg[noScoreScreen]);
}

function toggleCommanderMap(%val)
{
	if ( %val )
	messageClient($player, 0, $player.miscMsg[noCC]);
}

function toggleTaskListDlg( %val )
{
   if ( %val )
      messageClient( $player, 0, $player.miscMsg[noTaskListDlg] );
}

function toggleNetDisplayHud( %val )
{
   // Hello, McFly?  This is training!  There's no net in training!
}

function voiceCapture( %val )
{
   // Uh, who do you think you are talking to?
}

function giveall()
{
	error("When the going gets tough...wussies like you start cheating!");
	messageClient($player, 0, "Cheating eh?  What\'s next?  Camping?");
}

function kobayashi_maru()
{
   $testcheats = true;
   commandToServer('giveAll');
}

function AIEngageTask::assume(%task, %client)
{
	Parent::assume(%task, %client);

	if(%client.team != $playerTeam)
		game.biodermAssume(%client);
}

function countTurretsAllowed(%type)
{
	return $TeamDeployableMax[%type];
}


function FlipFlop::objectiveInit(%data, %flipflop)
{
}

function ClientCmdSetHudMode(%mode, %type, %node)
{
	parent::ClientCmdSetHudMode(%mode, %type, %node);
	//TrainingMap.push();
}


// get the ball rolling
function startCurrentMission(%game)
{

	//just in case
	setFlipFlopSkins();
	schedule(5000, %game, opening);
	schedule(30000, %game, objectiveDistanceChecks);
	updateTrainingObjectiveHud(obj1);

	if($pref::trainingDifficulty == 1) {
		nameToId(BackEnterSentry).hide(true);
      freeTarget(nameToId(BackEnterSentry).getTarget());
	}
}

function opening()
{
	if(game.vehicleMount)
		return;
	doText(T3_01);
	//doText(T3_02);
	doText(T3_cloaking);
	doText(T3_tipCloaking01);
	doText(T3_tipCloaking02);
}

function SinglePlayerGame::equip(%game, %player)
{
	//ya start with nothing...NOTHING!
	%player.clearInventory();

   for(%i =0; %i<$InventoryHudCount; %i++)
      %player.client.setInventoryHudItem($InventoryHudData[%i, itemDataName], 0, 1);
   %player.client.clearBackpackIcon();

	//echo("Light Assassin Config");

	%player.setArmor("Light");
	
	%player.setInventory(CloakingPack, 1);
	
	%player.setInventory(RepairKit,1);
	%player.setInventory(FlashGrenade,5);
	%player.setInventory(Mine,3);

	%player.setInventory(Plasma, 1);
	%player.setInventory(PlasmaAmmo, 20);
	%player.setInventory(Disc,1);
	%player.setInventory(DiscAmmo, 15);
	%player.setInventory(TargetingLaser, 1);
	%player.setInventory(ShockLance,1);
	%player.weaponCount = 3;

	%player.use("Disc");
}                  

// ============================================================================
function singlePlayerGame::onAIKilled(%game, %clVictim, %clAttacker, %damageType, %implement)
{
	%teamCount = getPlayersOnTeam(%clVictim.team);
	//echo("Team count:" SPC %teamCount);
	%maintNum = $missionEnemyThreshold[$pref::trainingDifficulty];
	//echo("Maintain:" SPC %maintNum); 

	%clVictim.useSpawnSphere = true;

	// this will respawn the AI if
	if( %teamCount < %maintNum )
		DefaultGame::onAIKilled(%game, %clVictim, %clAttacker, %damageType, %implement);

}

function singleplayerGame::pickTeamSpawn(%game, %client, %respawn)
{
	if(%client.useSpawnSphere)
		DefaultGame::pickTeamSpawn(%game, %client.team);
	else
		parent::pickTeamSpawn(%game, %client, %respawn); 
}




function clientCmdVehicleMount()
{
	if(game.vehicleMount++ == 1) {
	   doText(Any_Waypoint01, 2000);
	   //doText(Any_Waypoint03, 4000);
	   doText(T3_tipPiloting01);
	   doText(T3_02);
	   doText(T3_05);
		schedule(4000, game, setWaypointAt, game.baseLocation, "Icefell Ridge Base");
		updateTrainingObjectiveHud(obj2);
		
		game.pilotingTips = schedule(60000, game, PilotingTips);
	}
	if(game.phase == 4) {
		setWaypointAt(game.endLocation, "Extraction Point");
		updateTrainingObjectiveHud(obj3);
		doText(T3_11);
		doText(T3_12);
		game.phase = 5;
		
		if(!nameToId(AATurretGen).isDisabled())
			doText(t3_12a);
	}
}

function RepairPack::onCollision(%this,%obj,%col)
{
	if($player.player.getInventory(CloakingPack) && $player.player.getDamageLevel() > 0.2
		&& !game.msgtipEquip && %col == $player.player) {
		game.msgTipEquip = true;
		doText(T3_tipEquipment02);	
	}
		
	parent::onCollision(%this,%obj,%col);
}


// 86 the vehicle removal on dying
function vehicleAbandonTimeOut(%vehicle)
{
// dont mess it up
} 

function playerMountWeapon(%tag, %text, %image, %player, %slot)
{		   
	if( game.firstTime++ < 2)
		return;  // initial weapon mount doesnt count

	if(%image.getName() $= "ShockLanceImage" && !game.msgShock) {
		game.msgShock = true;
		//doText(T3_TipShockLance);  
	} 
}

function FlipFlop::playerTouch(%data, %flipFlop, %player )
{
	
	//echo("singlePlayer::playerTouchFlipFlop");
	%client = %player.client;
	%flipTeam = %flipflop.team;

	if(%flipTeam == %client.team)
		return false;

	nameToId(Shield).delete();
	
	//just the sound
	messageAll( 'MsgClaimFlipFlop', '~wfx/misc/flipflop_taken.wav', %client.name, Game.cleanWord( %flipflop.name ), $TeamName[%client.team] );

	if(%player == $player.player)
		schedule( 1500, game, flipFlopFlipped);

	objectiveDistanceChecks();

	//change the skin on the switch to claiming team's logo
	setTargetSkin(%flipflop.getTarget(), $teamSkin[%player.team]);
	setTargetSensorGroup(%flipflop.getTarget(), %player.team);

	// convert the resources associated with the flipflop
	Game.claimFlipflopResources(%flipflop, %client.team);

	Game.AIplayerCaptureFlipFlop(%player, %flipflop);

	return true;
}

function scoutFlyer::onRemove(%this, %obj)
{
	error("scoutFlyer::onRemove("@ %obj@") called");
   if ( ! isObject( ServerConnection ) )
	return;
	if(%obj == $Shrike ) {
		// we dont want the player to die hitting the ground
		cancel(game.pilotingTips);
		$player.player.invincible = true;  
		missionFailed($player.miscMsg[training3shrikeLoss]);
	}
}

function WeaponImage::onMount(%this,%obj,%slot)
{
	messageClient(%obj.client, 'MsgWeaponMount', "", %this, %obj, %slot);
	Parent::onMount(%this,%obj,%slot);
}

function GeneratorLarge::onDestroyed(%dataBlock, %destroyedObj, %prevState)
{
	if(%destroyedObj == nameToId("PrisonGen") && !game.msgGenDestroyed)
	{
		game.msgGenDestroyed = true;
		doText(Any_ObjComplete01);
		updateTrainingObjectiveHud(obj6);
	}
	else if(%destroyedObj == nameToId(AATurretGen))
		$player.AAGenWaypoint.delete();

}

// If the forcefield is shot we play this little wav file
function ProjectileData::onCollision(%data, %projectile, %targetObject, %modifier, %position, %normal)
{
	//error("ProjectileData::onCollision("@%data@", "@%projectile@", "@%targetObject@", "@%modifier@", "@%position@", "@%normal@")");
	parent::onCollision(%data, %projectile, %targetObject, %modifier, %position, %normal);

	if(game.msgGenDestroyed)
		return;
	else if(%targetObject.getDataBlock().getName() $= nameToId(Shield).dataBlock) {
		//error("someone shot the force field");
		if(%projectile.sourceObject == $player.player){
			//error("it was you f00");
			if(!game.msgMustDestroyGen) {
				game.msgMustDestroyGen = true;
				doText(T3_07b);
			}
		}
	}
}


function addTraining3Waypoints()
{
	//do the hud updating also
	$player.currentWaypoint.delete();
	updateTrainingObjectiveHud(obj5);
	
	%Training3WaypointsGroup = new simGroup(Training3Waypoints);
	MissionCleanup.add(%Training3WaypointsGroup);

	%waypoint = new WayPoint() {
		position = nameToId(FF).position;
		rotation = "1 0 0 0";
		scale = "1 1 1";
		dataBlock = "WayPointMarker";
		lockCount = "0";
		homingCount = "0";
		name = "Control Point";
		team = "0";
			locked = "true";
	};
	%Training3WaypointsGroup.add(%waypoint);
	
	%waypoint = new WayPoint() {
		position = nameToId(BaseGen).getWorldBoxCenter();
		rotation = "1 0 0 0";
		scale = "1 1 1";
		dataBlock = "WayPointMarker";
		lockCount = "0";
		homingCount = "0";
		name = "Main Base Power";
		team = "0";
			locked = "true";
	};
	%Training3WaypointsGroup.add(%waypoint);
	
	%waypoint = new WayPoint() {
		position = nameToId(sensorNetGen).getWorldBoxCenter();
		rotation = "1 0 0 0";
		scale = "1 1 1";
		dataBlock = "WayPointMarker";
		lockCount = "0";
		homingCount = "0";
		name = "Sensor Power";
		team = "0";
			locked = "true";
	};
	%Training3WaypointsGroup.add(%waypoint);
	
	%waypoint = new WayPoint() {
		position = nameToId(AATurretGen).getWorldBoxCenter();
		rotation = "1 0 0 0";
		scale = "1 1 1";
		dataBlock = "WayPointMarker";
		lockCount = "0";
		homingCount = "0";
		name = "AntiAircraft Turret Power";
		team = "0";
			locked = "true";
	};
	//%Training3WaypointsGroup.add(%waypoint);
	$player.AAGenWaypoint = %waypoint;

	%waypoint = new WayPoint() {
		position = nameToId(prisonGen).getWorldBoxCenter();
		rotation = "1 0 0 0";
		scale = "1 1 1";
		dataBlock = "WayPointMarker";
		lockCount = "0";
		homingCount = "0";
		name = "Forcefield Power";
		team = "0";
			locked = "true";
	};
	%Training3WaypointsGroup.add(%waypoint);
}

function RandomPilotingTips()
{
	// this is unused as testers claimed it sounded 'disjointed and random'

	if(pilotingTips())
		game.pilotingTips = schedule(20000, $player.player, RandomPilotingTips);
}

function pilotingTips()
{
	%num = 2;
	if(game.Training3tips == %num)
		return false;
	%tip = getRandom(1, %num);
	if( game.training3TipUsed[%tip] )
		return true;
	switch(%tip){
		case 1:
		   doText(T3_tipfreelook);
		case 2:
		   doText(T3_tipPiloting04);
// 		case 3:
// 		   doText(T3_tipPiloting02);
// 		case 4:
// 		   doText(T3_tipUnderwater01);
	}
	game.training3Tips++;
	game.training3TipUsed[%tip] = true;
	return true;
}


//misc
//-------------------------------------------------------------

function objectiveDistanceChecks()
{
	%playerPos = $player.player.getTransform();
	if(!%playerPos) {
		schedule(2000, game, objectiveDistanceChecks);
		return;
	}

	%cont = true;
	%basedistance = vectorDist( %playerPos, game.baseLocation );

	if(game.phase == 0 && %basedistance < game.base.threshold ) {
	   doText(T3_06, 4000);
	   doText(T3_tipCloaking03);
	   doText(T3_07);
	   game.phase = 1;
	   %cont = false;
		cancel(game.pilotingTips);
	   addTraining3Waypoints();
	   game.respawnPoint = 1;
	   
	}
	if(game.phase == 5 && vectorDist(%playerPos, game.baseLocation) > 1000 )
	{ 
		game.phase = 6;
		serverConnection.setBlackout(true, 3000);
		schedule(3000, game, finishMission);
	}

	if(%cont)
		schedule(2000, game, objectiveDistanceChecks);
}

function finishMission()
{
	$shrike.setFrozenState(true);
	nameToId(AATurretGen).setDamageState(Disabled);  //hack! cheating!
	doText(T3_13);
	//messageAll(0, "Nya, nya, nyanyanay...this missions oh-ohover!");
	missionComplete($player.miscMsg[training3win]);
	%cont = false;
}


function flipFlopFlipped()
{
	//error("flip flop flipped");
	if(!game.flipFlopped) {
		game.flipFlopped = true;
   
   		// if we need a message modify this.
   		//messageTeam( %client.team, 'MsgClaimFlipFlop', '\c2%1 claimed %2 for %3.~wfx/misc/flipflop_taken.wav', %client.name, Game.cleanWord( %flipflop.name ), $TeamName[%client.team] );
		
		doText(T3_09, 8000);
		doText(T3_10);
		game.phase = 4;

		if(!nameToId(AATurretGen).isDisabled())
			doText(t3_09a);

		// new waypoint at the shrike
		setWaypointAt($shrike.getTransform(), "Shrike");
		updateTrainingObjectiveHud(obj4);

		//get rid of the other waypoints
		nameToId(Training3Waypoints).delete();
	}
}

// Mission area is pointless this time out
function SinglePlayerGame::leaveMissionArea(%game, %player)
{
}
function SinglePlayerGame::enterMissionArea(%game, %player)
{
}

//===============================================END the training 3 package stuff====
};


	  

