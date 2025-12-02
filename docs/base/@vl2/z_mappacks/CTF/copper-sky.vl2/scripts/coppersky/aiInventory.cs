//------------------------------
//AI Inventory functions

function AINeedEquipment(%equipmentList, %client)
{
   %index = 0;
   %item = getWord(%equipmentList, %index);

   //first, see if we're testing the armor class as well...
   if (%item $= "Heavy" || %item $= "Medium" || %item $= "Light")
   {
      if (%client.player.getArmorSize() !$= %item)
         return true;

      %index++;
      %item = getWord(%equipmentList, %index);
   }

   while (%item !$= "")
   {
      if (%client.player.getInventory(%item) == 0)
         return true;
         
      //get the next item
      %index++;
      %item = getWord(%equipmentList, %index);
   }
   
   //made it through the list without needing anything
   return false;
}

function AIBuyInventory(%client, %requiredEquipment, %equipmentSets, %buyInvTime)
{
   //make sure we have a live player
   %player = %client.player;
   if (!isObject(%player))
      return "Failed";

   if (! AIClientIsAlive(%client))
      return "Failed";

   //see if we've already initialized our state machine
   if (%client.buyInvTime == %buyInvTime)
      return AIProcessBuyInventory(%client);

   //if the closest inv station is not a remote, buy the first available set...
   %result = AIFindClosestInventory(%client, false);
   %closestInv = getWord(%result, 0);
   %closestDist = getWord(%result, 1);
   if (%closestInv <= 0)
      return "Failed";

   //see if the closest inv station was a remote
   %buyingSet = false;
   %usingRemote = false;
   if (%closestInv.getDataBlock().getName() $= "DeployedStationInventory")
   {
      //see if we can buy at least the required equipment from the set
      if (%requiredEquipment !$= "")
      {
         if (! AIMustUseRegularInvStation(%requiredEquipment, %client))
            %canUseRemote = true;
         else
            %canUseRemote = false;
      }
      else
      {
         %inventorySet = AIFindSameArmorEquipSet(%equipmentSets, %client);
         if (%inventorySet !$= "")
            %canUseRemote = true;
         else
            %canUseRemote = false;
      }

      //if we can't use a remote, we need to look for a regular inv station
      if (! %canUseRemote)
      {
         %result = AIFindClosestInventory(%client, true);
         %closestInv = getWord(%result, 0);
         %closestDist = getWord(%result, 1);
         if (%closestInv <= 0)
            return "Failed";
      }
      else
         %usingRemote = true;
   }

   //at this point we've found the closest inv, see which set/list we need to buy
   if (!%usingRemote)
   {
      //choose the equipment first equipment set
      if (%equipmentSets !$= "")
      {
         %inventorySet = getWord(%equipmentSets, 0);
         %buyingSet = true;
      }
      else
      {
         %inventorySet = %requiredEquipment;
         %buyingSet = false;
      }
   }
   else
   {
      %inventorySet = AIFindSameArmorEquipSet(%equipmentSets, %client);
      if (%inventorySet $= "")
      {
         %inventorySet = %requiredEquipment;
         %buyingSet = false;
      }
      else
         %buyingSet = true;
   }

   //init some vars for the state machine...
   %client.buyInvTime = %buyInvTime; //used to mark the begining of the inv buy session
   %client.invToUse = %closestInv;	//used if we need to go to an alternate inv station
   %client.invWaitTime = "";	//used to track how long we've been waiting
   %client.invBuyList = %inventorySet; //the list/set of items we're going to buy...
   %client.buyingSet = %buyingSet; //whether it's a list or a set...
   %client.isSeekingInv = false;
   %client.seekingInv = "";
        
   //now process the state machine
   return AIProcessBuyInventory(%client);
}

//-------------------------------------------------------------------------------------------------- 
//long needed fix for AI in Tribes 2 ---------------------------------------------- Lagg... 3-14-2003
//bots will never get stuck on a remote inventory again :)

function AIProcessBuyInventory(%client)
{
   //get some vars
   %player = %client.player;
   if (!isObject(%player))
      return "Failed";

   %closestInv = %client.invToUse;
   %inventorySet = %client.invBuyList;
   %buyingSet = %client.buyingSet;

   //make sure it's still valid, enabled, and on our team
   if (! (%closestInv > 0 && isObject(%closestInv) && (%closestInv.team <= 0 || %closestInv.team == %client.team) && %closestInv.isEnabled()))
   {
      //reset the state machine
      %client.buyInvTime = 0;
      //return "InProgress";
      //echo("RETURN FAILED ! - LAGG...");
      return "Failed";
   }

   //use the Y-axis of the rotation as the desired direction of approach,
   //and calculate a walk to point 1.1 - 1.3 m behind the trigger point - Lagg...
   %aprchDirection = MatrixMulVector("0 0 0 " @ getWords(%closestInv.getTransform(), 3, 6), "0 1 0");
   %aprchDirection = VectorNormalize(%aprchDirection);
      
   //make sure the inventory station is not blocked
   %invLocation = %closestInv.getWorldBoxCenter();
   InitContainerRadiusSearch(%invLocation, 2, $TypeMasks::PlayerObjectType);
   %objSrch = containerSearchNext();
   if (%objSrch == %client.player)
      %objSrch = containerSearchNext();

   //the closestInv is busy...
   if (%objSrch > 0)
   {
      //have the AI range the inv
      if (%client.seekingInv $= "" || %client.seekingInv != %closestInv)
      {
         %client.invWaitTime = "";
         %client.seekingInv = %closestInv;
         %client.stepRangeObject(%closestInv, "DefaultRepairBeam", 5, 10);
      }
      //inv is still busy - see if we're within range
      else if (%client.getStepStatus() $= "Finished")
      {
         //initialize the wait time
         if (%client.invWaitTime $= "")
            %client.invWaitTime = getSimTime() + 5000 + (getRandom() * 10000);
         //else see if we've waited long enough
         else if (getSimTime() > %client.invWaitTime)
         {
            schedule(250, %client, "AIPlayAnimSound", %client, %objSrch.getWorldBoxCenter(), "vqk.move", -1, -1, 0);
            %client.invWaitTime = getSimTime() + 5000 + (getRandom() * 10000);
         }
      }
      else
      {
         //in case we got bumped, and are ranging the target again...
         %client.invWaitTime = "";
      }
   }
   //else if we've triggered the inv, automatically give us the equipment...
   else if (isObject(%closestInv) && isObject(%closestInv.trigger) && VectorDist(%closestInv.trigger.getWorldBoxCenter(), %player.getWorldBoxCenter()) < 1.5)
   {
      //first stop...
      %client.stop();
      %index = 0;
      if (%buyingSet)
      {
         //first, clear the players inventory
         %player.clearInventory();
         %item = $AIEquipmentSet[%inventorySet, %index];
      }
      else
         %item = getWord(%inventorySet, %index);


      //armor must always be bought first
	if (%item $= "Light" || %item $= "Medium" || %item $= "Heavy")
	{
	   %player.setArmor(%item);
	   %index++;
	}

      //set the data block after the armor had been upgraded
      %playerDataBlock = %player.getDataBlock(); 

      //next, loop through the inventory set, and buy each item
      if (%buyingSet)
         %item = $AIEquipmentSet[%inventorySet, %index];
      else
         %item = getWord(%inventorySet, %index);

      while (%item !$= "")
      {
         //set the inventory amount to the maximum quantity available
         if (%player.getInventory(AmmoPack) > 0)
            %ammoPackQuantity = AmmoPack.max[%item];
         else
            %ammoPackQuantity = 0;

         %quantity = %player.getDataBlock().max[%item] + %ammoPackQuantity;
         if ($InvBanList[$CurrentMissionType, %item])
            %quantity = 0;

         // ZOD 2-2-03: Added Force = 1, make sure they get their stuff, I hope.
         %player.setInventory(%item, %quantity, 1);

         //get the next item
         %index++;
         if (%buyingSet)
            %item = $AIEquipmentSet[%inventorySet, %index];
         else
            %item = getWord(%inventorySet, %index);
      }

      //put a weapon in the bot's hand...
      %player.cycleWeapon();

      //return a success - but wait if we are not healed all the way :) - Lagg...
      //if (%player.getDamagePercent() <= 0)
      //{
         //get away from inventory if we are done - Lagg...
         %client.setDangerLocation(%invLocation, 15);
         return "Finished";
      //}
   }
   //else, keep moving towards the inv station
   else
   {
      if (isObject(%closestInv) && isObject(%closestInv.trigger))
      {
         //quite possibly we may need to deal with what happens if a bot doesn't have a path to the inv...
         //the current premise is that no inventory stations are "unpathable"...
         //this is true so I have fixed it some what - Lagg... :)

         //if (%client.isSeekingInv)
         //{
         //   %dist = %client.getPathDistance(%closestInv.trigger.getWorldBoxCenter());
         // if (%dist < 0)
         //	error("DEBUG Tinman - still need to handle bot stuck trying to get to an inv!");
         //}
         //calculate the approachFromLocation
         if (%closestInv.getDataBlock().getName() $= "MobileInvStation")
            %factor = -2;
         else
         {
            %clientArmor = %client.player.getArmorSize();
            if (%clientArmor $= "Heavy")
	         %factor = -1.3;//1.3m behind inv trigger for heavy bots
            else if (%clientArmor $= "Medium")
	         %factor = -1.175;//1.175m behind inv trigger for medium bots
            else
               %factor = -1.1;//1.1m behind inv trigger for light bots
         }
         %aprchFromLocation = VectorAdd(%invLocation,VectorScale(%aprchDirection, %factor));													
         %client.stepMove(%aprchFromLocation);
         %client.isSeekingInv = true;
      }
      //added here so bots shoot - Lagg... 9-18-2003
      //this call works in conjunction with AIEngageTask
	%client.setEngageTarget(%client.shouldEngage);

      return "InProgress";
   }
}

