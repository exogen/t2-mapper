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
	%client.buyInvTime = %buyInvTime;		//used to mark the begining of the inv buy session
	%client.invToUse = %closestInv;			//used if we need to go to an alternate inv station
	%client.invWaitTime = "";					//used to track how long we've been waiting
	%client.invBuyList = %inventorySet;		//the list/set of items we're going to buy...
	%client.buyingSet = %buyingSet;			//whether it's a list or a set...
	%client.isSeekingInv = false;
   %client.seekingInv = "";

	//now process the state machine
	return AIProcessBuyInventory(%client);
}

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
	if (! (%closestInv > 0 && isObject(%closestInv) &&
		(%closestInv.team <= 0 || %closestInv.team == %client.team) && %closestInv.isEnabled()))
	{
		//reset the state machine
		%client.buyInvTime = 0;
		return "InProgress";
	}

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
         %player.setInventory(%item, %quantity);

			//get the next item
			%index++;
			if (%buyingSet)
				%item = $AIEquipmentSet[%inventorySet, %index];
			else
				%item = getWord(%inventorySet, %index);
		}

		//put a weapon in the bot's hand...
		%player.cycleWeapon();

		//return a success
		return "Finished";
	}

	//else, keep moving towards the inv station
	else
	{
		if (isObject(%closestInv) && isObject(%closestInv.trigger))
		{
			//quite possibly we may need to deal with what happens if a bot doesn't have a path to the inv...
			//the current premise is that no inventory stations are "unpathable"...
			//if (%client.isSeekingInv)
			//{
			//   %dist = %client.getPathDistance(%closestInv.trigger.getWorldBoxCenter());
			//	if (%dist < 0)
			//		error("DEBUG Tinman - still need to handle bot stuck trying to get to an inv!");
			//}
													
			%client.stepMove(%closestInv.trigger.getWorldBoxCenter(), 1.5);
			%client.isSeekingInv = true;
		}
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

function AIMustUseRegularInvStation(%equipmentList, %client)
{
	%clientArmor = %client.player.getArmorSize();

	//first, see if the set contains an item not available
	%needRemoteInv = false;
	%index = 0;
   %item = getWord(%equipmentList, 0);
   while (%item !$= "")
	{
		if (%item $= "InventoryDeployable" || (%clientArmor !$= "Light" && %item $= "SniperRifle") ||
			(%clientArmor $= "Light" && (%item $= "Mortar" || %item $= "MissileLauncher")))
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
	if (%needArmor != %client.player.getArmorSize())
		return true;

	//we must be fine...
	return false;
}

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
	if (%type $= "RepairPack" || %type $= "EnergyPack" || %type $= "ShieldPack" ||
																			%type $= "CloakingPack" || %type $= "AmmoPack")
	{
		if (%client.player.getMountedImage($BackpackSlot) <= 0)
			return true;
		else
			return false;
	}

   //if the item is acutally, a corpse, check the corpse inventory...
   if (%item.isCorpse)
   {
      %corpse = %item;
      if (%corpse.getInventory("ChainGunAmmo") > 0 && %player.getInventory(%type) < %playerDataBlock.max[ChainGunAmmo])
         return true;
      if (%corpse.getInventory("PlasmaAmmo") > 0 && %player.getInventory(%type) < %playerDataBlock.max[PlasmaAmmo])
         return true;
      if (%corpse.getInventory("DiscAmmo") > 0 && %player.getInventory(%type) < %playerDataBlock.max[DiscAmmo])
         return true;
      if (%corpse.getInventory("GrenadeLauncher") > 0 && %player.getInventory(%type) < %playerDataBlock.max[GrenadeLauncher])
         return true;
      if (%corpse.getInventory("MortarAmmo") > 0 && %player.getInventory(%type) < %playerDataBlock.max[MortarAmmo] && %player.getInventory("Mortar") > 0)
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
		   if (%type $= "Grenade" || %type $= "FlashGrenade" || %type $= "ConcussionGrenade")
			   return true;
	   }

	   //see if we can carry another weapon...
	   if (AICanPickupWeapon(%client, %type))
		   return true;
   }

	//guess we didn't find anything useful...  (should still check for mines and grenades)
   return false;
}

