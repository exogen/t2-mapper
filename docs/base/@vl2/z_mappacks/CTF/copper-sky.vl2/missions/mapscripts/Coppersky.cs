////////////////////////////////////////////////////////////////////////////////
/// -Coppersky MAP FILE- ///////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

datablock ShapeBaseImageData(CopperSMissileImage) : MissileLauncherImage
{
   stateTransitionOnNoTarget[7] = "WetFire";
};

package Coppersky
{
   function Coppersky::preLoad(%firstMission)
   {
      // Need to store the map name for scripts to compare to current mission name
      $Map::MyMap = "Coppersky";

      // Execute our bot custom bot scripts
      exec("scripts/coppersky/ai.cs");
      exec("scripts/coppersky/serverTasks.cs");
      activatePackage(laggbots);

      // lets allow some form of sking
      LightMaleHumanArmor.noFrictionOnSki = true;
      LightFemaleHumanArmor.noFrictionOnSki = true;
      LightMaleBiodermArmor.noFrictionOnSki = true;
      MediumMaleHumanArmor.noFrictionOnSki = true;
      MediumFemaleHumanArmor.noFrictionOnSki = true;
      MediumMaleBiodermArmor.noFrictionOnSki = true;
      HeavyMaleHumanArmor.noFrictionOnSki = true;
      HeavyFemaleHumanArmor.noFrictionOnSki = true;
      HeavyMaleBiodermArmor.noFrictionOnSki = true;

      // For our undeploy code, we don't have to reset these at map end
      DeployedStationInventory.item = InventoryDeployable;
      DeployedMotionSensor.item = MotionSensorDeployable;
      DeployedPulseSensor.item = PulseSensorDeployable;
      TurretDeployedFloorIndoor.item = TurretIndoorDeployable;
      TurretDeployedWallIndoor.item = TurretIndoorDeployable;
      TurretDeployedCeilingIndoor.item = TurretIndoorDeployable;
      TurretDeployedOutdoor.item = TurretOutdoorDeployable;

      // Only run these block edits on base servers
      if(strlwr(getModPaths()) $="base")
      {
         $Map::BaseLoaded = 1;
         // Some basic weapon modifications
         BasicELF.beamRange = 25;
         BasicELF.drainEnergy = 0.70;
         BasicELF.drainHealth = 0.0015;
      }
   }
     
   function Coppersky::InitMap()
   {
      for(%i = 0; %i <= %game.numTeams; %i++)
         $ObjectiveCounter[%i] = 0;
   }

   function Coppersky::DeactivateMap()
   {
      // Re-Execute the base scripts
      deactivatePackage(laggbots);
      exec("scripts/ai.cs");
      exec("scripts/serverTasks.cs");

      // Reset any globals that we set in ::preLoad
      if($Map::BaseLoaded == 1)
      {
         BasicELF.beamRange = 30;
         BasicELF.drainEnergy = 1.0;
         BasicELF.drainHealth = 0.0;
      }

      // Remove all of our store varibles from memory
      deleteVariables("$Map::*");

      // Must deactivate package, may be a local game
      if(isActivePackage($MissionName))
      {
         deactivatePackage($MissionName);
         echo("Deactivating package: " @ $MissionName);
      }
   }

   function CTFGame::createPlayer(%game, %client, %spawnLoc, %respawn)
   {
      DefaultGame::createPlayer(%game, %client, %spawnLoc, %respawn);
      if(strlwr(getModPaths()) $="classic;base")
      {
         %player = %client.player;
         if(%client.isAiControlled())
            %player.setRechargeRate(%player.getDataBlock().rechargeRate + 0.20);
      }
   }

   function Weapon::onUse(%data, %obj)
   {
      if(%data.image $= MissileLauncherImage)
      {
         if (%obj.getDataBlock().className $= Armor)
            %obj.mountImage(CopperSMissileImage.getId(), $WeaponSlot);
      }
      else
         Parent::onUse(%data, %obj);
   }

   function ShapeBaseImageData::onDeploy(%item, %plyr, %slot)
   {
      Parent::onDeploy(%item, %plyr, %slot);
      // ZOD 1-29-03: Undeploy code - BadShot/ZOD
      %deplObj.justdeployed = 1;
      schedule(2500, %deplObj, "resetjustdeployed", %deplObj);
   }

   function ServerCmdStartUseBackpack(%client, %data) 
   {
      // ZOD 1-29-03: Undeployment of deployed objects - BadShot
      if((%client.player.getMountedImage($BackpackSlot) == 0) && (%client.player.thrownChargeId == 0))
   	   pickupDeployable(%client);
      else
         Parent::ServerCmdStartUseBackpack(%client, %data);
   }
};