function AIFindSameArmorEquipSet(%equipmentSets, %client)
{
   %clientArmor = %client.player.getArmorSize();
   %index = 0;
   %set = getWord(%equipmentSets, %index);
   while (%set !$= "")
   {
      if ($AIEquipmentSet[%set, 0] $= %clientArmor)
         return %set;

      //get the next equipment set in the list of sets
      %index++;
      %set = getWord(%equipmentSets, %index);
   }
   return "";
}

//---------------------------------------------------------------------------------------------------

//killed a couple roaches here :) - Lagg... - 4-12-2003
function AIMustUseRegularInvStation(%equipmentList, %client)
{
   %clientArmor = %client.player.getArmorSize();

   //first, see if the set contains an item not available
   %needRemoteInv = false;
   %index = 0;
   %item = getWord(%equipmentList, 0);
   while (%item !$= "")
   {
      //fixed here so light bots don't try to deploy turrets:) --- Lagg... 3-12-2003
      //and light armor can't be bought at remotes - Thank You
      if (%item $= "InventoryDeployable" || (%item $= "Light" && %clientArmor !$= "Light") ||
         (%item $= "Medium" && %clientArmor !$= "Medium") ||
         (%item $= "Heavy" && %clientArmor !$= "Heavy") ||
         (%clientArmor !$= "Light" && %item $= "SniperRifle") ||
         (%item $= "Mortar" && %clientArmor !$= "Heavy") ||
         (%item $= "CloakingPack" && %clientArmor !$= "Light") ||
         (%clientArmor $= "Light" && (%item $= "Mortar" || %item $= "MissileLauncher" ||
          %item $= "TurretOutdoorDeployable" || %item $= "TurretIndoorDeployable")))
      {
         return true;
      }
      else
      {
         %index++;
	   %item = getWord(%equipmentList, %index);
      }
   }
   if (%needRemoteInv)
      return true;


   //otherwise, see if the set begins with an armor class
   %needArmor = %equipmentList[0];
   if (%needArmor !$= "Light" && %needArmor !$= "Medium" && %needArmor !$= "Heavy")
      return false;

   //also including looking for an inventory set
   //this one does not seem to work light armor still bought at remotes(fixed above) - Lagg...
   if (%needArmor != %client.player.getArmorSize())
      return true;

   //we must be fine...
   return false;
}

//---------------------------------------------------------------------------------------------------------------
//is called from - 'AIPickupItemTask' in "aiDefaultTasks.cs"
//makes calls to - 'function AICanPickupWeapon'
 
//modified for better performance and bugs removed - Lagg... 4-3-2003 - (updated 11-5-2003)
function AICouldUseItem(%client, %item)
{
   if(!AIClientIsAlive(%client))
      return false;
      
   %player = %client.player;
   if (!isObject(%player))
      return false;

   %playerDataBlock = %client.player.getDataBlock();
   %armor = %player.getArmorSize();
   %type = %item.getDataBlock().getName();

   //check packs first
   if ((%type $= "CloakingPack" && %armor $= "Light") || (%type $= "InventoryDeployable" && %armor !$= "Light") ||
     %type $= "RepairPack" || %type $= "EnergyPack" || %type $= "ShieldPack" ||
     %type $= "AmmoPack" || %type $= "SensorJammerPack")
   {
      if(%player.getMountedImage($BackpackSlot) <= 0)
            return true;
      else
         return false;
   }

   //if the item is acutally, a corpse, check the corpse inventory and compare it to ours - Lagg...
   if (%item.isCorpse)
   {
      %corpse = %item;
      if (%corpse.getInventory("ChainGunAmmo") > 0 && %player.getInventory("ChainGunAmmo") <
        %playerDataBlock.max[ChainGunAmmo] && %player.getInventory("ChainGun") > 0)
         return true;
      if (%corpse.getInventory("PlasmaAmmo") > 0 && %player.getInventory("PlasmaAmmo") <
        %playerDataBlock.max[PlasmaAmmo] && %player.getInventory("Plasma") > 0)
         return true;
      if (%corpse.getInventory("DiscAmmo") > 0 && %player.getInventory("DiscAmmo") <
        %playerDataBlock.max[DiscAmmo] && %player.getInventory("Disc") > 0)
         return true;
      if (%corpse.getInventory("GrenadeLauncherAmmo") > 0 && %player.getInventory("GrenadeLauncherAmmo") <
        %playerDataBlock.max[GrenadeLauncherAmmo] && %player.getInventory("GrenadeLauncher") > 0)
         return true;
      if (%corpse.getInventory("MissileLauncherAmmo") > 0 && %player.getInventory("MissileLauncherAmmo") <
        %playerDataBlock.max[MissileLauncherAmmo] && %player.getInventory("MissileLauncher") > 0)
         return true;
      if (%corpse.getInventory("MortarAmmo") > 0 && %player.getInventory("MortarAmmo") <
        %playerDataBlock.max[MortarAmmo] && %player.getInventory("Mortar") > 0)
         return true;
   }
   else
   {
      //check ammo
      %quantity = mFloor(%playerDataBlock.max[%type]);
      if (%player.getInventory(%type) < %quantity)
      {
         if (%type $= "ChainGunAmmo")
	      return true;
         if (%type $= "PlasmaAmmo")
	      return true;
	   if (%type $= "DiscAmmo")
	      return true;
	   if (%type $= "GrenadeLauncher")
	      return true;
	   if (%type $= "MortarAmmo" && %player.getInventory("Mortar") > 0)
	      return true;

	   //check mines and grenades as well
	   if (%type $= "Grenade" || %type $= "FlashGrenade" || %type $= "ConcussionGrenade" || %type $= "FlareGrenade" ||
             %type $= "Mine")

	   return true;
      }
      //see if we can carry another weapon...
      //if (AICanPickupWeapon(%client, %weapon)) error here - Lagg...
      if (AICanPickupWeapon(%client, %item))
         return true;
   }
   //guess we didn't find anything useful...  (should still check for mines and grenades) did that - Lagg...
   return false;
}

//-----------------------------------------------------------------------------------------------------------

//added check for all weapons - Lagg... - 4-12-2003
function AIEngageOutofAmmo(%client)
{
   //this function only cares about weapons used in engagement...
   //no mortars, or missiles - yeah right...Lagg
   %player = %client.player;
   if (!isObject(%player))
      return false;

   %ammoWeapons = 0;
   %energyWeapons = 0;
   
   //get our inventory
   %hasBlaster = (%player.getInventory("Blaster") > 0); 
   %hasPlasma  = (%player.getInventory("Plasma") > 0); 
   %hasChain   = (%player.getInventory("Chaingun") > 0); 
   %hasDisc    = (%player.getInventory("Disc") > 0); 
   %hasGrenade = (%player.getInventory("GrenadeLauncher") > 0); 
   %hasSniper  = (%player.getInventory("SniperRifle") > 0) && (%player.getInventory("EnergyPack") > 0);
   %hasELF     = (%player.getInventory("ELFGun") > 0); 
   %hasMortar  = (%player.getInventory("Mortar") > 0); 
   %hasMissile = (%player.getInventory("MissileLauncher") > 0);
   %hasLance   = (%player.getInventory("ShockLance") > 0);
   
   if (%hasBlaster || %hasSniper || %hasElf || %hasLance)
      return false;
   else
   {
      // we only have ammo type weapons
      if(%hasDisc && (%player.getInventory("DiscAmmo") > 0))
         return false;
      else if(%hasChain && (%player.getInventory("ChainGunAmmo") > 0))
         return false;
      else if(%hasGrenade && (%player.getInventory("GrenadeLauncherAmmo") > 0))
         return false;
      else if(%hasPlasma && (%player.getInventory("PlasmaAmmo") > 0))
         return false;
      else if(%hasMissile && (%player.getInventory("MissileLauncherAmmo") > 0))
         return false;
      else if(%hasMortar && (%player.getInventory("MortarAmmo") > 0))
         return false;
   }   
   return true; // were out!
}