function AIEngageOutofAmmo(%client)
{
	//this function only cares about weapons used in engagement...
	//no mortars, or missiles
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
   }   
   return true; // were out!
}

function AICanPickupWeapon(%client, %weapon)
{
	//first, make sure it's not a weapon we already have...
	%player = %client.player;
	if (!isObject(%player))
		return false;

	%armor = %player.getArmorSize();
	if (%player.getInventory(%weapon) > 0)
		return false;

	//make sure the %weapon given is a weapon they can use for engagement
	if (%weapon !$= "Blaster" && %weapon !$= "Plasma" && %weapon !$= "Chaingun" && %weapon !$= "Disc" &&
			%weapon !$= "GrenadeLauncher" && %weapon !$= "SniperRifle" && %weapon !$= "ELFGun" && %weapon !$= "ShockLance")
	{
		return false;
	}

	%weaponCount = 0;
	if (%player.getInventory("Blaster") > 0)
		%weaponCount++;
	if (%player.getInventory("Plasma") > 0)
		%weaponCount++;
	if (%player.getInventory("Chaingun") > 0)
		%weaponCount++;
	if (%player.getInventory("Disc") > 0)
		%weaponCount++;
	if (%player.getInventory("GrenadeLauncher") > 0)
		%weaponCount++;
	if (%player.getInventory("SniperRifle") > 0)
		%weaponCount++;
	if (%player.getInventory("ELFGun") > 0)
		%weaponCount++;
	if (%player.getInventory("Mortar") > 0)
		%weaponCount++;
	if (%player.getInventory("MissileLauncher") > 0)
		%weaponCount++;
	if (%player.getInventory("ShockLance") > 0)
		%weaponCount++;

	if ((%armor $= "Light" && %weaponCount < 3) || (%armor $= "Medium" && %weaponCount < 4) ||
																	(%armor $= "Heavy" && %weaponCount < 5))
	{
		if ((%type $= "Mortar" && %armor !$= "Heavy") || (%type $= "MissileLauncher" && %armor $= "Light") ||
																			(%type $= "SniperRifle" && %armor !$= "Light"))
			return false;
		else
			return true;
	}

	//else we're full of weapons already...
	return false;
}

