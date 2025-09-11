// don't want this executing when building graphs
if($OFFLINE_NAV_BUILD)
   return;

//  Script for mission 1
//===================================================================================
//error("Training 1 script");

// package and callbacks
activatePackage(Training1);

addMessageCallback('MsgWeaponMount', playerMountWeapon);

datablock EffectProfile(HudFlashEffect)
{
   effectname = "gui/buttonOver";
   minDistance = 10;
};

// additional mission Audio
datablock AudioProfile(HudFlashSound)
{
   filename    = "gui/buttonover.wav";
   description = AudioDefault3d;
   preload = true;
   effect = HudFlashEffect;
};

// additional mission Audio
datablock AudioProfile(HeartbeatSound)
{
   filename    = "fx/misc/heartbeat.wav";
   description = Audio2D;
   preload = true;
   looping = false;
};

// variables
$numberOfEnemies[1] = 7;
$numberOfEnemies[2] = 10;
$numberOfEnemies[3] = 14;
$numberOfTeammates = 2;
$missionBotSkill[1] = 0.0;
$missionBotSkill[2] = 0.4;
$missionBotSkill[3] = 0.7;

//------------------------------------------------------------------------------
function getTeammateGlobals()
{
	$TeammateWarnom0 = "WildSide";
	$teammateskill0 = 0.5;
	$teammateVoice0 = Male3;
	$teammateEquipment0 = 0;
	$teammateGender0 = Male;

	$TeammateWarnom1 = "Proteus";
	$teammateSkill1 = 0.5;
	$teammateVoice1 = Male4;
	$teammateEquipment1 = 0;
	$teammateGender1 = Male;
}


$victimSet[1] = "0 7 10 11";
$victimSet[2] = "1 8 12";
$victimSet[3] = "2 9 13";