//------------------------------------------------------------------------------------------------
//is called from - 'function AICouldUseItem'
//makes calls to - ''


//almost a complete rewrite here :) - Lagg... 11-5-2003
function AICanPickupWeapon(%client, %weapon)
{
   //first, make sure it's not a weapon we already have...
   %player = %client.player;
   if (!isObject(%player))
      return false;

   %armor = %player.getArmorSize();
   if (%player.getInventory(%weapon) > 0)
      return false;

   %type = %weapon.getDataBlock().getName();

   //make sure the %weapon given is a weapon they can use for engagement
   //if (%weapon !$= "Blaster" && %weapon !$= "Plasma" && %weapon !$= "Chaingun" && %weapon !$= "Disc" &&
   //		%weapon !$= "GrenadeLauncher" && %weapon !$= "SniperRifle" && %weapon !$= "ELFGun" && %weapon !$=
   //"ShockLance")
   //{
   //	return false;
   //}
   //they can use all weapons for engagement now :) - Lagg...

   // ZOD: Much shorter method for increasing the count
   %weaponCount = 0;
   for(%a = 0; $InvWeapon[%a] !$= ""; %a++)
   {
      if(%player.getInventory($NameToInv[$InvWeapon[%a]]) > 0)
         %weaponCount++;
   }

//   %weaponCount = 0;
//   if (%player.getInventory("Blaster") > 0)
//      %weaponCount++;
//   if (%player.getInventory("Plasma") > 0)
//      %weaponCount++;
//   if (%player.getInventory("Chaingun") > 0)
//      %weaponCount++;
//   if (%player.getInventory("Disc") > 0)
//      %weaponCount++;
//   if (%player.getInventory("GrenadeLauncher") > 0)
//      %weaponCount++;
//   if (%player.getInventory("SniperRifle") > 0)
//      %weaponCount++;
//   if (%player.getInventory("ELFGun") > 0)
//      %weaponCount++;
//   if (%player.getInventory("Mortar") > 0)
//      %weaponCount++;
//   if (%player.getInventory("MissileLauncher") > 0)
//      %weaponCount++;
//   if (%player.getInventory("ShockLance") > 0)
//      %weaponCount++;

   //total redo here - Lagg...
   if ((%armor $= "Light" && %weaponCount < 3) || (%armor $= "Medium" && %weaponCount < 4) ||
      (%armor $= "Heavy" && %weaponCount < 5))
   {
      if ((%type $= "Mortar" && %armor !$= "Heavy") || (%type $= "MissileLauncher" && %armor $= "Light") ||
         (%type $= "SniperRifle" && %armor !$= "Light") ||
         (%type $= "SniperRifle" && %player.getInventory("EnergyPack") <= 0))
         return false;
      else if(%type $= "Blaster" && %player.getInventory("Blaster") <= 0)
         return true;
      else if(%type $= "Plasma" && %player.getInventory("Plasma") <= 0)
         return true;
      else if(%type $= "Chaingun" && %player.getInventory("Chaingun") <= 0)
         return true;
      else if(%type $= "Disc" && %player.getInventory("Disc") <= 0)
         return true;
      else if(%type $= "GrenadeLauncher" && %player.getInventory("GrenadeLauncher") <= 0)
         return true;
      else if(%type $= "SniperRifle" && %player.getInventory("SniperRifle") <= 0)
         return true;
      else if(%type $= "ELFGun" && %player.getInventory("ELFGun") <= 0)
         return true;
      else if(%type $= "Mortar" && %player.getInventory("Mortar") <= 0)
         return true;
      else if(%type $= "MissileLauncher" && %player.getInventory("MissileLauncher") <= 0)
         return true;
      else if(%type $= "ShockLance" && %player.getInventory("ShockLance") <= 0)
         return true;
   }

   //else we're full of weapons already...
   return false;
}

//-----------------------------------------------------------------------------------------------------------

//added for use of all weapons - Lagg... 4-12-2003
function AIEngageWeaponRating(%client)
{
   %player = %client.player;
   if (!isObject(%player))
      return;

   %playerDataBlock = %client.player.getDataBlock();
   
   //get our inventory
   %hasBlaster = (%player.getInventory("Blaster") > 0); 
   %hasPlasma  = (%player.getInventory("Plasma") > 0 && %player.getInventory("PlasmaAmmo") >= 1);
   %hasMortar  = (%player.getInventory("Mortar") > 0 && %player.getInventory("MortarAmmo") >= 1);
   %hasChain   = (%player.getInventory("Chaingun") > 0 && %player.getInventory("ChaingunAmmo") >= 1); 
   %hasDisc    = (%player.getInventory("Disc") > 0 && %player.getInventory("DiscAmmo") >= 1); 
   %hasGrenade = (%player.getInventory("GrenadeLauncher") > 0 && %player.getInventory("GrenadeLauncherAmmo") >= 1);
   %hasMissile = (%player.getInventory("MissileLauncher") > 0 && %player.getInventory("MissileLauncherAmmo") >= 1);
   %hasSniper  = (%player.getInventory("SniperRifle") > 0) && (%player.getInventory("EnergyPack") > 0);
   %hasELF     = (%player.getInventory("ELFGun") > 0);
   %hasLance   = (%player.getInventory("ShockLance") > 0);

   //check ammo
   %quantity = mFloor(%playerDataBlock.max[%type] * 0.7);

   %rating = 0;
   if (%hasBlaster)
      %rating += 9;
   if (%hasSniper)
      %rating += 9;
   if (%hasElf)
      %rating += 9;
   if (%hasLance)
      %rating += 9;

   if (%hasDisc)
   {
      %quantity = %player.getInventory("DiscAmmo") / %playerDataBlock.max["DiscAmmo"];
      %rating += 15 + (15 * %quantity);
   }
   if (%hasPlasma)
   {
      %quantity = %player.getInventory("PlasmaAmmo") / %playerDataBlock.max["PlasmaAmmo"];
      %rating += 15 + (15 * %quantity);
   }
   if (%hasChain)
   {
      %quantity = %player.getInventory("ChainGunAmmo") / %playerDataBlock.max["ChainGunAmmo"];
      %rating += 15 + (15 * %quantity);
   }

   //not really an effective weapon for hand to hand...
   //if (%hasGrenade)
   //{
   //%quantity =  %player.getInventory("GrenadeLauncherAmmo") / %playerDataBlock.max["GrenadeLauncherAmmo"];
   //%rating += 10 + (15 * %quantity);
   //}
   //not really an effective weapon for hand to hand...
   //if (%hasMortar)
   //{
   //%quantity =  %player.getInventory("MortarAmmo") / %playerDataBlock.max["MortarAmmo"];
   //%rating += 10 + (15 * %quantity);
   //}
   //not really an effective weapon for hand to hand...
   //if (%hasMissile)
   //{
   //%quantity =  %player.getInventory("MissileLauncherAmmo") / %playerDataBlock.max["MissileLauncherAmmo"];
   //%rating += 10 + (15 * %quantity);
   //}

   //note a rating of 20+ means at least two energy weapons, or an ammo weapon with at least 1/3 ammo...
   return %rating;
}

function AIFindSafeItem(%client, %needType)
{
   %player = %client.player;
   if (!isObject(%player))
      return -1;

   %closestItem = -1;
   %closestDist = 32767;

   %itemCount = $AIItemSet.getCount();
   for (%i = 0; %i < %itemCount; %i++)
   {
      %item = $AIItemSet.getObject(%i);
      if (%item.isHidden())
         continue;

      %type = %item.getDataBlock().getName();
      if ((%needType $= "Health" && (%type $= "RepairKit" || %type $= "RepairPatch") && %player.getDamagePercent() > 0) ||
         (%needType $= "Ammo" && (%type $= "ChainGunAmmo" || %type $= "PlasmaAmmo" || %type $= "DiscAmmo" || 
          %type $= "GrenadeLauncherAmmo" || %type $= "MortarAmmo") && AICouldUseItem(%client, %item)) ||
         (%needType $= "Ammo" && AICanPickupWeapon(%type)) ||
         ((%needType $= "" || %needType $= "Any") && AICouldUseItem(%client, %item)))
      {
         //first, see if it's close to us...
         %distance = %client.getPathDistance(%item.getTransform());
         if (%distance > 0 && %distance < %closestDist)
         {
            //now see if it's got bad enemies near it...
            %clientCount = ClientGroup.getCount();
            for (%j = 0; %j < %clientCount; %j++)
            {
               %cl = ClientGroup.getObject(%j);
               if (%cl == %client || %cl.team == %client.team || !AIClientIsAlive(%cl))
                  continue;

               //if the enemy is stronger, see if they're close to the item
               if (AIEngageWhoWillWin(%client, %cl) == %cl)
               {
                  %tempDist = %client.getPathDistance(%item.getWorldBoxCenter());
                  if (%tempDist > 0 && %tempDist < %distance + 50)
                     continue;
               }
               //either no enemy, or a weaker one...
               %closestItem = %item;
               %closestDist = %distance;
            }
         }
      }
   }
   return %closestItem;
}

