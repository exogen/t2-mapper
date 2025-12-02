//In this file you will find many but not all of the ai vehicle functions.
//The default vehicle functions are in ai.cs.

//------------------------------------------------------------------------------
//ai find closest enemy vehicle - Lagg... 10-8-2003
//------------------------------------------------------------------------------
function aiFindClosestEnemyVehicle(%client)
{
   //get some vars
   %player = %client.player;
   if (!isObject(%player))
      return -1 @ " " @ 32767;

   if (! AIClientIsAlive(%client))
      return -1 @ " " @ 32767;

   %closestVehicle = -1;
   %closestDist = 32767;
   %vehicleCount = $AIVehicleSet.getCount();
   for (%i = 0; %i < %vehicleCount; %i++)
   {
      if (%vehicleCount > 0)
      {
         %vehicle = $AIVehicleSet.getObject(%i);
         if(%vehicle.getDamageState() !$= "Destroyed")
         {
            %enOnBoard = false;
            for (%m = 0; %m < %vehicle.getDataBlock().numMountPoints; %m++)
            {
               %mount = %vehicle.getMountNodeObject(%m);
               if (isObject(%mount) && %mount.team != %client.team)
               {
                  //echo("aiFindClosestEnemyVehicle - we got an enemy on board");
                  %enOnBoard = true;
               }
               //else
                  //%enOnBoard = false;
            }
            
            if (%vehicle.team != %client.team || %enOnBoard)
            {
               %vehiclePos = %vehicle.getWorldBoxCenter();
               %clPos = %player.getWorldBoxCenter();

               //check for LOS (kinda)
               %mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::TSStaticShapeObjectType;
               %vehicleLOS = !containerRayCast(%clPos, %vehiclePos, %mask, 0);

               //see if the vehicle is the closest...
               %vehicleDist = VectorDist(%vehiclePos, %clPos);
               if (%vehicleDist < %closestDist && %vehicleLOS)
               {
                  %closestVehicle = %vehicle;
                  %closestDist = %vehicleDist;
               }
            }     
         }
      }
   }
   //give em what you got
   return %closestVehicle @ " " @ %closestDist;
}

//------------------------------------------------------------------------------
// ai Buy Vehicle - Lagg... 8-19-2003
//------------------------------------------------------------------------------