package Training1 {
//BEGIN TRAINING1 PACKAGE =======================================================================

//------------------------------------------------------------------------------

function SinglePlayerGame::initGameVars(%game)
{
   echo("initializing training1 game vars");
   %game.pilotName = "McWatt";
   %game.bombardierName = "Yossarian";

   %game.tower = nameToId("Tower");
   %game.tower.threshold1 = 330;
   %game.tower.threshold2 = 80;
}

//scriptlet
//we have to jump through a lot of hoops to get those dead bodies in training1
function deadArmor::onAdd(%this, %obj)
{
	%skin = (%obj.trainingSkin == 1 ? 'swolf' : 'beagle');
	//echo("skin = " SPC %skin);
	createTarget(%obj, 'Dead Body', %skin, "", 'deadArmor', 0);
}

function deadArmor::onRemove(%this, %obj)
{
	//echo("singleplayerGame -- deadArmor::onRemove");
	freeTarget(%obj.getTarget());
}

function MP3Audio::play(%this)
{
	//too bad...no mp3 in training
}

function countTurretsAllowed(%type)
{
	return $TeamDeployableMax[%type];
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

function toggleInventoryHud( %val )
{
   if ( %val )
      messageClient( $player, 0, $player.miscMsg[noInventoryHUD] );
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
   $testCheats = true;
   commandToServer('giveAll');
}

// get the ball rolling
//------------------------------------------------------------------------------
function startCurrentMission()
{
	playGui.add(outerChatHud);
   //fade up from black
   ServerConnection.setBlackOut(true, 0);

   //can't change settings during the intro...
   SinglePlayerEscSettingsBtn.setActive(0);

   updateTrainingObjectiveHud(obj1);
   setTeammatesCMapInvisible(true);
   $teammate0.player.invincible = true;
   $teammate1.player.invincible = true;
   resetWildcat();

}

//------------------------------------------------------------------------------
function SinglePlayerGame::equip(%game, %player)
{
   //ya start with nothing...NOTHING!
   %player.clearInventory();
   for(%i =0; %i<$InventoryHudCount; %i++)
      %player.client.setInventoryHudItem($InventoryHudData[%i, itemDataName], 0, 1);
   %player.client.clearBackpackIcon();

   %set = %player.client.equipment;
   //error("equping Player "@%player@" with set"@%set);
   switch (%set)
   {
   case 0:
      echo("using default equipment");

      %player.setArmor("Light");
      %player.setInventory(RepairKit,1);
      %player.setInventory(Blaster,1);
      %player.setInventory(Disc,1);
      %player.setInventory(Chaingun, 1);
      %player.setInventory(ChaingunAmmo, 100);
      %player.setInventory(DiscAmmo, 20);
      %player.weaponCount = 3;

      %player.use(Disc);

   case 1:
      echo("using case 1 equipment");

      %player.setArmor("Light");
      %player.setInventory(RepairKit,1);
      %player.setInventory(Blaster,1);
      %player.setInventory(Disc,1);
      %player.setInventory(Chaingun, 1);
      %player.setInventory(ChaingunAmmo, 100);
      %player.setInventory(DiscAmmo, 20);
      %player.setInventory(EnergyPack, 1);
      %player.weaponCount = 3;

   case 2: 
      %player.setArmor(Heavy);

      //%player.setInventory(CloakingPack, 1);

      %player.setInventory(RepairKit,1);
      %player.setInventory(Grenade,6);

      %player.setInventory(Plasma, 1);
      %player.setInventory(PlasmaAmmo, 25);
      %player.setInventory(Disc,1);
      %player.setInventory(DiscAmmo, 20);
      %player.setInventory(ElfGun, 1);
      %player.setInventory(MissileLauncher,1);
      %player.setInventory(MissileLauncherAmmo, 10);
      %player.setInventory(TargetingLaser, 1);
      %player.weaponCount = 4;
      
      %player.use(Disc);
   }
}                  

// Objectives
//=================================================================================

//------------------------------------------------------------------------------
function openingSpiel()
{
   //schedule(11000, 0, updateTrainingObjectiveHud, obj2);
   doText(T1_01);
   doText(T1_01a);
   doText(T1_01b);
   doText(T1_01c);
   doText(T1_02);
   doText(T1_02a);
   doText(T1_03);
   doText(T1_download01);
   doText(T1_03a);
   doText(T1_03b, 1000);
   doText(T1_03c, 1000);
   doText(T1_17, 700);
   doText(T1_04, 3000);
   doText(T1_05, 3000);
   doText(T1_06);
   doText(T1_tipEnergy);
   doText(T1_08, 2500);
   doText(T1_09, 4000);
   doText(T1_10, 1000);
   doText(T1_11);
   doText(T1_10a);
   doText(T1_10b);
}                    

//------------------------------------------------------------------------------
function hurryPlayerUp()
{
   doText(Any_abortwarn);
   $player.hurryUp = schedule(45000, $player.player, DoText, Any_abort);   
}


// vehicle:  vehicle controls, destination
//------------------------------------------------------------------------------
function clientCmdVehicleMount()
{
   parent::clientCmdVehicleMount();

   game.respawnPoint = 3;

   //order chasers to attack (chasers are enemies 3 - 6)
   if(!game.mountVehicle){
      game.mountVehicle = true;
      //doText(T1_28);
      doText(T1_29);
      doText(T1_29a);
      doText(Any_Waypoint03);
   
      // and waypoint to MPB
      setWaypointAt(nameToId(MPB).position, "Extraction Team");
      updateTrainingObjectiveHud(obj5);
      // for now
      for( %x = 3; %x <= 6; %x++ )
         if($enemy[%x].player)
            $enemy[%x].stepEngage($player);
   
   }
}

//------------------------------------------------------------------------------
function SniperRifle::onCollision(%data,%obj, %col)
{
   //echo("Sniper Rifle Collision");
   if(!game.msgSniperNoPickup && $player.player.weaponCount >= 3) {
      game.msgSniperNoPickup = true;
      clearQueue();
      doText(T1_24);
      //doText(T1_24a);
   }
   else if(!game.msgSniperPickUp && $player.player.weaponcount < 3) {
      game.msgSniperPickUp = true;
      game.msgSniperNoPickup = true;
      clearQueue();
      doText(T1_TipSniper02);
   }
   
   ItemData::onCollision(%data,%obj,%col);
}


//------------------------------------------------------------------------------
function RepairPatch::onCollision(%data,%obj,%col)
{
   parent::onCollision(%data,%obj,%col);
   if(game.repair++ != 3)
      return;

   if(%col == $player.player && !game.gotRepairKit)
   {
      game.gotRepairKit = true;
      if(!game.blowOff){
         moveMap.push();  //jic
         doText(T1_12a);
         spiel2();
      }
   }
}

//------------------------------------------------------------------------------
function EnergyPack::onCollision(%data,%obj,%col)
{
   parent::onCollision(%data,%obj,%col);
   if (!game.EnergyPackPickup) {
      game.EnergyPackPickup = true;
      clearQueue();
      doText(T1_tipPack01);
      doText(T1_tipPack02);
   }
}

//------------------------------------------------------------------------------
function playerMountWeapon(%tag, %text, %image, %player, %slot)
{        
   if( game.firstTime++ < 2)
      return;  // initial weapon mount doesnt count

   //echo("the problem is the image name: "@%image.getName());
   if(%image.getName() $= "BlasterImage" && !game.msgBlast) {
      game.msgBlast = true;
      //doText(T1_TipBlaster01);  
      } 
   if(%image.getName() $= "ChaingunImage" && !game.msgChain) {
      game.msgchain = true;
      //doText(T1_TipChaingun); 
   }
   if(%image.getName() $= "DiscImage" && !game.msgDisc) {
      game.msgDisc = true;
      //doText(T1_TipSpinfusor);  
   }
   if(%image.getName() $= "SniperRifleImage" && !game.msgSnipe) {
      game.msgSnipe = true;
      doText(T1_TipSniper03);  
      doText(T1_TipSniper04);  
   }
}

//------------------------------------------------------------------------------
function WeaponImage::onMount(%this,%obj,%slot)
{
   messageClient(%obj.client, 'MsgWeaponMount', "", %this, %obj, %slot);
   parent::onMount(%this,%obj,%slot);
}


//------------------------------------------------------------------------------
function spawnSinglePlayer()
{
   resetWildCat();
   parent::spawnSinglePlayer();
}

//------------------------------------------------------------------------------
function resetWildCat()
{

   if(isObject($player.vehicle))
      $player.vehicle.delete();

   $player.vehicle = new HoverVehicle(hoverBike) {
      position = nameToId(hoverBikeDP).position;
      rotation = "0.200891 0.091345 0.975346 17.3161";
      scale = "1 1 1";
      dataBlock = "scoutVehicle";
   };
}


//------------------------------------------------------------------------------
function spiel2()
{
   game.respawnPoint = 1;
   //moveMap.bindCmd( keyboard, "backspace", "", "skipWeaponsCheck();" );
   clearQueue();
   cancel($player.hurryUp);
   $player.currentWaypoint.delete();  //?
   doText(T1_12b);
   doText(T1_TipIFF);
   doText(T1_13);
   doText(T1_14);
   doText(T1_TipBlaster01);  
   doText(T1_15);
   doText(T1_TipChaingun);  
   doText(T1_16);
   doText(T1_TipSpinfusor);  
   //doText(T1_17);
   //doText(T1_TipBlaster02);
   //doText(T1_TipJets02);
   //doText(T1_18a);
   doText(T1_22);
   doText(T1_22a);
   doText(T1_18, 5000);
   doText(ANY_tipNow01);
   doText(T1_tipjets01);
}

function singlePlayerGame::onAIRespawn(%game, %client)
{
   // DONT add the default tasks
   //error("default tasks not added");
}

//------------------------------------------------------------------------------
function missionClientKilled(%victim, %killer)
{
   // this is just a bit messy as I added the training difficulty stuff late
   %skill = $pref::trainingDifficulty;
   
   if(%victim == $player) {
   //error("Player victim re engagement");
      for(%i = 0; %i < clientGroup.getCount(); %i++) { 
         %client = clientGroup.getObject(%i);
         if(%client.isAIControlled())
            if(%client.getStepName() $= "AIStepEngage") {
               %client.shouldEngageOnPlayerRespawn = true;
               //error(%client.name SPC " should Engage On Player Respawn.");
            }
      }
   }

   if(%victim.team != $player.team && %skill < 3)
      schedule(3000, $player.player, adviseHealthKit); 

   %setDestroyed = checkForSequenceSkillCompletion(%victim);
   switch(%setDestroyed) {
      case 1:
         doText(ANY_Kudo04, 3000);
         doText(T1_21);
         //doText(T1_22);
         //doText(ANY_tipscavenge02, 1000);
         doText(ANY_tipscavenge01);
      case 2:
         doText(ANY_Kudo01, 3000);
         game.EngagingEnemy1 = false;  
         doText(T1_26);
         $enemy2.stepEngage($player);
         $enemy2.clientDetected($player);
         if(%skill > 1) {
            $enemy9.stepEngage($player);
            $enemy9.clientDetected($player);
         }
         if(%skill > 2) {
            $enemy13.stepEngage($player);
            $enemy13.clientDetected($player);
         }

         if(%skill == 0) {
            //the first test of this went so well we're doing it again
            %target = $enemy2.player.getTarget();
            %mask = getTargetAlwaysVisMask(%target);
            setTargetAlwaysVisMask(%target, %mask |(1<<1));
         }

      case 3 :
         doText(T1_27a);
         doText(T1_27b, 1000);
         doText(T1_28, 5000);
         doText(Any_TipSkiing);
         schedule(9000, game, setWaypointAt, nameToId($player.vehicle).getTransform(), "Vehicle" );
         updateTrainingObjectiveHud(obj6);
         setTeammatesCMapInvisible(false);
   }
}

//------------------------------------------------------------------------------
function adviseHealthKit()
{
	if(game.trainingIntro)
		return;
   if($player.player.getdamageLevel() > 0.3
      && $player.player.getInventory(RepairKit) && game.useHeath++ < 4) {
      doText(Any_HealthKit);
   }
}

function checkForSequenceSkillCompletion(%victim)
{
   %set = findVictimSet(%victim);
   //how is everbody esle in the set doing
   for(%i = 0; %i < getWordCount($victimSet[%set]); %i++){
      %enemy = getWord($victimSet[%set], %i);
      if($enemy[%enemy] && $enemy[%enemy].player && $enemy[%enemy] != %victim) {
         //error("There is $Enemy"@%enemy@" still in set "@ %set);
         return 0;
      }
   }
   return %set;

}

function findVictimSet(%victim)
{
   for(%i = 1; %i <= 3; %i++) {
      for(%word = 0; %word < getWordCount($victimSet[%i]); %word++) {
         %num = getWord($victimSet[%i], %word);
         if($enemy[%num] == %victim) {
            //error("Victim is member of victim set "@%i);
            return %i;
         }
      }
   }
   return 0;
}

// hokay...we have gone away from the default ai so we have to keep our forced-task
// AI system intact.  If the player is killed the AI will forget about him.
// Lets iterate   throught the client group and find out who should re-engage the player
// %client.shouldEngageOnPlayerRespawn is set in missionClientKilled
function singlePlayerGame::playerSpawned(%game, %player)
{
   parent::playerSpawned(%game, %player);
   
   if(%player.client == $player) {
      for(%i = 0; %i < clientGroup.getCount(); %i++) { 
         %client = clientGroup.getObject(%i);
         if(%client.isAIControlled())
            if(%client.shouldEngageOnPlayerRespawn) {
               //error(%client.name SPC " is re-engaging.");
               %client.stepEngage($player);
            }
      }
   }

}
//------------------------------------------------------------------------------
function singlePlayerGame::gameOver(%game)
{
   //enable the voice chat menu again...
   if (isObject(training1BlockMap))
   {
      training1BlockMap.pop();
      training1BlockMap.delete();
   }

   //moveMap.bindCmd( keyboard, "backspace", "", game.returnBinding );
   //allow the observer cam to move again...
   $Camera::movementSpeed = 40;
	$AIDisableChatResponse = "";
   cancel($Training1Blackout);
   cancel($Training1HitGround);
   LightMaleHumanArmor.minImpactSpeed = 45;
   $player.player.mountVehicle = true;

   if(HelpTextGui.isVisible())
      helpTextGui.setVisible(false);
   
   //re-enable the use of the settings button...
   SinglePlayerEscSettingsBtn.setActive(1);

   Parent::gameOver();
}

function autoToggleHelpHud(%state)
{
   if(HelpTextGui.isVisible() != %state)
      toggleHelpText();

}


//------------------------------------------------------------------------------
function skipIntroCinematic()
{
   messageClient($player, 0, "Skipping intro...");
   clearQueue();
   trainingIntroFlightEnd();
}

function skipFlashingHud()
{
   messageClient($player, 0, "Skipping HUD tutorial...");
   clearQueue();
   moveMap.push();
   spiel2();
}

function skipWeaponsCheck()
{
   messageClient($player, 0, "Skipping weapons tutorial....");
   clearQueue();
   doText(Any_blowOff3);
   setWaypointAt(nameToId(Tower).position, "Tower");
   updateTrainingObjectiveHud(obj4);
   queEnemySet(0);
   
   //moveMap.bindCmd( keyboard, "backspace", "", game.returnBinding );
}



//------------------------------------------------------------------------------
function objectiveDistanceChecks()
{
   %playerPosition = $player.player.getTransform();
   if(!%playerPosition) {
      $player.distanceCheckSchedule = schedule(5000, game, objectiveDistanceChecks);
      return;
   }

   %base1distance = vectorDist( %playerPosition, game.tower.position ); 
   //error("debug distance: tower- "@%base1distance);
   if(%base1distance < game.tower.threshold1 && !game.base1t1 ) {
      game.base1t1 = true;
      if(!$enemy0.dead) {
         $enemy0.stepEngage($player);
         %skill = $pref::trainingDifficulty;
         if(%skill > 1)
            $enemy7.stepEngage($player);
         if(%skill > 2) {
            $enemy10.stepEngage($player);
            $enemy11.stepEngage($player);
         }
         clearQueue();
         doText(Any_Blowoff1);
      }
      else {
         doText(ANY_tipNow02);
         doText(T1_tipSkiing01); 
         doText(T1_tipSkiing02); 
         doText(T1_tipSkiing03);
      }
   }
   if(%base1distance < game.tower.threshold2) {
      if(!game.base1t2) {
         game.respawnPoint = 2;
         doText(T1_23);
         doText(T1_23a);
         doText(T1_23b);
         schedule(45000, game, queEnemySet, 1);
      }

      game.base1t2++;
      
   }
   
   //MPB
   %mpbDist = vectorDist( %playerPosition, nameToId(MPB).position );
   //echo("debug distance: mpb- "@%mpbdist);
   if(%mpbDist < 70 && !game.completed) {
      game.completed = true;
      clearQueue();
      doText(T1_30, true);
      $player.vehicle.setFrozenState(true);

      missionComplete($player.miscMsg[training1win]);
   }
   
   $player.distanceCheckSchedule = schedule(1000, game, objectiveDistanceChecks);
}

//------------------------------------------------------------------------------
function queEnemySet(%set)
{
   switch(%set) {
      case 0:
         %skill = $pref::trainingDifficulty;
         if($enemy0.player) {
            $enemy0.stepEngage($player);
         }
         if(%skill > 1 && $enemy7.player)
            $enemy7.stepEngage($player);
         if(%skill > 2 && $enemy10.player) {
            $enemy10.stepEngage($player);
         }
         if(%skill > 2 && $enemy11.player) {
            $enemy11.stepEngage($player);
         }
      case 1:
         doText(T1_25);
         doText(T1_25a);
         doText(T1_tipTactics);
         $enemy1.stepEngage($player);
         $enemy1.clientDetected($player);
         %skill = $pref::trainingDifficulty;
         //messageClient($player, 0, "Debug:"SPC $enemy1 SPC "has just been issued an engage order for" SPC $player);
         if(%skill > 1)
            $enemy8.stepEngage($player);
            $enemy8.clientDetected($player);
         if(%skill > 2) {
            $enemy12.stepEngage($player);
            $enemy12.clientDetected($player);
         }
         game.engagingEnemy1 = true;
         updateTrainingObjectiveHud(obj3);

         //we are going to try some tricky 0000 to make this enemy always visible to sensors
         %target = $enemy1.player.getTarget();
         %mask = getTargetAlwaysVisMask(%target);
         setTargetAlwaysVisMask(%target, %mask |(1<<1));
      }
}


// Training specific functions
//-----------------------------------------------------------------------------
function lockArmorHack()
{
   updateTrainingObjectiveHud(obj2);
   movemap.pop();
   //$player.player.setMoveState(true);
   //$player.player.schedule(1000,"setMoveState", false);
}

// yes all thes flashSomethings() couldve been done as one function like I did in training4
//------------------------------------------------------------------------------
function flashEnergy()
{
   %time = 1000;
   %num = 6;
   for(%i=0; %i<%num; %i++)
   {
      if (!isPureServer())
      {
         schedule(%time*%i, $player.player, "eval", "energyHud.setVisible(false);" );
         schedule(%time*%i + %time/2, $player.player, "eval", "energyHud.setVisible(true);" );
      }
      else
      {
         schedule(%time*%i, $player.player, toggleEnergyHudVis, false);
         schedule(%time*%i + %time/2, $player.player, toggleEnergyHudVis, true);
      }
      $player.schedule(%time*%i, "play2d", HudFlashSound);
   }
}

function toggleEnergyHudVis(%value)
{
   energyHud.setVisible(%value);
}

//------------------------------------------------------------------------------
function flashHealth()
{
   %time = 900;
   %num = 5;
   for(%i=0; %i<%num; %i++)
   {
      if (!isPureServer())
      {
         schedule( %time*%i, $player.player, "eval", "damageHud.setVisible(false);");
         schedule(%time*%i + %time/2, $player.player, "eval", "damageHud.setVisible(true);");
      }
      else
      {
         schedule( %time*%i, $player.player, toggleDamageHudVis, false);
         schedule(%time*%i + %time/2, $player.player, toggleDamageHudVis, true);
      }
      $player.schedule(%time*%i, "play2d", HudFlashSound);
   }
}

function toggleDamageHudVis(%value)
{
   damageHud.setVisible(%value);
}

//------------------------------------------------------------------------------
function flashWeapon(%slot)
{
   schedule(300, $player.player, use, $WeaponNames[%slot]);
   %time = 1000;
   %num = 6;
   for(%i=0; %i<%num; %i++)
   {
      if (!isPureServer())
      {
         schedule(%time*%i, $player.player, "eval", "weaponsHud.setActiveWeapon(-1);");
         schedule(%time*%i + %time/2, $player.player, "eval", "weaponsHud.setActiveWeapon("@%slot@");");
      }
      else
      {
         schedule(%time*%i, $player.player, toggleWeaponSlot, -1);
         schedule(%time*%i + %time/2, $player.player, toggleWeaponSlot, %slot);
      }
      $player.schedule(%time*%i, "play2d", HudFlashSound);
   }
}

function toggleWeaponSlot(%slot)
{
   weaponsHud.setActiveWeapon(%slot);
}

//------------------------------------------------------------------------------
function flashWeaponsHud()
{
   %time = 1000;
   %num = 6;
   for(%i=0; %i<%num; %i++)
   {
      if (!isPureServer())
      {
         schedule( %time*%i, $player.player, "eval", "weaponsHud.setVisible(false);");
         schedule(%time*%i + %time/2, $player.player, "eval", "weaponsHud.setVisible(true);");
      }
      else
      {
         schedule( %time*%i, $player.player, toggleWeaponHudVis, false);
         schedule(%time*%i + %time/2, $player.player, toggleWeaponHudVis, true);
      }
      $player.schedule(%time*%i, "play2d", HudFlashSound);
   }
}

function toggleWeaponHudVis(%value)
{
   weaponsHud.setVisible(%value);
}

//------------------------------------------------------------------------------
function flashCompass()
{
   %time = 900;
   %num = 5;
   for(%i=0; %i<%num; %i++)
   {
      if (!isPureServer())
      {
         schedule(%time*%i, $player.player, "eval", "HudCompassBack.setVisible(false);");
         schedule(%time*%i, $player.player, "eval", "compass.setVisible(false);");

         schedule(%time*%i + %time/2, $player.player, "eval", "HudCompassBack.setVisible(true);");
         schedule(%time*%i + %time/2, $player.player, "eval", "compass.setVisible(true);");
      }
      else
      {
         schedule(%time*%i, $player.player, toggleCompassVis, false);
         schedule(%time*%i + %time/2, $player.player, toggleCompassVis, true);
      }
      $player.schedule(%time*%i, "play2d", HudFlashSound);
   }
}

function toggleCompassVis(%value)
{
   HudCompassBack.setVisible(%value);
   compass.setVisible(%value);
}

//------------------------------------------------------------------------------
function flashInventory()
{
   %time = 1000;
   %num = 6;
   for(%i=0; %i<%num; %i++)
   {
      if (!isPureServer())
      {
         schedule(%time*%i, $player.player, "eval", "inventoryHud.setVisible(false);");
         schedule(%time*%i + %time/2, $player.player, "eval", "inventoryHud.setVisible(true);");
      }
      else
      {
         schedule(%time*%i, $player.player, toggleInvVis, false);
         schedule(%time*%i + %time/2, $player.player, toggleInvVis, true);
      }
      $player.schedule(%time*%i, "play2d", HudFlashSound);
   }
}

function toggleInvVis(%value)
{
   inventoryHud.setVisible(%value);
}

//------------------------------------------------------------------------------
function flashPack()
{
   %time = 1000;
   %num = 6;
   for(%i=0; %i<%num; %i++)
   {
      if (!isPureServer())
      {
         schedule(%time*%i, $player.player, "eval", "backPackFrame.setVisible(false);");
         schedule(%time*%i + %time/2, $player.player, "eval", "backPackFrame.setVisible(true);");
      }
      else
      {
         schedule(%time*%i, $player.player, togglePackVis, false);
         schedule(%time*%i + %time/2, $player.player, togglePackVis, true);
      }
      $player.schedule(%time*%i, "play2d", HudFlashSound);
   }
}

function togglePackVis(%value)
{
   backPackFrame.setVisible(%value);
}

//------------------------------------------------------------------------------
function flashSensor()
{
   %time = 1000;
   %num = 6;
   for(%i=0; %i<%num; %i++)
   {
      if (!isPureServer())
      {
         schedule(%time*%i, $player.player, "eval", "sensorHudBack.setVisible(false);");
         schedule(%time*%i + %time/2, $player.player, "eval", "sensorHudBack.setVisible(true);");
      }
      else
      {
         schedule(%time*%i, $player.player, toggleSensorVis, false);
         schedule(%time*%i + %time/2, $player.player, toggleSensorVis, true);
      }
      $player.schedule(%time*%i, "play2d", HudFlashSound);
   }
}

function toggleSensorVis(%value)
{
   sensorHudBack.setVisible(%value);
}

//------------------------------------------------------------------------------
function flashMessage()
{
   %time = 1000;
   %num = 6;
   for(%i=0; %i<%num; %i++)
   {
      if (!isPureServer())
      {
         schedule(%time*%i, $player.player, "eval", "outerChatHud.setVisible(false);");
         schedule(%time*%i + %time/2, $player.player, "eval", "outerChatHud.setVisible(true);");
      }
      else
      {
         schedule(%time*%i, $player.player, toggleMessageVis, false);
         schedule(%time*%i + %time/2, $player.player, toggleMessageVis, true);
      }
      $player.schedule(%time*%i, "play2d", HudFlashSound);
   }
}

function toggleMessageVis(%value)
{
   outerChatHud.setVisible(%value);
}

//------------------------------------------------------------------------------
function flashObjective()
{
   %time = 1000;
   %num = 6;
   for(%i=0; %i<%num; %i++)
   {
      if (!isPureServer())
      {
         schedule(%time*%i, $player.player, "eval", "objectiveHud.setVisible(false);");
         schedule(%time*%i + %time/2, $player.player, "eval", "objectiveHud.setVisible(true);");
      }
      else
      {
         schedule(%time*%i, $player.player, toggleObjectiveHudVis, false);
         schedule(%time*%i + %time/2, $player.player, toggleObjectiveHudVis, true);
      }
      $player.schedule(%time*%i, "play2d", HudFlashSound);
   }
}

function toggleObjectiveHudVis(%value)
{
   objectiveHud.setVisible(%value);
}

//------------------------------------------------------------------------------
// function playCinematicSound(%sound)
// {
// 	switch$(%sound)
// 	{
// 	case "MissileLock":
// 		%file = "fx/weapons/missile_launcher_lock.wav";
// 		%looping = true;
// 	
// 	case "Heartbeat":
// 		%file = "fx/misc/heartbeat.wav";
// 		%looping = false;
// 	}
// 
// 	%audiosound = new AudioEmitter() {
// 		filename = %flie;
// 		position = $player.player;
// 		volume = "1";
// 		isLooping = %looping;
// 		is3D = false;
// 		type = "EffectAudioType";
// 	};
// 	$player.currentSound = %audiosound;
// }
// 
// function playCinematicMissileLockSound()
// {
//    %audiosound = new AudioEmitter() {
//       filename = "fx/weapons/missile_launcher_lock.wav";
//       position = $player.player;
//       volume = "1";
//       isLooping = "1";
//       is3D = false;
//       type = "EffectAudioType";
//    };
//    $player.missileSound = %audiosound;
// }


//------------------------------------------------------------------------------
function setTeammatesCMapInvisible(%on)
{
   %arg = (%on ? 0xffffffff : 0);
   setTargetNeverVisMask(nameToId(MPB).getTarget(), %arg);
   setTargetNeverVisMask($teammate0.player.getTarget(), %arg);
   setTargetNeverVisMask($teammate1.player.getTarget(), %arg);
}


// Im gonna do a pseudo-cinematic here so bear with me
//------------------------------------------------------------------------------
function beginTraining1Intro()
{
   //error("beginning training intro.....wait for it.......now!");
   //messageClient($player, 0, $player.miscMsg[skip]);
   //moveMap.bindCmd( keyboard, "backspace", "", "skipIntroCinematic();" );

   //block the voice chat
   if (isObject(training1BlockMap))
      training1BlockMap.delete();
   new ActionMap(training1BlockMap);
   training1BlockMap.blockBind(moveMap, toggleMessageHud);
   training1BlockMap.blockBind(moveMap, TeamMessageHud);
   training1BlockMap.blockBind(moveMap, activateChatMenuHud);
   training1BlockMap.push();

   //set the intro started bools
   $Camera::movementSpeed = 0;
	$AIDisableChatResponse = true;
   game.playedIntro = true;
   game.trainingIntro = true;

   //create the bomber
   %introFlyerObject = nameToId(introFlyerDP);

   $player.flyer = new FlyingVehicle(Flyer) {
      position = %introFlyerObject.position;
      rotation = %introFlyerObject.rotation;
      scale = "1 1 1";
      dataBlock = "BomberFlyer";
   };

   // create, spawn, set the skin, and equip the pilot
   //------------------------------------------------------------
   %pilot = aiConnect(game.pilotName,$playerTeam, 0, 0, "Male1", 1.0);
   $player.flyer.pilot = %pilot;
   

   setTargetSkin(%pilot.target, $teamSkin[$playerTeam]);
   %pilot.player.setArmor(light);
   
   //mount the pilot
	%pilot.pilotVehicle = false;
   //%pilot.stepMove($player.flyer.position, 0.25, 4);
   $player.flyer.mountObject(%pilot.player, 0);
	%pilot.setControlObject($player.flyer);
   %pilot.setPilotPitchRange(-0.2, 0.05, 0.05);

   // create and mount the bomber
   //------------------------------------------------------------
   %bombardier = aiConnect(game.bombardierName, $playerTeam, 0, 0, "Male2", 1.0);

   $player.flyer.bombardier = %bombardier;
   setTargetSkin(%bombardier.target, $teamSkin[$playerTeam]);
   %bombardier.player.setArmor(Medium);   //not that you can tell
 
   //mount the bombardier
   //%bombardier.stepMove($player.flyer.position, 0.25, 4);
   $player.flyer.mountObject(%bombardier.player, 1);

   // and put the player in the tailgunners seat
   //------------------------------------------------------------
   //it would be nice if the player was facing the same direction as the bomber to start
   $player.player.use(Blaster); 
   $player.flyer.mountObject($player.player, 2);
   $player.player.setTransform($player.player.position SPC %introFlyerObject.rotation);

   // and set the camera to third person
   if($firstperson)
      toggleFirstPerson($player);

   $player.player.invincible = true;

   getTrainingPacifistMap();
   trainingPacifistMap.push();

   // add enemyMissile Laucher Dude
   %MLDude = aiConnect("Oksana Baiul", $enemyTeam);
   $missileLauncherDude = %MLDude;
   %MLDude.player.scopeToClient($player);
   
   %MLDude.player.setTransform(nameToID(MissileGuySpot).getTransform());
   %MLDude.race = "Bioderm";
   %MLDude.voice = "Derm2";
   setTargetSkin(%MLDude.target, $teamSkin[$enemyTeam]);
   %MLDude.equipment = 2; 
   game.equip(%MLDude.player);
   %MLDude.player.setArmor(%MLDude.armor);

   // then start the flyers move sequence
   %pilot.addTask(AITraining1Pilot);

   //fade up from black
   $Training1Blackout = ServerConnection.schedule(3000, setBlackOut, false, 4000);
}

//------------------------------------------------------------------------------


//------------------------------------------------------------------------------
function trainingIntroFlightEnd()
{
   //enable the voice chat menu again...
   if (isObject(training1BlockMap))
   {
      training1BlockMap.pop();
      training1BlockMap.delete();
   }

   //put the player back in his body, give him control back,
   //a little dramatic flash, start the rest of the mission
   $Camera::movementSpeed = 40;
	$AIDisableChatResponse = "";
   game.trainingIntro = false;
   $player.player.invincible = false;
   $player.player.setDamageLevel(0.3);
   serverConnection.setBlackout(false, 5000);
   $player.player.setActionThread(cel1);
   $player.player.schedule(2000, use, Disc);
   trainingPacifistMap.pop();
   
   commandToClient($player, 'toggleDashHud');
   if(isObject($player.flyer))
      cleanUpFlyer();

   if(!$firstPerson)
      toggleFirstPerson($player);

   $player.player.setMoveState( false );
   $player.player.setVelocity("0 0 0");
   $player.player.setTransform(nameToId(DP).getTransform());
   moveMap.push();
   //$player.player.setDamageLevel(0.3);
   $player.T1OpeningSpielSchedule = schedule(10000, game, openingspiel);
   objectiveDistanceChecks();
   
   //moveMap.bindCmd( keyboard, "backspace", "", "skipFlashingHud();" );

   //re-enable the use of the settings button...
   SinglePlayerEscSettingsBtn.setActive(1);
} 

//------------------------------------------------------------------------------
function ClientCmdSetHudMode(%mode, %type, %node)
{
   parent::ClientCmdSetHudMode(%mode, %type, %node);
   getTrainingPacifistMap();
   if(game.trainingIntro)
      trainingPacifistMap.push();
}

//------------------------------------------------------------------------------
function PlayGui::onWake(%this)
{
   parent::onWake(%this);
   //error("Waking training play gui");
   // okay we know the victim...erm...player is looking
   // and we hope they have a body so lets do this
   if(!game.playedIntro) {
      game.PlayGuiAwake = true;
      checkForTraining1Intro();
   }
   
}

function checkForTraining1Intro()
{
   if(game.playGuiAwake && $player.player && $currentMission $= "Training1")
      beginTraining1Intro();
   else
   {
      schedule(50, game, checkForTraining1Intro);   
   }
}

//------------------------------------------------------------------------------
function Armor::AIonMount(%this, %obj, %vehicle, %node)
{
}

function Armor::AIonUnMount(%this, %obj, %vehicle, %node)
{
}

function AITraining1Pilot::assume(%task, %client)
{
   %task.setWeightFreq(30);
   %task.setMonitorFreq(10);


//    //next, start the pilot on his way to mounting the vehicle
//    %client.pilotVehicle = true;
//    %client.stepMove($player.flyer.position, 0.25, $AIModeMountVehicle);
}

function AITraining1Pilot::weight(%task, %client)
{
   %task.setWeight(10000);
}

function AITraining1Pilot::monitor(%task, %client)
{
   //messageall(0, " AITraining1Pilot::monitor "@%task.locationIndex);
   %group = nameToId(FlightPath);
   if(!%task.locationIndex)
      %task.locationIndex = 0;

   //HACK ALERT!!!
   //since the path for this mission is completely straight, always head for the end of the path
   //%location = %group.getObject(%task.locationIndex);
   %location = %group.getObject(%group.getCount() - 1);

   //see if we've mounted yet
   if(%client.vehicleMounted)
   {
      %client.setPilotDestination(%location.position);

      //else see if we're close enough to the current destination to choose the next
      %pos = %client.vehicleMounted.position;
      %pos2D = getWord(%pos, 0) SPC getWord(%pos, 1) SPC "0";
      %dest =  %group.getObject(%task.locationIndex).position;
      %dest2D = getWord(%dest, 0) SPC getWord(%dest, 1) SPC "0";

      if (VectorDist(%dest2D, %pos2D) < 20)
      {
         if(%group.getCount() > %task.locationIndex + 1) {
            %task.locationIndex++;
            cinematicEvent(%task.locationIndex);
         }
         //else messageAll(0, "Ride Over");
      }
   }
   else
      %client.stepMove($player.flyer.position, 0.25, $AIModeExpress);
}

function cinematicEvent(%num)
{
   //messageAll(0, "Doing Cinematic Event: "@%num);
   switch(%num)
   {
      case 1:
         doText(any_Warning02);
      
      case 2:
         if(!$firstPerson)
            toggleFirstPerson($player);
         movemap.schedule(6000, "pop");
      
      case 3:
         moveMap.pop();
		//error(nameToId(MissileCamera));
         $player.camera.setTransform(nameToId(MissileCamera).getTransform());
         commandToClient($player, 'toggleDashHud', false);
         cancel($player.altCheck);
         cancel($player.speedCheck);
         HideHudHack(false);
         toggleCamera(true);
         $MissileLauncherDude.player.use(MissileLauncher);
               
      case 4:
         ShoulderMissile.lifeTimeMs = 10000;
         $MissileLauncherAimTime = 600;
         MissileDudeAimAtTarget($missileLauncherDude, 0);
         schedule($MissileLauncherAimTime, 0, "MissileDudeFireMissile", $missileLauncherDude);
      
      case 7:
         if(game.gotMissile)
            turnPlayerToObject(game.gotMissile);
         else
            turnPlayerToObject($missileLauncherDude.player);
            
         toggleCamera(true);
         moveMap.push();
         TrainingPacifistMap.push();
         hideHudHack(true);
         // playCinematicSound("MissileLock");
         schedule(5700, 0, forcedCinematicPlayerDismount);
         schedule( 6100, game, cleanUpFlyer);
         //schedule( 8000, game, trainingIntroFlightEnd);
   }
}

function forcedCinematicPlayerDismount()
{
   $player.player.mountVehicle = false;
	$player.player.unmount();
	%velocity = $player.player.getVelocity();
	%velX = getWord(%velocity, 0);
	%velY = getWord(%velocity, 1);
	$player.player.setVelocity(%velX SPC %velY SPC "20");
   $player.player.setMoveState( true );
	$player.player.schedule(300, setDamageFlash, 0.3);
   playTargetAudio( $player.target, 'avo.deathCry_01', AudioClose3d, false );
   $player.player.setActionThread(Death1, true);
   //$player.flyer.pilot.player.setActionThread(Death10, true);
   //$player.flyer.bombardier.player.setActionThread(Death11, true);

	if($firstPerson)
		toggleFirstPerson($player);
	
   LightMaleHumanArmor.minImpactSpeed = 10000;
   trainingPlayerHitGround();
   Game.playGrunt = true;
	//game.expectingImpact = true;
}

function MissileDudeAimAtTarget(%client, %percent)
{
   %group = nameToId(FlightPath);
   %endPos = %group.getObject(4).position;

   //calculate the start position
   %startTransform = nameToId(MissileGuySpot).getTransform();
	%startDirection = MatrixMulVector("0 0 0 " @ getWords(%startTransform, 3, 6), "0 1 0");
	%startDirection = VectorNormalize(%startDirection);
   %startPos = VectorAdd(getWords(%startTransform, 0, 2), VectorScale(%startDirection, 100));

   //now calculate the aim position
   %vec = VectorSub(%endPos, %startPos);
   %length = VectorDist(%endPos, %startPos);
   %vec = VectorNormalize(%vec);
   %aimPos = VectorAdd(%startPos, VectorScale(%vec, %percent * %length));

   //now aim the client there
   %client.aimAt(%aimPos, 2000);

   //schedule the next aim
   if (%percent <= 0.9)
      schedule($MissileLauncherAimTime / 10, 0, MissileDudeAimAtTarget, %client, %percent + 0.1);
}

function MissileDudeFireMissile(%Client)
{
   %client.stop();
   %client.clearStep();
   %client.setEngageTarget(-1);
   %client.setTargetObject($player.flyer, 300, "Missile");
     
   if (isDemo())
      %wav = "fx/misc/derm2.woohoo.WAV";
   else
      %wav = "voice/derm2/gbl.woohoo.WAV";
   %audio = alxCreateSource( AudioChat, %wav );
   alxPlay( %audio );

   
   schedule(4000, 0, cinematicEvent, 7); 
}

function turnPlayerToObject(%obj)
{
   error("turningPlayerToObject: "@%obj); 
   %vec = VectorSub($player.player.position, %obj.position);
   %angle = mATan( getWord(%vec, 0), getWord(%vec, 1) );
   %angle = %angle + 3.141529;
   %newTransform = $player.player.position SPC "0 0 1" SPC %angle;
   $player.player.setTransform(%newTransform);
}

function cleanUpFlyer()
{
   $player.flyer.applyDamage($player.Flyer.getDataBlock().maxDamage);   
   $player.currentSound.delete();
   $player.flyer.pilot.schedule(400, drop);
   $player.flyer.bombardier.schedule(1400, drop);
   $missileLauncherDude.drop();
}

function training1Preloads()
{
   navGraph.preload("skins/base.lbioderm", true);
   navGraph.preload("skins/Horde.lbioderm", false);
   navGraph.preload("skins/sensor_pulse_large", true);
   navGraph.preload("skins/base.hmale", true);
   navGraph.preload("skins/beagle.hmale", false);
   navGraph.preload("skins/base.mmale", true);
   navGraph.preload("skins/beagle.mmale", false);
   navGraph.preload("skins/base.lmale", false);
   navGraph.preload("skins/swolf.mmale", false);
   navGraph.preload("skins/beagle.lmale", false);
}

function MissileLauncherImage::onFire(%data,%obj,%slot)
{
   %p = Parent::onFire(%data, %obj, %slot);
   if(!game.gotMissile)
      game.gotMissile = %p;
}

function SinglePlayerGame::missionLoadDone(%game)
{                                                      
   Parent::missionLoadDone(%game);
   training1Preloads();
}

function getTrainingPacifistMap()
{
   new ActionMap(TrainingPacifistMap);
   // keys to rebind:
   // jump, fire, suicide, jet
   TrainingPacifistMap.blockBind( moveMap, jump );
   TrainingPacifistMap.blockBind( moveMap, mouseFire );
   TrainingPacifistMap.blockBind( moveMap, suicide );
   TrainingPacifistMap.blockBind( moveMap, mouseJet );

   //TrainingPacifistMap.push();
}

// function Armor::onImpact(%data, %playerObject, %collidedObject, %vec, %vecLen)
// {
// 	error("ArmorOnImpact Called");
// 	echo(%playerObject);
// 	if(%playerObject == $player.player && game.expectingImpact) {
// 		game.expectingImpact = false;
// 		messageClient($player, 'MsgTrainingHitGround', "");
// 	}
// }

function trainingPlayerHitGround()
{
   //see if we're about to hit the ground
   //%mask = $TypeMasks::StaticShapeObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::TerrainObjectType; 
   %mask = $TypeMasks::StaticShapeObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::TerrainObjectType; 
   %rayStart = $Player.player.getWorldBoxCenter();
   %rayEnd = getWord(%rayStart, 0) SPC getWord(%rayStart, 1) SPC getWord(%rayStart, 2) - 20;
   %foundObject = ContainerRayCast(%rayStart, %rayEnd, %mask, 0);
   if (!%foundObject)
   {
      $Training1HitGround = schedule(1, $player.player, trainingPlayerHitGround);
      return;
   }

   //play the grunt...
   if (Game.playGrunt)
   {
      Game.playGrunt = false;
      playTargetAudio($player.target, 'avo.grunt', AudioClose3d, false);
   }

   //make sure we hit within 8 to do the rest
   if (VectorDist(getWords(%foundObject, 1, 3), %rayStart) > 8)
   {
      $Training1HitGround = schedule(1, $player.player, trainingPlayerHitGround);
      return;
   }

   $player.player.mountVehicle = true;
	$player.player.setDamageFlash(0.5);
   serverConnection.setBlackout(true, 600);	
   %heartBeatLengthMS = alxGetWaveLen("fx/misc/heartbeat.wav");
   schedule(1000, Game, alxPlay, HeartBeatSound, 0, 0, 0);
	schedule(%heartBeatLengthMS, Game, trainingIntroFlightEnd);
} 

function SinglePlayerGame::displayDeathMessages(%game, %clVictim, %clKiller, %damageType, %implement)
{
	if(game.trainingIntro)
		return;
	else Parent::displayDeathMessages(%game, %clVictim, %clKiller, %damageType, %implement);
}


function serverCmdBuildClientTask(%client, %task, %team)
{
	// player shouldnt be able to use the voice commands to do anything
}

function SinglePlayerEscapeDlg::returnToGame( %this )
{
	parent::returnToGame( %this );
	if(game.trainingIntro)
		trainingPacifistMap.push();
}

//END TRAINING1 PACKAGE=======================================================================
};