//-------------------------------------------

//big modifications here - Lagg... - 4-12-2003
function AIChooseObjectWeapon(%client, %targetObject, %distToTarg, %mode, %canUseEnergyStr, %environmentStr)
{
   //get our inventory
   %player = %client.player;
   if (!isObject(%player))
      return;

   if (!isObject(%targetObject))
      return;

   //check for LOS - Lagg..
   %mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType |
           $TypeMasks::StaticTSObjectType | $TypeMasks::ForceFieldObjectType;
   %hasLOS = !containerRayCast(%player.getMuzzlePoint($WeaponSlot), %targetObject.getWorldBoxCenter(), %mask, 0);

   %canUseEnergy = (%canUseEnergyStr $= "true");
   %inWater = (%environmentStr $= "water");
   %outdoors = (%environmentStr $= "outdoors");//added - Lagg... 1-20-2003
   %myEnergy = %player.getEnergyPercent();//added - Lagg... 1-28-2003        
   %hasBlaster = (%player.getInventory("Blaster") > 0) && %canUseEnergy;
   %hasPlasma = (%player.getInventory("Plasma") > 0) && (%player.getInventory("PlasmaAmmo") > 0) && !%inWater;
   %hasChain = (%player.getInventory("Chaingun") > 0) && (%player.getInventory("ChaingunAmmo") > 0);
   %hasDisc = (%player.getInventory("Disc") > 0) && (%player.getInventory("DiscAmmo") > 0);
   %hasGrenade = (%player.getInventory("GrenadeLauncher") > 0) && (%player.getInventory("GrenadeLauncherAmmo") > 0) && !%inWater;
   %hasSniper = (%player.getInventory("SniperRifle") > 0) && (%player.getInventory("EnergyPack") > 0) && %canUseEnergy && !%inWater;
   %hasMortar = (%player.getInventory("Mortar") > 0) && (%player.getInventory("MortarAmmo") > 0) && !%inWater;
   %hasRepairPack = (%player.getInventory("RepairPack") > 0) && %canUseEnergy;
   %hasTargetingLaser = (%player.getInventory("TargetingLaser") > 0) && %canUseEnergy && !%inWater;
   //added missile shocklance and elf ------------------------------------------------------------- Lagg... 1-15-2003
   %hasMissile = (%player.getInventory("MissileLauncher") > 0) && (%player.getInventory("MissileLauncherAmmo") > 0) && !%inWater;
   %hasShockLance = (%player.getInventory("ShockLance") > 0) && %canUseEnergy && !%inWater;
   %hasELF = (%player.getInventory("ELFGun") > 0) && %canUseEnergy && !%inWater;
   
   //see if we're destroying the object -- added for remote inventories destruction -------- Lagg...1-12-2003
   if (%mode $= "Destroy")
   {
      //heavy modifications here could not list em all ------------------------------ Lagg... 1-21-2003
      // ZOD: Compresed this a little bit
      if (%targetObject.getDataBlock().getClassName() $= "TurretData" ||
           %targetObject.getDataBlock().getName() $= "DeployedStationInventory" ||
           %targetObject.getDataBlock().getName() $= "DeployedMine")
      {
         if (%distToTarg < 40)
         {
            if (%hasPlasma)
               %useWeapon = "Plasma";
            else if (%hasDisc)
               %useWeapon = "Disc";
            else
               %useWeapon = "NoAmmo";
         }
         else // ZOD: Is greater then 40 meters
         {
            if (%hasMortar)
               %useWeapon = "Mortar";
            else if (%hasPlasma)
               %useWeapon = "Plasma";         
            else if (%hasDisc)
               %useWeapon = "Disc";
            else if (%hasBlaster)
               %useWeapon = "Blaster";
            else
                %useWeapon = "NoAmmo";
         }
      }
      else if (%distToTarg < 40)
      {
         if (%hasPlasma)
            %useWeapon = "Plasma";
         else if (%hasDisc)
            %useWeapon = "Disc";
         else if (%hasSniper && %myEnergy > 0.8)
            %useWeapon = "SniperRifle";
         else if (%hasBlaster)
            %useWeapon = "Blaster";
         else
            %useWeapon = "NoAmmo";
      }
      else
         %useWeapon = "NoAmmo";
   }
   //else See if we're repairing the object
   else if (%mode $= "Repair")
   {
      if (%hasRepairPack)
         %useWeapon = "RepairPack";
      else
         %useWeapon = "NoAmmo";
   }
   //else see if we're lazing the object
   else if (%mode $= "Laze")
   {
      if (%hasTargetingLaser)
         %useWeapon = "TargetingLaser";
      else
         %useWeapon = "NoAmmo";
   }
   //else see if we're mortaring the object -- Made some modifications here -- Lagg... 1-12-2003
   else if (%mode $= "Mortar")
   {
      if (%distToTarg < 20 && !%inWater)
      { 
          if (%hasPlasma)
               %useWeapon = "Plasma";
          else if (%hasDisc)
            %useWeapon = "Disc";
          else if (%hasChain)
            %useWeapon = "Chaingun";
          else if (%hasBlaster)
            %useWeapon = "Blaster";
          
      }
      else if (%distToTarg < 70 && !%inWater)
      { 
          if (%hasMortar)
               %useWeapon = "Mortar";
          else if (%hasDisc)
            %useWeapon = "Disc";
          else if (%hasPlasma)
               %useWeapon = "Plasma";          
          else if (%hasBlaster)
            %useWeapon = "Blaster";
          
      }
      else if (%distToTarg < 150 && %inWater)
      {
          if (%hasDisc)
            %useWeapon = "Disc";
          else if (%hasBlaster)
            %useWeapon = "Blaster";
      }
      else if (%distToTarg < 150 && !%inWater)
      {
          if (%hasMortar)
               %useWeapon = "Mortar";
          else if (%hasDisc)
            %useWeapon = "Disc";
          else if (%hasBlaster)
            %useWeapon = "Blaster";
      }
      else if (%distToTarg > 150 && !%inWater)
      {
          if (%hasMortar)
               %useWeapon = "Mortar";
      }
      else
         %useWeapon = "NoAmmo";
   }
   //else see if we're MDestroying the object -- Made new mode just in case -- Lagg... 1-12-2003
   else if (%mode $= "MDestroy")
   {
      if (%distToTarg < 15)
      { 
          //if (%hasELF && %myEnergy > 0.4)
            //%useWeapon = ELFGun;
          if (%hasBlaster)
            %useWeapon = "Blaster";
          else if (%hasChain)
            %useWeapon = "Chaingun";
          else if (%hasPlasma)
            %useWeapon = "Plasma";
          else if (%hasDisc)
            %useWeapon = "Disc";          
      }
      else if (%distToTarg < 150)
      { 
          if (%hasMortar)
             %useWeapon = "Mortar";
          else if (%hasDisc)
             %useWeapon = "Disc";
          else if (%hasBlaster)
             %useWeapon = "Blaster";                         
      }
      else if (%distToTarg < 300)
      {
          //if (%hasMissile)
            //%useWeapon = "MissileLauncher";
          if (%hasMortar)
               %useWeapon = "Mortar";
      }
      else
         %useWeapon = "NoAmmo";
   }
   //else see if we're VDestroying the object -- Made new mode just in case -- Lagg... 1-12-2003
   else if (%mode $= "VDestroy")
   {
      if (%distToTarg < 75)
      { 
          //if (%hasELF && %myEnergy > 0.4)
            //%useWeapon = ELFGun;
          if (%hasChain)
            %useWeapon = "Chaingun";
          else if (%hasDisc)
            %useWeapon = "Disc";
          else if (%hasPlasma)
            %useWeapon = "Plasma";
          else if (%hasBlaster)
            %useWeapon = "Blaster";          
      }
      else if (%distToTarg < 150)
      {
          if (%hasMissile)
            %useWeapon = "MissileLauncher"; 
          else if (%hasMortar)
             %useWeapon = "Mortar";
          else if (%hasDisc)
             %useWeapon = "Disc";
          else if (%hasBlaster)
             %useWeapon = "Blaster";
          else if (%hasChain)
             %useWeapon = "Chaingun";                         
      }
      else if (%distToTarg < 300)
      {
          if (%hasMissile)
            %useWeapon = "MissileLauncher";
          if (%hasMortar)
               %useWeapon = "Mortar";
      }
      else
         %useWeapon = "NoAmmo";
   }
   //else see if we're missiling the object
   else if (%mode $= "Missile" || %mode $= "MissileNoLock")
   {
      if (%distToTarg > 40)
      {
          if (%hasMissile)
         %useWeapon = "MissileLauncher";          
      }
      else
         %useWeapon = "NoAmmo";
   }

   //now select the weapon
   switch$ (%useWeapon)
   {
      case "Blaster":
         %client.player.use("Blaster");
         %client.setWeaponInfo("EnergyBolt", 25, 150, 1, 0.1);
      
      case "Plasma":
         %client.player.use("Plasma");
         %client.setWeaponInfo("PlasmaBolt", 25, 50);
      
      case "Chaingun":
         %client.player.use("Chaingun");
         %client.setWeaponInfo("ChaingunBullet", 30, 75, 150);
      
      case "Disc":
         %client.player.use("Disc");
         %client.setWeaponInfo("DiscProjectile", 30, 150);
      
      case "GrenadeLauncher":
         %client.player.use("GrenadeLauncher");
         %client.setWeaponInfo("BasicGrenade", 40, 75);
         
      case "Mortar":
         %client.player.use("Mortar");
         %client.setWeaponInfo("MortarShot", 40, 300);
         
      case "RepairPack"://added a little fix here - Lagg... 4-9-2003
	   if (%player.getImageState($BackpackSlot) $= "Idle")
	      %client.player.use("RepairPack");
         if (%player.getImageState($BackpackSlot) $= "Activate")
         {
            if(%client.player.getMountedImage($WeaponSlot).getName() !$= "RepairGunImage")
               %client.player.use("RepairPack");

            %client.setWeaponInfo("DefaultRepairBeam", 40, 75, 300, 0.1);
         }

         //if ( !%client.player.getImageTrigger( $BackpackSlot ) )
            //%client.player.setImageTrigger( $BackpackSlot, true );
         //if ( %client.player.getImageTrigger( $BackpackSlot ) )
            //%client.setWeaponInfo("DefaultRepairBeam", 40, 75, 300, 0.1);

      case "TargetingLaser":
         %client.player.use("TargetingLaser");
         %client.setWeaponInfo("BasicTargeter", 20, 300, 300, 0.1);
         
      case "MissileLauncher":
         %client.player.use("MissileLauncher");
         %client.setWeaponInfo("ShoulderMissile", 40, 300);

      case "ELFGun":
         %client.player.use("ELFGun");
         %client.setWeaponInfo("BasicELF", 25, 45, 90, 0.1);
         
      case "ShockLance":
         %client.player.use("ShockLance");
         %client.setWeaponInfo("BasicShocker", 0.5, 16, 1, 0.1);
         
      case "NoAmmo":
         %client.setWeaponInfo("NoAmmo", 30, 75);
   }
}