function aiBuyVehicle(%vehicleType, %client)
{
   //get some vars
   %player = %client.player;
   if (!isObject(%player))
      return "Failed";

   if (! AIClientIsAlive(%client))
      return "Failed";

   if (%player.getArmorSize() $= "Heavy" || (%vehicleType $= "ScoutVehicle" && %player.getArmorSize !$= "Light"))
      return "Failed";

   %team = %client.team;

   //get the closest enabled vehicle station
   %result = AIFindClosestVStation(%client);

   %closestVs = getWord(%result, 0);
   %closestDist = getWord(%result, 1);

   //if no vpad then get out
   if (%closestVs <= 0)
      return "Failed";

   //check how many vehicles of this type are in the field if we didn't buy already
   //if (!vehicleCheck(%vehicleType, %client.team))// && !%client.pilotVehicle)
   if (!vehicleCheck(%vehicleType, %client.team) && !%client.player.lastVehicle)
   {
      //error("aiBuyVehicle - no vehicles left :)");
      return "Failed";
   }

   //at this point we have located the vehicle station
   if (%closestVs.isPowered())//is powered - thanks ZOD
   {
      if (!%closestVs.isDisabled())//not blown up - thanks ZOD
      {
         //use the Y-axis of the rotation as the desired direction of approach,
         //and calculate a walk to point 1m in front of the trigger point - Lagg...
 
         %aprchDirection = MatrixMulVector("0 0 0 " @ getWords(%closestVs.getTransform(), 3, 6), "0 1 0");
         %aprchDirection = VectorNormalize(%aprchDirection);
            
         //make sure the vehicle station is not blocked
         %vsLoc = %closestVs.getWorldBoxCenter();
         InitContainerRadiusSearch(%vsLoc, 1.5, $TypeMasks::PlayerObjectType);
         %objSrch = containerSearchNext();
         if (%objSrch == %client.player)
            %objSrch = containerSearchNext();

         //is the pad blocked? don't look for players here. just blow them up :)
         %position = %closestVs.pad.position;
         InitContainerRadiusSearch(%position, 20, $TypeMasks::VehicleObjectType);
         %posSrch = containerSearchNext();

         //did we find some something?
         if (%posSrch > 0)
         {
            //did someone forget their vehicle?
            %vehicle = %posSrch.getDataBlock();
            %pilot = %posSrch.getMountNodeObject(0);
            if (%posSrch.lastPilot != %client.player && !%pilot && !%posSrch.inStation) 
               %posSrch = -1;//just continue and buy a vehicle
            
            //we must be mounted so go
            else
            {
               if (%player.isMounted())
               {
                  %client.needVehicle = false;
                  return "Finished";
               }
            }
         }
            
         //if the closest vehicle station is busy...
         //if ((%objSrch > 0) || (%posSrch > 0))
         if (%objSrch > 0)
         {
            //have the AI range the vehicle station
	      //if (%closestVs > 0 && %posSrch.lastPilot != %client.player)
            if (vectorDist(%client.player.getWorldBoxCenter(), %closestVs.getWorldBoxCenter()) > 8)
               %client.stepRangeObject(%closestVs, "DefaultRepairBeam", 3, 6);
	    //vehicle station is still busy - see if we're within range
	      else if (vectorDist(%client.player.getWorldBoxCenter(), %closestVs.getWorldBoxCenter()) < 12)
	      {
            
	       //initialize the wait time
	       if (%client.vsWaitTime $= "")
                  %client.vsWaitTime = getSimTime() + 6000 + (getRandom() * 1000);

	       //else see if we've waited long enough and set an itchy reaction
               else if (getSimTime() > %client.vsWaitTime && %objSrch > 0)
	       {
                  schedule(250, %client, "AIPlayAnimSound", %client, %objSrch.getWorldBoxCenter(), "vqk.move", -1, -1, 0);
	          %client.vsWaitTime = getSimTime() + 6000 + (getRandom() * 1000);
                  %client.setDangerLocation(%client.player.getWorldBoxCenter(), 10);
	       }
	     }
         }

         //else if we've triggered the vs then buy vehicle, and wait till we are mounted
         else if (%client.needVehicle && isObject(%closestVs.trigger) &&
           VectorDist(%closestVs.trigger.getWorldBoxCenter(), %player.getWorldBoxCenter()) < 1.5)
         {
            //first stop...
	    %client.stop();

            //look in awe
            %client.aimAt(%closestVs.pad.getWorldBoxCenter(), 2500);

            //initialize the wait time
	    if (%client.vsWaitTime $= "")
               %client.vsWaitTime = getSimTime() + 5000;

	    //wait a few sec before trying to buy
            else if (getSimTime() > %client.vsWaitTime)
	    {
               //buy vehicle
               %client.pilotVehicle = true;//needed to allow ai to get in pilot seat
               schedule(1500, 0, "serverCmdBuyVehicle", %client, %vehicleType);
               //%client.needVehicle = false;

               //jump on VPad every fifteen sec to reset the vehicle hud
	       %client.vsWaitTime = getSimTime() + 15000;
               %client.pressJump();
	    }

            //throw away any packs that won't fit
	    if (%client.player.getInventory(InventoryDeployable) > 0)
	       %client.player.throwPack();
	    else if (%client.player.getInventory(TurretIndoorDeployable) > 0)
	       %client.player.throwPack();
	    else if (%client.player.getInventory(TurretOutdoorDeployable) > 0)
	       %client.player.throwPack();
            
            return "InProgress";
         }

         //else, keep moving towards the inv station
         else
         {
            if (isObject(%closestVs) && isObject(%closestVs.trigger))
	    {
               %factor = 1; //1m in front of station vehicle is the right spot to stand                        
               %aprchFromLocation = VectorAdd(%vsLoc,VectorScale(%aprchDirection, %factor));
               %client.stepMove(%aprchFromLocation);
            }
	    return "InProgress";
         }
      }
      else
         return "Failed";
   }
   else
      return "Failed";     
}

//------------------------------------------------------------------------------
// Find closest Vehicle station - Lagg... 8-19-2003
//------------------------------------------------------------------------------

//this function will return the closest vehicle station and the distance - Lagg... 8-25-2003

