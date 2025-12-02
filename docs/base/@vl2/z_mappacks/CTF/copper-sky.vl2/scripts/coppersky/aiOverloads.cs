package laggbots {

   function CTFGame::onAIRespawn(%game, %client)
   {
      Parent::onAIRespawn(%game, %client);
      if (! %client.defaultTasksAdded)
      {
	   %client.defaultTasksAdded = true;
	   %client.addTask(AIEngageTask);
	   %client.addTask(AIPickupItemTask);
	   %client.addTask(AITauntCorpseTask);
	   %client.addtask(AIEngageTurretTask);
	   %client.addtask(AIDetectMineTask);
         %client.addtask(AIDetectRemeqTask);//- Lagg... 3-20-2003
         %client.addtask(AIDetectVehicleTask);//- Lagg... 11-6-2003
         %client.addTask(AICouldUseInventoryTask);//- Lagg... 9-6-2003
      }
   }

   //Lets make sure they avoid mortar turret projectiles (thanks Capto Lamia)
   function MortarBarrelLarge::onFire(%data,%obj,%slot)
   {
      Parent::onFire(%data,%obj,%slot);
      %p = %obj.lastProjectile;
      AIGrenadeThrown(%p);
   }

   //Lets make sure they attempt to avoid plasma turret projectiles (thanks Capto Lamia)
   function PlasmaBarrelLarge::onFire(%data,%obj,%slot)
   {
      Parent::onFire(%data,%obj,%slot);
      %p = %obj.lastProjectile;
      AIGrenadeThrown(%p);
   }

   function TurretData::selectTarget(%this, %turret)
   {
      %turretTarg = %turret.getTarget();
      if(%turretTarg == -1)
        return;

      if(getTargetSensorGroup(%turretTarg) == 0)
      {
         %turret.clearTarget();
         return;
      }

      if((!%turret.isPowered()) && (!%turret.needsNoPower))
      {
         %turret.clearTarget();
         return;
      }
      // Allow bot controlled vehicle turrets to fire on anything..
      if(%this.getName() $= BomberTurret || %this.getName() $= AssaultPlasmaTurret)
      {
         %TargetSearchMask = $TypeMasks::PlayerObjectType | $TypeMasks::VehicleObjectType |
                             $TypeMasks::TurretObjectType | $TypeMasks::SensorObjectType |
                             $TypeMasks::StationObjectType | $TypeMasks::GeneratorObjectType |
                             $TypeMasks::StaticShapeObjectType;

         InitContainerRadiusSearch(%turret.getMuzzlePoint(0), %turret.getMountedImage(0).attackRadius, %TargetSearchMask);
         while ((%potentialTarget = ContainerSearchNext()) != 0)
         {
            %potTargTarg = %potentialTarget.getTarget();
            if (%turret.isValidTarget(%potentialTarget) && (getTargetSensorGroup(%turretTarg) != getTargetSensorGroup(%potTargTarg)))
            {
               %turret.setTargetObject(%potentialTarget);
               return;
             }
         }
      }
      else
         Parent::selectTarget(%this, %turret);
   }

   function StationVehicle::onAdd(%this, %obj)
   {
      Parent::onAdd(%this, %obj);

      // Add to AI Set - Lagg...
      if($Host::BotsEnabled)
      {
         addVPadObjective(%obj);
         $AIVehiclePadSet.add(%obj);
      }
   }

   function Armor::onCollision(%this,%obj,%col,%forceVehicleNode)
   {
      if (%obj.getState() $= "Dead")
         return;

      %dataBlock = %col.getDataBlock();
      %className = %dataBlock.className;
      %client = %obj.client;
      // player collided with a vehicle
      %node = -1;
      if (%forceVehicleNode !$= "" || (%className $= WheeledVehicleData || %className $= FlyingVehicleData || %className $= HoverVehicleData) &&
         %obj.mountVehicle && %obj.getState() $= "Move" && %col.mountable && !%obj.inStation && %col.getDamageState() !$= "Destroyed")
      {

         //if the player is an AI, he should snap to the mount points in node order,
         //to ensure they mount the turret before the passenger seat, regardless of where they collide...
         if (%obj.client.isAIControlled())
         {
            %transform = %col.getTransform();   

            //either the AI is *required* to pilot, or they'll pick the first available passenger seat
            if (%client.pilotVehicle)
            {
               //make sure the bot is in light armor
               if(%obj.getArmorSize() $= "Light" || %obj.getArmorSize() $= "Medium")
               {
                  //make sure the pilot seat is empty
                  if (!%col.getMountNodeObject(0))
                     %node = 0;
               }
            }
            else
               %node = findAIEmptySeat(%col, %obj);
         }
         else
            %node = findEmptySeat(%col, %obj, %forceVehicleNode);

         //now mount the player in the vehicle
         if(%node >= 0)
         {
            // players can't be pilots, bombardiers or turreteers if they have
            // "large" packs -- stations, turrets, turret barrels
            if(hasLargePack(%obj))
            {
               // check to see if attempting to enter a "sitting" node
               if(nodeIsSitting(%datablock, %node))
               {
                  // send the player a message -- can't sit here with large pack
                  if(!%obj.noSitMessage)
                  {
                     %obj.noSitMessage = true;
                     %obj.schedule(2000, "resetSitMessage");
                     messageClient(%obj.client, 'MsgCantSitHere', '\c2Pack too large, can\'t occupy this seat.~wfx/misc/misc.error.wav');
                  }
                  return;
               }
            }
            if(%col.noEnemyControl && %obj.team != %col.team)
               return;

            commandToClient(%obj.client,'SetDefaultVehicleKeys', true);
            //If pilot or passenger then bind a few extra keys
            if(%node == 0)
               commandToClient(%obj.client,'SetPilotVehicleKeys', true);
            else
               commandToClient(%obj.client,'SetPassengerVehicleKeys', true);

            if(!%obj.inStation)
               %col.lastWeapon = ( %col.getMountedImage($WeaponSlot) == 0 ) ? "" : %col.getMountedImage($WeaponSlot).item;
            else
               %col.lastWeapon = %obj.lastWeapon;

            //AI Hook here to state sitting position for vehicle type to fix the AI standing is seat bug - Lagg... 10-17-2003
            if (%obj.client.isAIControlled() && %node == 1 && (%type $= "BomberFlyer" || %type $= "AssaultVehicle"))
            {
               //error("set the dam action thread - Armor::onCollision");
               //%client.player.setActionThread(%col.getDataBlock().mountPose[0], true, true);
               %client.player.setActionThread(sitting, true, true);                       
            }

            %col.mountObject(%obj,%node);
            %col.playAudio(0, MountVehicleSound);
            %obj.mVehicle = %col;

            // if player is repairing something, stop it
            if(%obj.repairing)
               stopRepairing(%obj);

            //this will setup the huds as well...
            %dataBlock.playerMounted(%col,%obj, %node);
         }
      }
      else
         Parent::onCollision(%this, %obj, %col, %forceVehicleNode);
   }
};

function MobileInvStation::onAdd(%this, %obj)
{
   Parent::onAdd(%this, %obj);

   //add mpb inventory station to the $aiinventory set so bots can use it - Lagg..
   if($Host::BotsEnabled)
      $AIInvStationSet.add(%obj);
}

function AIConnection::isMounted(%client)
{
   %vehicle = %client.getControlObject();
   %className = %vehicle.getDataBlock().className;
   if(%className $= WheeledVehicleData || %className $= FlyingVehicleData || %className $= HoverVehicleData) 
      return true;
   else
      return false;
}

function findAIEmptySeat(%vehicle, %player)
{
   %myArmor = %player.getArmorSize();//added - Lagg... 10-9-2003
   %dataBlock = %vehicle.getDataBlock();
   if (%dataBlock.getName() $= "BomberFlyer" && %myArmor $= "Heavy")
      %num = 2;
   else
      %num = 1;

   %node = -1;
   for(%i = %num; %i < %dataBlock.numMountPoints; %i++)
   {
      if (!%vehicle.getMountNodeObject(%i))
      {
         //cheap hack - for now, AI's will mount the next available node regardless of where they collided
	 %node = %i;
	 break;
      }
   }
   //return the empty seat
   return %node;
}