//-------------------------------------------

//big modifications here - Lagg... - 4-12-2003
function AIChooseEngageWeapon(%client, %targetClient, %distToTarg, %canUseEnergyStr, %environmentStr)
{
   //get some status
   %player = %client.player;
   if (!isObject(%player))
      return;

   %enemy = %targetClient.player;
   if (!isObject(%enemy))
      return;

   %enemyPos = %targetClient.player.getWorldBoxCenter();
        
   //added a check to call function for bots in vehicle - Lagg...
   if (%client.player.isMounted())
   {
      AIProcessVehicle(%client);//added this call to help bomber/gunner bot - Lagg...
      //check for LOS
      %vehicleLOS = "false";
      %mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::TSStaticShapeObjectType | $TypeMasks::VehicleObjectType;
      %vehicleLOS = !containerRayCast(%client.player.getWorldBoxCenter(), %enemyPos, %mask, 0);
      if (! %vehicleLos)
      {
         //clear the pressFire
	   %client.pressFire(-1);
         %client.setEngageTarget(-1);
         return;
      }
   }

   %canUseEnergy = (%canUseEnergyStr $= "true");
   %inWater = (%environmentStr $= "water");
   %outdoors = (%environmentStr $= "outdoors");
   %targVelocity = %targetClient.player.getVelocity();
   %targEnergy = %targetClient.player.getEnergyPercent();
   %targDamage = %targetClient.player.getDamagePercent();
   %myEnergy = %player.getEnergyPercent();
   %myDamage = %player.getDamagePercent();
   %hasLOS = %client.hasLOSToClient(%targetClient);//added - Lagg...
   %myArmor = %player.getArmorSize();//added - Lagg...
        
   //added this here to fix for elf gun - Lagg...
   %speed = VectorDist("0 0 0", %targVelocity);
   %myZ = getWord(%player.getTransform(), 2);
   %targetZ = getWord(%enemy.getTransform(), 2);
   %targetZVel = getWord(%targVelocity, 2);

   //find out the enemy's altitude - lagg...
   //%enemyPos = %targetClient.player.getWorldBoxCenter();
   %mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType | $TypeMasks::ForceFieldObjectType;
   %downVect = getWord(%enemyPos, 0) @ " " @ getWord(%enemyPos, 1) @ "0";
   %altSur = containerRayCast(%enemyPos, %downVec, %mask, 0);
   %altPos = posfromRayCast(%altSur);
   %enemyAlt = getWord(%enemyPos, 2) - getWord(%altPos, 2);

   //lets get the enemy's heat
   %targetHeat = %targetClient.player.getHeat();        

   %client.enviroment = %inwater; // Capto Lamia for this one
   //%client.enviromental = %outdoors;// not used standing on a roof counts as indoors :(
         
   //get our inventory
   %hasBlaster = (%player.getInventory("Blaster") > 0) && %canUseEnergy;
   %hasPlasma = (%player.getInventory("Plasma") > 0) && (%player.getInventory("PlasmaAmmo") > 0) && !%inWater;
   %hasChain = (%player.getInventory("Chaingun") > 0) && (%player.getInventory("ChaingunAmmo") > 0);
   %hasDisc = (%player.getInventory("Disc") > 0) && (%player.getInventory("DiscAmmo") > 0);
   %hasGrenade = (%player.getInventory("GrenadeLauncher") > 0) && (%player.getInventory("GrenadeLauncherAmmo") > 0) && !%inWater;
   %hasSniper = (%player.getInventory("SniperRifle") > 0) && (%player.getInventory("EnergyPack") > 0) && %canUseEnergy && !%inWater;
   %hasELF = (%player.getInventory("ELFGun") > 0) && %canUseEnergy && !%inWater;
   %hasMortar = (%player.getInventory("Mortar") > 0) && (%player.getInventory("MortarAmmo") > 0) && !%inWater;
   %hasMissile = (%player.getInventory("MissileLauncher") > 0) && (%player.getInventory("MissileLauncherAmmo") > 0) && !%inWater;
   %hasShockLance = (%player.getInventory("ShockLance") > 0) && %canUseEnergy && !%inWater;
   
   //choose the weapon
   %useWeapon = "NoAmmo";

   //first, see if it's a pilot we're shooting    --------------------------- Fix Lagg... 11/24/2002
   //this one makes a big differance in the way bots handle vehicles :)
   //if (%dist > 50 && %enemy.isMounted() > 0 && %hasMissile)
   if (%distToTarg > 40 && %enemy.isMounted() > 0 && %hasMissile)
      %useWeapon = "MissileLauncher";
   else if (%distToTarg < 10 && %hasShockLance)
      %useWeapon = "ShockLance";
   else if (%distToTarg < 15)
   {
      if (%outdoors && %hasMissile && %enemyAlt > 40.0 && %targetHeat > 0.69 && %hasLOS)
      {
         %client.aimAt(%targetClient, 3000);
         %useWeapon = "MissileLauncher";
      }  
      else if (%hasShockLance && (%myArmor $= "Light" || %myArmor $= "Medium"))//added so assassin bots kill like assassins :) - Lagg...
         %useWeapon = "ShockLance"; 
      else if (%hasELF && %myEnergy > 0.5 && %targEnergy > 0.3 && %myDamage < %targDamage && %targetZ > %myZ + 10)
         %useWeapon = "ELFGun";
      else if (%hasChain && %hasLOS)//added los check - Lagg...
         %useWeapon = "Chaingun";
      else if (%hasBlaster)
         %useWeapon = "Blaster";
      else if (%hasELF && %targEnergy > 0.2)
	 %useWeapon = "ELFGun";
      else if (%hasPlasma && %hasLOS)//added los check - Lagg...
	 %useWeapon = "Plasma";
      else if (%hasDisc)
         %useWeapon = "Disc";
      else if (%hasShockLance)
	 %useWeapon = "ShockLance";
   }
   else if (%distToTarg < 40)
   {
      if (%outdoors && %hasMissile && %enemyAlt > 40.0 && %targetHeat > 0.69 && %hasLOS)
      {
         %client.aimAt(%targetClient, 3000);
         %useWeapon = "MissileLauncher";
      }         
      else if (%hasELF && %targEnergy > 0.4 && (%myDamage < 0.3 || %myDamage - %targDamage < 0.2) && %targetZ > %myZ + 10)
         %useWeapon = "ELFGun";
      else if (!%outdoors && %hasPlasma && %hasLOS)//added los check - Lagg...
	 %useWeapon = "Plasma";
      else if (!%outdoors && %hasMortar && %enemyAlt < 10.0 && %hasLOS)//added los check - Lagg...
	 %useWeapon = "Mortar";
      else if (%hasChain && %hasDisc && %hasLOS)//added los check - Lagg...
      {         
         if (%speed > 15.0 || %targetZ > %myZ || %targetZVel > 1.0)
            %useWeapon = "Chaingun";
         else
            %useWeapon = "Disc";
      }
      else if (%hasPlasma && %hasLOS)//added los check - Lagg...
	 %useWeapon = "Plasma";
      else if (%hasChain && %hasLOS)//added los check - Lagg...
         %useWeapon = "Chaingun";
      else if (%hasDisc)
         %useWeapon = "Disc";
      else if (%hasBlaster)
         %useWeapon = "Blaster";
   }
   else if (%distToTarg < 60)
   {
      //if (%outdoors && %hasMissile && %speed > 12.0 && %targEnergy < 0.4 && %hasLOS)
      if (%outdoors && %hasMissile && %enemyAlt > 10.0 && %targetHeat > 0.69 && %hasLOS)
      {
         %client.aimAt(%targetClient, 3000);
         %useWeapon = "MissileLauncher";
      }         
      else if (%hasGrenade && %enemyAlt < 10.0 && %hasLOS)
         %useWeapon = "GrenadeLauncher";
      else if (%hasMortar && %enemyAlt < 10.0 && %hasLOS)
	   %useWeapon = "Mortar";
      else if (%hasDisc)
         %useWeapon = "Disc";
      else if (%hasSniper && %myEnergy > 0.6)
         %useWeapon = "SniperRifle";
      else if (%hasChain && %hasLOS)//added los check - Lagg...
         %useWeapon = "Chaingun";
      else if (%hasBlaster)
         %useWeapon = "Blaster";

   }
   else if (%distToTarg < 80)
   {       
      //if (%outdoors && %hasMissile && %speed > 12.0 && %targEnergy < 0.4 && %hasLOS)
      if (%outdoors && %hasMissile && %enemyAlt > 10.0 && %targetHeat > 0.69 && %hasLOS)
      {
         %client.aimAt(%targetClient, 3000);
         %useWeapon = "MissileLauncher";
      }        
      else if (%hasSniper && %myEnergy > 0.4)
         %useWeapon = "SniperRifle";
      else if (%hasMortar && %enemyAlt < 5.0 && %hasLOS)//added los check - Lagg...
         %useWeapon = "Mortar";
      else if (%hasDisc)
         %useWeapon = "Disc";
      else if (%hasChain && %hasLOS)//added los check - Lagg...
         %useWeapon = "Chaingun";
      else if (%hasBlaster)
         %useWeapon = "Blaster";    
   }
   else if (%distToTarg < 150)
   {  
      //if (%outdoors && %hasMissile && %speed > 12.0 && %targEnergy < 0.4 && %hasLOS)
      if (%outdoors && %hasMissile && %targetHeat > 0.69 && %hasLOS)
      {
         %client.aimAt(%targetClient, 3000);
         %useWeapon = "MissileLauncher";
      }        
      else if (%hasSniper && %myEnergy > 0.4)
         %useWeapon = "SniperRifle";
      else if (%hasMortar && %hasLOS)//added los check - Lagg...
         %useWeapon = "Mortar";
      else if (%hasDisc)
         %useWeapon = "Disc";
      else if (%hasBlaster)
         %useWeapon = "Blaster";    
   }
   else
   {
      //if (%outdoors && %hasMissile && %speed > 12.0 && %targEnergy < 0.4 && %hasLOS)
      if (%outdoors && %hasMissile && %targetHeat > 0.69 && %hasLOS)
      {
         %client.aimAt(%targetClient, 3000);
         %useWeapon = "MissileLauncher";
      }
      else if (%hasSniper)
	    %useWeapon = "SniperRifle";           
      else if (%hasMortar && %hasLOS)//added los check - Lagg...
	    %useWeapon = "Mortar";
   }
   //now make sure we actually selected something
   if (%useWeapon $= "NoAmmo")
   {
      if (%hasDisc)
         %useWeapon = "Disc";
      else if (%hasChain && %hasLOS)//added los check - Lagg...
         %useWeapon = "Chaingun";
      else if (%hasPlasma && %hasLOS)//added los check - Lagg...
         %useWeapon = "Plasma";
      else if (%hasBlaster)
         %useWeapon = "Blaster";
      else if (%hasELF)
         %useWeapon = "ELFGun";
      else if (%hasSniper)
         %useWeapon = "SniperRifle";
      else if (%hasShockLance)
         %useWeapon = "ShockLance";
      else if (%hasGrenade && %hasLOS)//added los check - Lagg...
         %useWeapon = "GrenadeLauncher";
      //else if (%outdoors && %hasMissile && %speed > 12.0 && %targEnergy < 0.4 && %hasLOS)
      else if (%outdoors && %hasMissile && %targetHeat > 0.69 && %hasLOS)
      {
         %client.aimAt(%targetClient, 3000);
         %useWeapon = "MissileLauncher";
      }
      else if (%hasMortar && %hasLOS)//added los check - Lagg...
         %useWeapon = "Mortar";
   }

   //now select the weapon
   switch$ (%useWeapon)
   {
      case "Blaster":
         %client.player.use("Blaster");
         %client.setWeaponInfo("EnergyBolt", 25, 150, 1, 0.1);
         
      case "Plasma":
         %client.player.use("Plasma");
         %client.setWeaponInfo("PlasmaBolt", 25, 50);
      
      case "Chaingun":
         %client.player.use("Chaingun");
         %client.setWeaponInfo("ChaingunBullet", 15, 75, 150);
         
      case "Disc":
         %client.player.use("Disc");
         %client.setWeaponInfo("DiscProjectile", 30, 150);
         
      case "GrenadeLauncher":
         %client.player.use("GrenadeLauncher");
         %client.setWeaponInfo("BasicGrenade", 40, 75);
         
      case "SniperRifle":
         %client.player.use("SniperRifle");
         %client.setWeaponInfo("BasicSniperShot", 40, 700, 1, 0.75, 0.5);

      case "ELFGun":
         %client.player.use("ELFGun");
         %client.setWeaponInfo("BasicELF", 25, 45, 90, 0.1);
         
      case "ShockLance":
         %client.player.use("ShockLance");
         %client.setWeaponInfo("BasicShocker", 0.5, 16, 1, 0.1);
         
      case "MissileLauncher":
         %client.aimAt(%targetClient, 4000);
         %client.player.use("MissileLauncher");
         %client.setWeaponInfo("ShoulderMissile", 41, 300);
         
      case "Mortar":
         %client.player.use("Mortar");
         %client.setWeaponInfo("MortarShot", 40, 400);
         
      case "NoAmmo":
         %client.setWeaponInfo("NoAmmo", 30, 75);
   }
}