function AIEngageWeaponRating(%client)
{
   %player = %client.player;
	if (!isObject(%player))
		return;

	%playerDataBlock = %client.player.getDataBlock();
   
   //get our inventory
   %hasBlaster = (%player.getInventory("Blaster") > 0); 
   %hasPlasma  = (%player.getInventory("Plasma") > 0 && %player.getInventory("PlasmaAmmo") >= 1); 
   %hasChain   = (%player.getInventory("Chaingun") > 0 && %player.getInventory("ChaingunAmmo") >= 1); 
   %hasDisc    = (%player.getInventory("Disc") > 0 && %player.getInventory("DiscAmmo") >= 1); 
   %hasGrenade = (%player.getInventory("GrenadeLauncher") > 0 && %player.getInventory("GrenadeLauncherAmmo") >= 1); 
   %hasSniper  = (%player.getInventory("SniperRifle") > 0) && (%player.getInventory("EnergyPack") > 0);
   %hasELF     = (%player.getInventory("ELFGun") > 0); 

	//check ammo
	%quantity = mFloor(%playerDataBlock.max[%type] * 0.7);

	%rating = 0;
	if (%hasBlaster)
		%rating += 9;
	if (%hasSniper)
		%rating += 9;
	if (%hasElf)
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
//	if (%hasGrenade)
//	{
//		%quantity =  %player.getInventory("GrenadeLauncherAmmo") / %playerDataBlock.max["GrenadeLauncherAmmo"];
//		%rating += 10 + (15 * %quantity);
//	}

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

function AIChooseObjectWeapon(%client, %targetObject, %distToTarg, %mode, %canUseEnergyStr, %environmentStr)
{
   //get our inventory
   %player = %client.player;
	if (!isObject(%player))
		return;

	if (!isObject(%targetObject))
		return;

	%canUseEnergy = (%canUseEnergyStr $= "true");
	%inWater = (%environmentStr $= "water");
   %hasBlaster = (%player.getInventory("Blaster") > 0) && %canUseEnergy;
   %hasPlasma = (%player.getInventory("Plasma") > 0) && (%player.getInventory("PlasmaAmmo") > 0) && !%inWater;
   %hasChain = (%player.getInventory("Chaingun") > 0) && (%player.getInventory("ChaingunAmmo") > 0);
   %hasDisc = (%player.getInventory("Disc") > 0) && (%player.getInventory("DiscAmmo") > 0);
   %hasGrenade = (%player.getInventory("GrenadeLauncher") > 0) && (%player.getInventory("GrenadeLauncherAmmo") > 0);
   %hasMortar = (%player.getInventory("Mortar") > 0) && (%player.getInventory("MortarAmmo") > 0);
   %hasRepairPack = (%player.getInventory("RepairPack") > 0) && %canUseEnergy;
   %hasTargetingLaser = (%player.getInventory("TargetingLaser") > 0) && %canUseEnergy;
   %hasMissile = (%player.getInventory("MissileLauncher") > 0) && (%player.getInventory("MissileLauncherAmmo") > 0);
   
   //see if we're destroying the object
   if (%mode $= "Destroy")
   {
		if ((%targetObject.getDataBlock().getClassName() $= "TurretData" ||
			  %targetObject.getDataBlock().getName() $= "MineDeployed") && %distToTarg < 50)
		{
         if (%hasPlasma)
            %useWeapon = "Plasma";
         else if (%hasDisc)
            %useWeapon = "Disc";
         else if (%hasBlaster)
            %useWeapon = "Blaster";
         else if (%hasChain)
            %useWeapon = "Chaingun";
         else
            %useWeapon = "NoAmmo";
		}
      else if (%distToTarg < 40)
      {
         if (%hasPlasma)
            %useWeapon = "Plasma";
         else if (%hasChain)
            %useWeapon = "Chaingun";
         else if (%hasBlaster)
            %useWeapon = "Blaster";
         else if (%hasDisc)
            %useWeapon = "Disc";
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
   
   //else see if we're mortaring the object
   else if (%mode $= "Mortar")
   {
      if (%hasMortar)
         %useWeapon = "Mortar";
      else
         %useWeapon = "NoAmmo";
   }
   
   //else see if we're rocketing the object
   else if (%mode $= "Missile" || %mode $= "MissileNoLock")
   {
      if (%hasMissile)
         %useWeapon = "MissileLauncher";
      else
         %useWeapon = "NoAmmo";
   }
   
   //now select the weapon
   switch$ (%useWeapon)
   {
      case "Blaster":
         %client.player.use("Blaster");
         %client.setWeaponInfo("EnergyBolt", 25, 50, 1, 0.1);
      
      case "Plasma":
         %client.player.use("Plasma");
         %client.setWeaponInfo("PlasmaBolt", 25, 50);
      
      case "Chaingun":
         %client.player.use("Chaingun");
         %client.setWeaponInfo("ChaingunBullet", 30, 75, 150);
      
      case "Disc":
         %client.player.use("Disc");
         %client.setWeaponInfo("DiscProjectile", 30, 75);
      
      case "GrenadeLauncher":
         %client.player.use("GrenadeLauncher");
         %client.setWeaponInfo("BasicGrenade", 40, 75);
         
      case "Mortar":
         %client.player.use("Mortar");
         %client.setWeaponInfo("MortarShot", 100, 350);
         
      case "RepairPack":
			if (%player.getImageState($BackpackSlot) $= "Idle")
	         %client.player.use("RepairPack");
         %client.setWeaponInfo("DefaultRepairBeam", 40, 75, 300, 0.1);
         
      case "TargetingLaser":
         %client.player.use("TargetingLaser");
         %client.setWeaponInfo("BasicTargeter", 20, 300, 300, 0.1);
         
      case "MissileLauncher":
         %client.player.use("MissileLauncher");
         %client.setWeaponInfo("ShoulderMissile", 80, 300);
         
      case "NoAmmo":
         %client.setWeaponInfo("NoAmmo", 30, 75);
   }
}

function AIChooseEngageWeapon(%client, %targetClient, %distToTarg, %canUseEnergyStr, %environmentStr)
{
	//get some status
   %player = %client.player;
	if (!isObject(%player))
		return;

   %enemy = %targetClient.player;
	if (!isObject(%enemy))
		return;
	
	%canUseEnergy = (%canUseEnergyStr $= "true");
	%inWater = (%environmentStr $= "water");
	%outdoors = (%environmentStr $= "outdoors");
	%targVelocity = %targetClient.player.getVelocity();
	%targEnergy = %targetClient.player.getEnergyPercent();
	%targDamage = %targetClient.player.getDamagePercent();
	%myEnergy = %player.getEnergyPercent();
	%myDamage = %player.getDamagePercent();

   //get our inventory
   %hasBlaster = (%player.getInventory("Blaster") > 0) && %canUseEnergy;
   %hasPlasma = (%player.getInventory("Plasma") > 0) && (%player.getInventory("PlasmaAmmo") > 0) && !%inWater;
   %hasChain = (%player.getInventory("Chaingun") > 0) && (%player.getInventory("ChaingunAmmo") > 0);
   %hasDisc = (%player.getInventory("Disc") > 0) && (%player.getInventory("DiscAmmo") > 0);
   %hasGrenade = (%player.getInventory("GrenadeLauncher") > 0) && (%player.getInventory("GrenadeLauncherAmmo") > 0);
   %hasSniper = (%player.getInventory("SniperRifle") > 0) && (%player.getInventory("EnergyPack") > 0) && %canUseEnergy && !%inWater;
   %hasELF = (%player.getInventory("ELFGun") > 0) && %canUseEnergy && !%inWater;
   %hasMortar = (%player.getInventory("Mortar") > 0) && (%player.getInventory("MortarAmmo") > 0);
   %hasMissile = (%player.getInventory("MissileLauncher") > 0) && (%player.getInventory("MissileLauncherAmmo") > 0);
   %hasShockLance = (%player.getInventory("ShockLance") > 0) && %canUseEnergy && !%inWater;
   
   //choose the weapon
   %useWeapon = "NoAmmo";

	//first, see if it's a pilot we're shooting
	if (%dist > 50 && %enemy.isMounted() && %hasMissile)
	{
		%useWeapon = "MissileLauncher";
	}
	else if (%distToTarg < 5 && %hasShockLance)
	{
		%useWeapon = "ShockLance";
	}
   else if (%distToTarg < 15)
   {
		if (%hasELF && %myEnergy > 0.5 && %targEnergy > 0.3 && %myDamage < %targDamage && %targetZ > %myZ + 20)
			%useWeapon = "ELFGun";
		else if (%hasPlasma)
			%useWeapon = "Plasma";
      else if (%hasChain)
         %useWeapon = "Chaingun";
      else if (%hasBlaster)
         %useWeapon = "Blaster";
		else if (%hasELF && %targEnergy > 0.2)
			%useWeapon = "ELFGun";
      else if (%hasDisc)
         %useWeapon = "Disc";
		else if (%hasShockLance)
			%useWeapon = "ShockLance";
   }
   else if (%distToTarg < 35)
   {
		if (%hasELF && %targEnergy > 0.4 && (%myDamage < 0.3 || %myDamage - %targDamage < 0.2) && %targetZ > %myZ + 20)
			%useWeapon = "ELFGun";
		else if (!%outdoors && %hasPlasma)
			%useWeapon = "Plasma";
      else if (%hasChain && %hasDisc)
      {
         %speed = VectorDist("0 0 0", %targVelocity);
         %myZ = getWord(%player.getTransform(), 2);
         %targetZ = getWord(%enemy.getTransform(), 2);
         %targetZVel = getWord(%targVelocity, 2);
         
         if (%speed > 15.0 || %targetZ > %myZ || %targetZVel > 1.0)
            %useWeapon = "Chaingun";
         else
            %useWeapon = "Disc";
      }
		else if (%hasPlasma)
			%useWeapon = "Plasma";
      else if (%hasChain)
         %useWeapon = "Chaingun";
      else if (%hasDisc)
         %useWeapon = "Disc";
      else if (%hasBlaster)
         %useWeapon = "Blaster";
   }
   else if (%distToTarg < 60)
   {
      if (%hasGrenade)
         %useWeapon = "GrenadeLauncher";
		else if (%hasSniper && %myEnergy > 0.6)
         %useWeapon = "SniperRifle";

   }
   else if (%distToTarg < 80)
   {
		if (%hasSniper && %myEnergy > 0.4)
			%useWeapon = "SniperRifle";
      else if (%hasDisc)
         %useWeapon = "Disc";
      else if (%hasChain)
         %useWeapon = "Chaingun";
      else if (%hasBlaster)
         %useWeapon = "Blaster";
   }
	else
	{
      if (%hasSniper)
			%useWeapon = "SniperRifle";
	}

	//now make sure we actually selected something
	if (%useWeapon $= "NoAmmo")
	{
		if (%hasDisc)
			%useWeapon = "Disc";
		else if (%hasChain)
			%useWeapon = "Chaingun";
		else if (%hasPlasma)
			%useWeapon = "Plasma";
		else if (%hasBlaster)
			%useWeapon = "Blaster";
		else if (%hasELF)
			%useWeapon = "ELFGun";
		else if (%hasSniper)
			%useWeapon = "SniperRifle";
		else if (%hasShockLance)
			%useWeapon = "ShockLance";
      else if (%hasGrenade)
         %useWeapon = "GrenadeLauncher";
      else if (%hasMissile)
         %useWeapon = "MissileLauncher";
	}

   //now select the weapon
   switch$ (%useWeapon)
   {
      case "Blaster":
         %client.player.use("Blaster");
         %client.setWeaponInfo("EnergyBolt", 25, 50, 1, 0.1);
         
      case "Plasma":
         %client.player.use("Plasma");
         %client.setWeaponInfo("PlasmaBolt", 25, 50);
      
      case "Chaingun":
         %client.player.use("Chaingun");
         %client.setWeaponInfo("ChaingunBullet", 30, 75, 150);
         
      case "Disc":
         %client.player.use("Disc");
         %client.setWeaponInfo("DiscProjectile", 30, 75);
         
      case "GrenadeLauncher":
         %client.player.use("GrenadeLauncher");
         %client.setWeaponInfo("BasicGrenade", 40, 75);
         
      case "SniperRifle":
         %client.player.use("SniperRifle");
         %client.setWeaponInfo("BasicSniperShot", 80, 350, 1, 0.75, 0.5);

      case "ELFGun":
         %client.player.use("ELFGun");
         %client.setWeaponInfo("BasicELF", 25, 45, 90, 0.1);
         
      case "ShockLance":
         %client.player.use("ShockLance");
         %client.setWeaponInfo("BasicShocker", 0.5, 8, 1, 0.1);
         
      case "MissileLauncher":
         %client.player.use("MissileLauncher");
         %client.setWeaponInfo("ShoulderMissile", 80, 350);
         
      case "NoAmmo":
         %client.setWeaponInfo("NoAmmo", 30, 75);
   }
}

//function is called once per frame, to handle packs, healthkits, grenades, etc...
function AIProcessEngagement(%client, %target, %type, %projectile)
{
   //make sure we're still alive
	if (! AIClientIsAlive(%client))
		return;

	//clear the pressFire
	%client.pressFire(-1);

	//see if we have to use a repairkit
	%player = %client.player;
	if (!isObject(%player))
		return;

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
			if (%grenade.sourceObject.client != %client)
			{
				//see if it's within 15 m
				if (VectorDist(%grenade.position, %client.player.position) < 15)
				{
					%client.setDangerLocation(%grenade.position, 20);
					break;
				}
			}
		}
	}

	//if we're being hunted by a seeker projectile, throw a flare grenade
	if (%player.getInventory("FlareGrenade") > 0)
	{
		%missileCount = MissileSet.getCount();
		for (%i = 0; %i < %missileCount; %i++)
		{
			%missile = MissileSet.getObject(%i);
			if (%missile.getTargetObject() == %player)
			{
				//see if the missile is within range
				if (VectorDist(%missile.getTransform(), %player.getTransform()) < 50)
				{
					%player.throwStrength = 1.5;
					%player.use("FlareGrenade");
					break;
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
				//if the target is in range, and within 10-40 m, and heading in this direction, toss a grenade
				if (!$AIDisableGrenades && %client.getSkillLevel() >= 0.3)
				{
					if (%player.getInventory("Grenade") > 0)
						%grenadeType = "Grenade";
					else if (%player.getInventory("FlashGrenade") > 0)
						%grenadeType = "FlashGrenade";
					else if (%player.getInventory("ConcussionGrenade") > 0)
						%grenadeType = "ConcussionGrenade";
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
					{
						%player.use("Backpack");
					}
					else if (%projectile <= 0 && %player.getImageState($BackpackSlot) $= "activate")
					{
						%player.use("Backpack");
					}
				}
			}

		case "object":
				%hasGrenade = %player.getInventory("Grenade");
				if (%hasGrenade && %client.targetInRange())
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

		case "none":
			//use the repair pack if we have one
			if (%player.getDamagePercent() > 0 && %player.getInventory(RepairPack) > 0)
			{
				if (%player.getImageState($BackpackSlot) $= "Idle")
		         %client.player.use("RepairPack");
				else
					//sustain the fire for 30 frames - this callback is timesliced...
					%client.pressFire(30);
			}
	}
}

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
            %distance = %client.getPathDistance(%obj.getTransform());
            if (%distance > 0 && %distance < %closestDist)
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
	         %distance = %client.getPathDistance(%obj.getTransform());
	         if (%distance > 0 && %distance < %closestRemoteDist)
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

//------------------------------
//AI Equipment Configs
$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "AmmoPack";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[HeavyAmmoSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "ShieldPack";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[HeavyShieldSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "EnergyPack";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "ELFGun";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[HeavyEnergySet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "RepairPack";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "ELFGun";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "Mortar";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "MortarAmmo";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[HeavyRepairSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "TurretIndoorDeployable";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "ELFGun";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[HeavyIndoorTurretSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "Heavy";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "InventoryDeployable";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "ELFGun";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[HeavyInventorySet, $EquipConfigIndex++] = "Mine";

//------------------------------

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "RepairPack";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumRepairSet, $EquipConfigIndex++] = "Grenade";
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
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[MediumShieldSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "EnergyPack";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "ELFGun";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[MediumEnergySet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "EnergyPack";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "MissileLauncher";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "MissileLauncherAmmo";
$AIEquipmentSet[MediumMissileSet, $EquipConfigIndex++] = "ELFGun";
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
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "ELFGun";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumOutdoorTurretSet, $EquipConfigIndex++] = "Grenade";
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
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "ELFGun";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[MediumIndoorTurretSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "Medium";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "InventoryDeployable";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "Chaingun";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "ChaingunAmmo";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "ELFGun";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[MediumInventorySet, $EquipConfigIndex++] = "Mine";

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
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[LightEnergyDefault, $EquipConfigIndex++] = "Mine";

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
$AIEquipmentSet[LightEnergySniper, $EquipConfigIndex++] = "Grenade";
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
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[LightEnergyELF, $EquipConfigIndex++] = "Mine";

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
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[LightShieldSet, $EquipConfigIndex++] = "Mine";

$EquipConfigIndex = -1;
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "Light";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "CloakingPack";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "Plasma";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "PlasmaAmmo";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "Disc";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "DiscAmmo";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[LightCloakSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
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
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "GrenadeLauncher";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "GrenadeLauncherAmmo";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "TargetingLaser";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "RepairKit";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[LightRepairSet, $EquipConfigIndex++] = "Mine";

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
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "Grenade";
$AIEquipmentSet[LightSniperChain, $EquipConfigIndex++] = "Mine";