function AIFindClosestVStation(%client)
{
   %closestVStation = -1;
   %closestDist = 32767;
     
   // lets find the closest Vpad that is powered and enabled and not enemy owned
   %vsCount = $AIVehiclePadSet.getCount();
   for (%i = 0; %i < %vsCount; %i++)
   {
      if (%vsCount > 0)
      {
         %VStation = $AIVehiclePadSet.getObject(%i);
         if (%VStation.team <= 0 || %VStation.team == %client.team)
         {
            //make sure the station is not destroyed - ZOD
            if (!%VStation.isDisabled())
            {
               //make sure the station is getting power - ZOD
               if (%VStation.isPowered())
               {
                  %dist = %client.getPathDistance(%VStation.getTransform());
                  if (%dist > 0 && %dist < %closestDist)
                  {
                     %closestVStation = %VStation;
                     %closestDist = %dist;
                  }
               }
            }
         }
      }
      else
         error("VStation count = 0");
   }

   //give em what you got
   return %closestVStation @ " " @ %closestDist;
}

//------------------------------------------------------------------------------
// AI Find deployed MPB - Lagg... 9-30-2003
//------------------------------------------------------------------------------

//this function will return the closest team deployed MPB and the distance - Lagg... 8-30-2003
//called from aiObjectives.cs

function AIFindDeployedMPB(%client)
{
   //first look for vehicles
   %closestVeh = -1;
   %closestDist = 32767;
   %vehCount = $AIVehicleSet.getCount();
   for (%i = 0; %i < %vehCount; %i++)
   {
      if (%vehCount > 0)
      {
         %Vehicle = $AIVehicleSet.getObject(%i);
         if (!%vehicle.respawn)
         {
            if (%Vehicle.team == %client.team)
            {
               if (%vehicle.getDataBlock().getName() $= "mobileBaseVehicle")
               {
                  if (%vehicle.fullyDeployed)
                  {
                     if (%vehicle.getDamageState() !$= "Destroyed")
                     {
                        %dist = %client.getPathDistance(%vehicle.getTransform());
                        if (%dist > 0 && %dist < %closestDist)
                        {
                           %closestVeh = %vehicle;
                           %closestDist = %dist;
                        }
                     }
                  }
               }
            }
         }
      }
   }

   //give em what you got
   return %closestVeh @ " " @ %closestDist;
}

//------------------------------------------------------------------------------
// Sweep For Teleporters - Lagg... 9-30-2003
//------------------------------------------------------------------------------

//this function will find the closest team enabled teleport - Lagg... 9-30-2003
//note this will only work for mpb teleporter, a more advanced technique will
//be needed for bots to use local teleporters. Called from aiObjectives.cs

function SweepForTeleporters(%client)
{
   %closestTel = -1;
   %closestDist = 32767;
   %telCount = $AITeleportSet.getCount();//new set added in aiOR.cs
   for (%i = 0; %i < %telCount; %i++)
   {
      if (%telCount > 0)
      {
         %teleport = $AITeleportSet.getObject(%i);
         if (%teleport.team == %client.team)
         {          
            //make sure the teleporter is not destroyed - ZOD
            if (!%teleport.isDisabled())
            {
               //make sure the teleporter is getting power - ZOD
               if (%teleport.isPowered())
               {
                  %dist = %client.getPathDistance(%teleport.getTransform());
                  if (%dist > 0 && %dist < %closestDist)
                  {
                     %closestTeh = %teleport;
                     %closestDist = %dist;
                  }
               }
            }
         }
      }
   }
   //give em what you got
   return %closestTeh @ " " @ %closestDist;
}

//--------------------------------------------------- assume telporter - start -
function MPBTeleporterCheck(%client, %task)
{
   //if the MPB Teleporter is online - Lagg... 9-30-2003

   //first check for deployed MPB
   %result = AIFindDeployedMPB(%client);//new function in aiVehicle.cs
   %closestMPB = getWord(%result, 0);
   %closestMPBDist = getWord(%result, 1);
      
   //next find the teleporter
   %result = SweepForTeleporters(%client);//new function in aiVehicle.cs
   %closestTel = getWord(%result, 0);
   %closestTelDist = getWord(%result, 1);
      
   //now check for what would be closer - Lagg... 10-1-2003
   if (%closestMPB > 0 && %closestTel > 0)
   {
      %disToTarg = %client.getPathDistance(%task.location);
      %mpbDisToTarg = vectorDist(%closestMPB.getTransform(), %task.location);
      if (%closestTelDist < %closestMPBDist && %closestMPBDist < %disToTarg && %mpbDisToTarg < %disToTarg)
         %useTeleport = true;//new - Lagg... 10-1-2003
      else
         %useTeleport = false;             
   }
   //--------------------------------------------------- assume telporter - end -
   return %useTeleport;
}