//function is called once per frame, to handle packs, healthkits, grenades, etc...
//heh heh heh this one was fun to do - Lagg... - 12-2003
function AIProcessEngagement(%client, %target, %type, %projectile)
{
   %player = %client.player;
   if (!isObject(%player))
      return;

   //make sure we're still alive
   if (!AIClientIsAlive(%client))
      return;

   //clear the pressFire
   %client.pressFire(-1);

   //LEAVE THIS OUT OR FLARES NO WORK !!!
   //added a check to call function for bots in vehicle - Lagg...
   //if (%client.player.isMounted())
   //{
   //AIProcessVehicle(%client);//added this call to help bomber bot - Lagg...
   //check for LOS
   //%vehicleLOS = "false";
   //%mask = $TypeMasks::TerrainObjectType | $TypeMasks::InteriorObjectType |
   //$TypeMasks::TSStaticShapeObjectType | $TypeMasks::VehicleObjectType;
   //%vehicleLOS = !containerRayCast(%client.player.getWorldBoxCenter(), %enemyPos, %mask, 0);
   //if (! %vehicleLos)
   //{
   //clear the pressFire
   //%client.pressFire(-1);
   //%client.setEngageTarget(-1);
   //return;
   //}
   //}

   %inwater = %client.enviroment; // Capto Lamia for this one --
   %outdoors = %client.enviromental;

   //see if we have to use a repairkit
   %mounted = %player.isMounted();
   %myEnergy = %player.getEnergyPercent();//added for cloaking and sensorjammer packs - Lagg... - 4-9-2003
   //%tur = -1;//added for cloaking and sensorjammer packs - Lagg... - 4-9-2003

   if (%client.getSkillLevel() > 0.1 && %player.getDamagePercent() > 0.3 && %player.getInventory("RepairKit") > 0)
   {
      //add in a "skill" value to delay the using of the repair kit for up to 10 seconds...
      %elapsedTime = getSimTime() - %client.lastDamageTime;
      %skillValue = (1.0 - %client.getSkillLevel()) * (1.0 - %client.getSkillLevel());
      if (%elapsedTime > (%skillValue * 20000))
         %player.use("RepairKit");
   }

   //see if we've been blinded
   if (%player.getWhiteOut() > 0.6)
      %client.setBlinded(2000);

   //else see if there's a grenade in the vicinity...
   else
   {
      %count = $AIGrenadeSet.getCount();
      for (%i = 0; %i < %count; %i++)
      {
         %grenade = $AIGrenadeSet.getObject(%i);

         //make sure the grenade isn't ours
         //if (%grenade.sourceObject.client != %client) //----- taken out Lagg... 11/24/2002
         //{  //----------------------------------------------- taken out Lagg... 11/24/2002
         // A grenade is a danger no matter who threw it. Has great effect when mortaring
         //see if it's within 15 m
         if (VectorDist(%grenade.position, %client.player.position) < 15)
         {
            %client.setDangerLocation(%grenade.position, 30);
            break;
         }
         //}  //----------------------------------------------- taken out Lagg... 11/24/2002
      }
   }

   //if we're being hunted by a seeker projectile, throw a flare grenade
   //modified from Capto Lamias tailgunner script ------------------------------ Lagg... 1-13-2003
   //the bots will flare to protect any team owned object if in range to do so
   if (%player.getInventory("FlareGrenade") > 0)
   {
      %missileCount = MissileSet.getCount();
      for (%i = 0; %i < %missileCount; %i++)
      {
         %missile = MissileSet.getObject(%i);
         %missileTarg = (%missile.getTargetObject());
         if (%missileTarg.Team == %client.Team)
         {
            //see if the missile is within range
            if (VectorDist(%missile.getTransform(), %player.getTransform()) < 150)
            {
               if (VectorDist(%missileTarg.getTransform(), %player.getTransform()) < 75)
               {
                  %player.throwStrength = 2;
                  %player.use("FlareGrenade");
                  break;
               }
            }
         }
      }
   }

   //see what we're fighting
   switch$ (%type)
   {
      case "player":
         //make sure the target is alive
         if (AIClientIsAlive(%target))
         {
            //if the target is in range, and within 10-40 m, & heading in this direction,use grenade
            //but not if we are mounted in a vehicle - Lagg...
            if (!$AIDisableGrenades && %client.getSkillLevel() >= 0.3 && !%inwater && !%isMounted)
            {
               if (%player.getInventory("Grenade") > 0)
                  %grenadeType = "Grenade";
               else if (%player.getInventory("FlashGrenade") > 0)
                  %grenadeType = "FlashGrenade";
               else if (%player.getInventory("ConcussionGrenade") > 0)
                  %grenadeType = "ConcussionGrenade";
               //--------------------------------Capto Lamia for this one as well
               else if (%player.getInventory("Mine") > 0)
                  %grenadeType = "Mine";
               else %grenadeType = "";

               if (%grenadeType !$= "" && %client.targetInSight())
               {
                  //see if the predicted location of the target is within 10m 
                  %targPos = %target.player.getWorldBoxCenter();
                  %clientPos = %player.getWorldBoxCenter();

                  //make sure we're not *way* above the target
                  if (getWord(%clientPos, 2) - getWord(%targPos, 2) < 3)
                  {
                     %dist = VectorDist(%targPos, %clientPos);
                     %direction = VectorDot(VectorSub(%clientPos, %targPos), %target.player.getVelocity());  
                     %facing = VectorDot(VectorSub(%client.getAimLocation(), %clientPos), VectorSub(%targPos, %clientPos));
                     if (%dist > 20 && %dist < 45 && (%direction > 0.9 || %direction < -0.9) && (%facing > 0.9))
                     {
                        %player.throwStrength = 1.0;
                        %player.use(%grenadeType);
                     }
                  }
               }
            }
            //see if we have a shield pack that we need to use
            if (%player.getInventory("ShieldPack") > 0)
            {
               if (%projectile > 0 && %player.getImageState($BackpackSlot) $= "Idle")
                  %player.use("Backpack");
               else if (%projectile <= 0 && %player.getImageState($BackpackSlot) $= "activate")
                  %player.use("Backpack");
            }
            //see if we have a cloaking pack that we need to use -----Capto Lamia - Lagg modified... 4-13-2003
            if (%player.getInventory("CloakingPack") > 0)
            {
               if (%player.getImageState($BackpackSlot) $= "Idle" && %myEnergy > 0.4)
                  %player.use("Backpack");
               else if (%player.getImageState($BackpackSlot) $= "activate" && %myEnergy < 0.4)
                  %player.use("Backpack");
            }
            //see if we have a sensor jammer pack that we need to use ---------Capto Lamia - Lagg modified... 4-13-2003
            //thinking about a radius search for turrets, sensors, ect... - Lagg 1-13-2003
           if (%player.getInventory("SensorJammerPack") > 0)
           {
              if (%player.getImageState($BackpackSlot) $= "Idle" && %myEnergy > 0.4 && %client.targetInRange())
                 %player.use("Backpack");
              else if (%player.getImageState($BackpackSlot) $= "activate" && (%myEnergy < 0.4 || !%client.targetInRange()))
                 %player.use("Backpack");
           }
        }

      case "object":
         %hasGrenade = %player.getInventory("Grenade") > 0;
         if (%hasGrenade && %client.targetInRange() && !%inwater && !%mounted)
         {
            %targPos = %target.getWorldBoxCenter();
            %myPos = %player.getWorldBoxCenter();
            %dist = VectorDist(%targPos, %myPos);
            if (%dist > 5 && %dist < 20)
            {
               %player.throwStrength = 1.0;
               %player.use("Grenade");
            }
         }
         //Capto Lamia, add it here as well---------------- Lagg... 1-12-2003
         %hasmine = %player.getInventory("Mine") > 0;
         if (%hasMine && %client.targetInRange() && !%inwater)
         {
            //only throw a mine when killing gens or invos - Lagg... 4-12-2003
            %targ = %target.getDataBlock().getName();
            if ((%targ $= "StationInventory") || (%targ $= "GeneratorLarge") || (%targ $= "StationVehicle"))
            {
               %targPos = %target.getWorldBoxCenter();
               %myPos = %player.getWorldBoxCenter();
               %dist = VectorDist(%targPos, %myPos);
               if (%dist > 5 && %dist < 20)
               {
                  %player.throwStrength = 1.0;
                  %player.use("Mine");
               }
            }
         }
         //see if we have a cloaking pack that we need to use -----Capto Lamia - Lagg modified... 4-13-2003
         if (%player.getInventory("CloakingPack") > 0)
         {
            if (%player.getImageState($BackpackSlot) $= "Idle" && %myEnergy > 0.4 && %client.targetInRange())
               %player.use("Backpack");
            else if (%player.getImageState($BackpackSlot) $= "activate" && (%myEnergy < 0.4 || !%client.targetInRange()))
               %player.use("Backpack");
         }
         //see if we have a sensor jammer pack that we need to use ---------Capto Lamia
         //thinking about a radius search for turrets, sensors, ect... - Lagg 1-13-2003
         if (%player.getInventory("SensorJammerPack") > 0 && %client.targetInRange())
         {
            if (%player.getImageState($BackpackSlot) $= "Idle" && %myEnergy > 0.4 && %client.targetInRange())
               %player.use("Backpack");
            else if (%player.getImageState($BackpackSlot) $= "activate" && (%myEnergy < 0.4 || !%client.targetInRange()))
               %player.use("Backpack");
         }

      case "none":
         //use the repair pack if we have one and not right next to a target - Lagg... 3-29-2003
         if (%player.getDamagePercent() > 0 && %player.getInventory(RepairPack) > 0 && !%client.targetInRange())
         {
            //if (%player.getImageState($BackpackSlot) $= "Idle")
		//%client.player.use("RepairPack");
            //else if (%player.getImageState($BackpackSlot) $= "activate")
            //sustain the fire for 30 frames - this callback is timesliced...
            //%client.pressFire(30);
            //if (%player.getImageState($BackpackSlot) !$= "activate")
            //clear the fire if not using repairpack - Lagg... - 4-9-2003
            //%client.pressFire(-1);

            if (%player.getImageState($BackpackSlot) !$= "activate")
		   %client.player.use("RepairPack");
            else if (isObject(%client.player.getMountedImage($WeaponSlot)) && %client.player.getMountedImage($WeaponSlot).getName() $= "RepairGunImage")
               //sustain the fire for 30 frames - this callback is timesliced...
               %client.pressFire(30);
            else if (!isObject(%client.player.getMountedImage($WeaponSlot)) || %client.player.getMountedImage($WeaponSlot).getName() !$= "RepairGunImage")
               //clear the fire if not using repairpack - Lagg... - 4-9-2003
               %client.pressFire(-1);
         }           
   }
}