function CopperSMissileImage::onFire(%data,%obj,%slot)
{
   %p = Parent::onFire(%data, %obj, %slot);
   MissileSet.add(%p);
   
   %target = %obj.getLockedTarget();
   if(%target)
   {
      if(%target.getClassName() !$= Player) // Do not lock onto players
         %p.setObjectTarget(%target);
   }
   else if(%obj.isLocked())
      %p.setPositionTarget(%obj.getLockedPosition());
   else
      %p.setNoTarget();
}

function CopperSMissileImage::onWetFire(%data, %obj, %slot)
{
   %p = Parent::onFire(%data, %obj, %slot);
   MissileSet.add(%p);
   %p.setObjectTarget(0);
}

function resetjustdeployed(%obj)
{
   %obj.justdeployed = 0;
}

function pickupDeployable(%client)
{
   %player = %client.player;
   if(%player.inStation)
      return;

   %Masks = $TypeMasks::StaticShapeObjectType | $TypeMasks::TurretObjectType;
   %eyeVec = VectorNormalize(%player.getEyeVector());
   %srchRange = VectorScale(%eyeVec, 5.0);
   %plTm = %player.getEyeTransform();
   %plyrLoc = firstWord(%plTm) @ " " @ getWord(%plTm, 1) @ " " @ getWord(%plTm, 2);
   %srchEnd = VectorAdd(%plyrLoc, %srchRange);
   %potDep = ContainerRayCast(%player.getEyeTransform(), %srchEnd, %Masks);
   if(%potDep)
   {
      %item = %potDep.getDataBlock().item;
      if(%item !$= "" && %potDep.getDataBlock().deployedObject == true)
      {
         if(%potDep.getDamageLevel() < 0.5 && !%potDep.isDisabled())
         {
            if(%player.maxInventory(%item) > 0)
            {
               if(%potDep.team == %player.team)
               {
                  if(!%potDep.justdeployed)
                  {
                     switch$ ( %item ) // ZOD 1-7-03: Special case for certain turrets etc.
                     {
                        case "TurretOutdoorDeployable" or "TurretIndoorDeployable":
                           %potDep.justdeployed = true;
                           if(isObject(%potDep.lastProjectile))
                              %potDep.lastProjectile.delete();

                           %potDep.clearSelfPowered();
                           $TeamDeployedCount[%player.team, %item]--;
                           %potDep.schedule(250, "delete");

                        case "MotionSensorDeployable" or "PulseSensorDeployable":
                           %potDep.justdeployed = true;
                           %player.deploySensors--;
                           %client.updateSensorPackText(%player.deploySensors);
                           %potDep.schedule(100, "delete");
                           $TeamDeployedCount[%player.team, %item]--;

                        case "InventoryDeployable":
                           %potDep.justdeployed = true;
                           %potDep.trigger.delete();
                           %potDep.schedule(100, "delete");
                           $TeamDeployedCount[%player.team, %item]--;

                        default:
                           %potDep.justdeployed = true;
                           %potDep.schedule(100, "delete");
                           $TeamDeployedCount[%player.team, %item]--;
                     }
                     %npack = new Item() {
                        dataBlock = %item;
                        sensors = 1;
                     };
                     MissionCleanup.add(%npack);
                     %pos = %potDep.getPosition();
                     %npack.setTransform(VectorAdd(%pos, "0 0 .75") SPC "0 0 1" SPC (getRandom() * 360));
                     %npack.schedulePop(); // ZOD: Really important, otherwise the item lingers on the map forever or until its picked up.
                  }
                  else
                     messageClient(%client, 'MsgJustDeployed', '\c0Object was just deployed, please wait a moment.');
               }
               else
                  messageClient(%client, 'MsgWrongTeam', '\c0Access Denied. Wrong Team.');
            }
            else
               messageClient(%client, 'MsgTooSmall', '\c0You can\'t undeploy this object in your armor.');
         }
         else
            messageClient(%client, 'MsgDisabled', '\c0Object is to heavily damaged.');
      }
      else
         messageClient(%client, 'MsgNotDeployable', '\c0Object is not undeployable.');
   }
   else
      messageClient(%client, 'MsgNothing', '\c0No undeployable in sight.');
}