function addVPadObjective(%object)
{
   if (Game.class $= "SiegeGame")
      Game.defenseTeam = Game.offenseTeam == 1 ? 2 : 1;
   else
      %homeTeam = %object.team;

   if(%homeTeam == 1)
      %enemyTeam = 2;
   else
      %enemyTeam = 1;

   //create the repair objective
   %repairVPad = new AIObjective(AIORepairObject)
   {
      dataBlock = "AIObjectiveMarker";
      weightLevel1 = $AIWeightRepairTurret[1];
      weightLevel2 = $AIWeightRepairTurret[2];
      description = "Repair the " @ %object.getDataBlock().getName();
      targetObject = %object.getDataBlock().getName();
      targetObjectId = %object;
      targetClientId = -1;
      defense = true;
      equipment = "RepairPack";
      buyEquipmentSet = "MediumRepairSet";
      location = %object.getWorldBoxCenter();
      position = %object.getWorldBoxCenter();
   };
   if (Game.class $= "SiegeGame")
   {
      if (%object.team == Game.defenseTeam || 0)
         $ObjectiveQ[Game.defenseTeam].add(%repairVPad);
      else if (%object.team == Game.offenseTeam || 0)
         $ObjectiveQ[Game.offenseTeam].add(%repairVPad);
   }
   else
      $ObjectiveQ[%homeTeam].add(%repairVPad);

   MissionCleanup.add(%repairVPad); // Regardless this has to be added to cleanup - ZOD

   //create the mortar objective
   %mortarVPad = new AIObjective(AIOMortarObject)
   {
      dataBlock = "AIObjectiveMarker";
      weightLevel1 = $AIWeightMortarTurret[1];
      weightLevel2 = $AIWeightMortarTurret[2];
      description = "Mortar the " @ %object.getDataBlock().getName();
      targetObject = %object.getDataBlock().getName();
      targetObjectId = %object;
      targetClientId = -1;
      offense = true;
      equipment = "Mortar MortarAmmo";
      buyEquipmentSet = "HeavyAmmoSet";
      location = %object.getWorldBoxCenter();
      position = %object.getWorldBoxCenter();
   };
   if (Game.class $= "SiegeGame")
   {
      if (%object.team == Game.defenseTeam)
         $ObjectiveQ[Game.defenseTeam].add(%mortarVPad);
   }
   else
      $ObjectiveQ[%enemyTeam].add(%mortarVPad);

   MissionCleanup.add(%mortarVPad); // Regardless this has to be added to cleanup - ZOD

   //create the attack objective
   %attackVPad = new AIObjective(AIOAttackObject)
   {
      dataBlock = "AIObjectiveMarker";
      weightLevel1 = $AIWeightAttackGenerator[1];
      weightLevel2 = $AIWeightAttackGenerator[2];
      description = "Attack the " @ %object.getDataBlock().getName();
      targetObject = %object.getDataBlock().getName();
      targetObjectId = %object;
      targetClientId = -1;
      offense = true;
      equipment = "Plasma PlasmaAmmo";
      buyEquipmentSet = "HeavyAmmoSet";
      location = %object.getWorldBoxCenter();
      position = %object.getWorldBoxCenter();
   };
   if (Game.class $= "SiegeGame")
   {
      if (%object.team == Game.defenseTeam)
         $ObjectiveQ[Game.defenseTeam].add(%attackVPad);
   }
   else
      $ObjectiveQ[%enemyTeam].add(%attackVPad);

   MissionCleanup.add(%attackVPad); // Regardless this has to be added to cleanup - ZOD
}

function SweepForPads(%simGroup)
{
   if(%SimGroup.getClassName() $= "SimGroup")
   {
      for (%i = 0; %i < %SimGroup.getCount(); %i++)
      {
         %obj = %SimGroup.getObject(%i);
         if (%obj.getClassName() $= "SimGroup")
         {
            SweepForPads(%obj);
         }

         if (%obj.getClassName() $= "StaticShape")
         {
            if (%obj.getDataBlock().getName() $= "StationVehicle")
            {
               addVPadObjective(%obj);
               $AIVehiclePadSet.add(%obj);
            }
            if (%obj.getDataBlock().getName() $= "MPBTeleporter") // Can use VPad Objective build, would be same anyway - ZOD
            {
               addVPadObjective(%obj);
               $AITeleportSet.add(%obj);
            }
         }
      }
   }
}