//------------------------------------------------------------------------------

function AIFindClosestInventory(%client, %armorChange)
{
   %closestInv = -1;
   %closestDist = 32767;

   %depCount = 0;
   %depGroup = nameToID("MissionCleanup/Deployables");
   if (%depGroup > 0)
      %depCount = %depGroup.getCount();

   // there exists a deployed station, lets find it
   if(!%armorChange && %depCount > 0)
   {
      for(%i = 0; %i < %depCount; %i++)
      {
         %obj = %depGroup.getObject(%i);
         
         if(%obj.getDataBlock().getName() $= "DeployedStationInventory" && %obj.team == %client.team && %obj.isEnabled())
         {
            //make sure the inventory station is not blocked - lets add a check for parked vehicles :) - Lagg... 2-25-2004
	      %invLocation = %obj.getWorldBoxCenter();
            InitContainerRadiusSearch(%invLocation, 12, $TypeMasks::VehicleObjectType);
            %objSrch = containerSearchNext();

            %distance = %client.getPathDistance(%obj.getTransform());
            if (%distance > 0 && %distance < %closestDist && !%objSrch)
            {   
               %closestInv = %obj;
               %closestDist = %distance;              
            }
         }   
      }
   }
   
   // still check if there is one that is closer
   %invCount = $AIInvStationSet.getCount();
   for (%i = 0; %i < %invCount; %i++)
   {
      %invStation = $AIInvStationSet.getObject(%i);
      if (%invStation.team <= 0 || %invStation.team == %client.team)
      {
         //error("DEBUG: found an inventory station: " @ %invStation @ "  status: " @ %invStation.isPowered());
         //make sure the station is powered
         if (!%invStation.isDisabled() && %invStation.isPowered())
         {
            %dist = %client.getPathDistance(%invStation.getTransform());
            if (%dist > 0 && %dist < %closestDist)
            {
               %closestInv = %invStation;
               %closestDist = %dist;
            }
         }
      }
   }
   return %closestInv @ " " @ %closestDist;
}

//------------------------------
//find the closest inventories for the objective weight functions
function AIFindClosestInventories(%client)
{
   %closestInv = -1;
   %closestDist = 32767;
   %closestRemoteInv = -1;
   %closestRemoteDist = 32767;
   
   %depCount = 0;
   %depGroup = nameToID("MissionCleanup/Deployables");
	
   //first, search for the nearest deployable inventory station
   if (isObject(%depGroup))
   {
      %depCount = %depGroup.getCount();
      for (%i = 0; %i < %depCount; %i++)
      {
         %obj = %depGroup.getObject(%i);
         if (%obj.getDataBlock().getName() $= "DeployedStationInventory" && %obj.team == %client.team && %obj.isEnabled())
         {
            //make sure the inventory station is not blocked - lets add a check for parked vehicles :) - Lagg... 2-25-2004
	      %invLocation = %obj.getWorldBoxCenter();
            InitContainerRadiusSearch(%invLocation, 12, $TypeMasks::VehicleObjectType);
            %objSrch = containerSearchNext();

            %distance = %client.getPathDistance(%obj.getTransform());
            if (%distance > 0 && %distance < %closestRemoteDist && !%objSrch)
            {   
               %closestRemoteInv = %obj;
               %closestRemoteDist = %distance;              
            }
         }
      }
   }
   
   // now find the closest regular inventory station
   %invCount = $AIInvStationSet.getCount();
   for (%i = 0; %i < %invCount; %i++)
   {
      %invStation = $AIInvStationSet.getObject(%i);
      if (%invStation.team <= 0 || %invStation.team == %client.team)
      {
         //make sure the station is powered
         if (!%invStation.isDisabled() && %invStation.isPowered())
         {
            %dist = %client.getPathDistance(%invStation.getTransform());
            if (%dist > 0 && %dist < %closestDist)
            {
               %closestInv = %invStation;
               %closestDist = %dist;
            }
         }
      }
   }

   //if the regular inv station is closer than the deployed, don't bother with the remote
   if (%closestDist < %closestRemoteDist)
      %returnStr = %closestInv SPC %closestDist;
   else
      %returnStr = %closestInv SPC %closestDist SPC %closestRemoteInv SPC %closestRemoteDist;

   return %returnStr;
}

//new function called from AIAttackObject and AIdestroyObject and aiDetectVehiculeTask - Lagg... - 4-12-2003
function AIAttackOutofAmmo(%client)
{
   //this function only cares about weapons used in engagement...
   //no mortars, or missiles - yeah right...Lagg
   %player = %client.player;
   if (!isObject(%player))
      return false;

   %ammoWeapons = 0;
   %energyWeapons = 0;
   
   //get our inventory
   %hasBlaster = (%player.getInventory("Blaster") > 0); 
   %hasPlasma  = (%player.getInventory("Plasma") > 0); 
   %hasChain   = (%player.getInventory("Chaingun") > 0); 
   %hasDisc    = (%player.getInventory("Disc") > 0); 
   %hasGrenade = (%player.getInventory("GrenadeLauncher") > 0); 
   %hasSniper  = (%player.getInventory("SniperRifle") > 0) && (%player.getInventory("EnergyPack") > 0);
   %hasELF     = (%player.getInventory("ELFGun") > 0); 
   %hasMortar  = (%player.getInventory("Mortar") > 0); 
   %hasMissile = (%player.getInventory("MissileLauncher") > 0);
   %hasLance   = (%player.getInventory("ShockLance") > 0);
   
   if (%hasBlaster || %hasSniper || %hasElf || %hasLance)
      return false;
   else
   {
      // we only have ammo type weapons
      if(%hasDisc && (%player.getInventory("DiscAmmo") > 0))
         return false;
      else if(%hasChain && (%player.getInventory("ChainGunAmmo") > 0))
         return false;
      else if(%hasGrenade && (%player.getInventory("GrenadeLauncherAmmo") > 0))
         return false;
      else if(%hasPlasma && (%player.getInventory("PlasmaAmmo") > 0))
         return false;
      else if(%hasMissile && (%player.getInventory("MissileLauncherAmmo") > 0))
         return false;
      else if(%hasMortar && (%player.getInventory("MortarAmmo") > 0))
         return false;
   }   
   return true; // were out!
}

//------------------------------------------------------------------------------------------------

//AI Equipment Configs
$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "EnergyPack";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "ConcussionGrenade";
$AIEquipmentSet[HeavyEnergyDefault, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "AmmoPack";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "ConcussionGrenade";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "ShieldPack";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "ELFGun";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "FlareGrenade";
//$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "ShieldPack";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "FlashGrenade";
$AIEquipmentSet[HeavyShieldOff, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "SensorJammerPack";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "FlashGrenade";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "RepairPack";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "ShockLance";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "FlareGrenade";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "TurretIndoorDeployable";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "FlashGrenade";
//$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "TurretOutdoorDeployable";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "FlareGrenade";
$AIEquipmentSet[HeavyOutdoorTurretSet, $EquipConfigIndex++] = "Mine";


$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "InventoryDeployable";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "ShockLance";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "FlashGrenade";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "AmmoPack";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "FlareGrenade";
$AIEquipmentSet[HeavyTailgunner, $EquipConfigIndex++] = "Mine";

//------------------------------

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "RepairPack";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "ShockLance";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "FlareGrenade";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "ShieldPack";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "FlareGrenade";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "EnergyPack";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "ELFGun";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "ConcussionGrenade";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "AmmoPack";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "PlasmaAmmoAmmo";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "ShockLance";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "TurretOutdoorDeployable";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "FlareGrenade";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "TurretIndoorDeployable";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "ShockLance";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "FlashGrenade";
//$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "InventoryDeployable";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "FlashGrenade";
//$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "PulseSensorDeployable";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "ConcussionGrenade";
$AIEquipmentSet[MediumPulseSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "MotionSensorDeployable";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "CameraGrenade";
//$AIEquipmentSet[MediumMotionSet, $EquipConfigIndex++] = "Mine";

//------------------------------

$EquipConfigIndex = -1;
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "Light";
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "EnergyPack";
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "FlareGrenade";
//$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "Light";
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "EnergyPack";
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "SniperRifle";
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "FlareGrenade";
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "Light";
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "EnergyPack";
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "ELFGun";
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "ConcussionGrenade";
//$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "Light";
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "ShieldPack";
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "FlareGrenade";
//$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "Light";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "CloakingPack";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "ShockLance";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "FlashGrenade";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "Light";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "RepairPack";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "Blaster";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "Grenade";
//$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "Light";
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "EnergyPack";
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "SniperRifle";
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "FlareGrenade";
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "Mine";

//new set - Lagg...
$EquipConfigIndex = -1;
$AIEquipmentSet[LightCameraSet, $EquipConfigIndex++] = "Light";
$AIEquipmentSet[LightCameraSet, $EquipConfigIndex++] = "MotionSensorDeployable";
$AIEquipmentSet[LightCameraSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[LightCameraSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[LightCameraSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[LightCameraSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[LightCameraSet, $EquipConfigIndex++] = "ShockLance";
$AIEquipmentSet[LightCameraSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[LightCameraSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[LightCameraSet, $EquipConfigIndex++] = "CameraGrenade";
//$AIEquipmentSet[LightCameraSet, $EquipConfigIndex++] = "Mine";

//new set - Lagg...
$EquipConfigIndex = -1;
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "Light";
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "SensorJammerPack";
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "FlareGrenade";
$AIEquipmentSet[LightSensorJammer, $EquipConfigIndex++] = "Mine";
