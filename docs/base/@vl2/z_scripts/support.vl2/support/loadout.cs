// #name = loadout Support
// #version = 0.1.1
// #date = August 8, 2001
// #author = Daniel Neilsen (aka Wizard_TPG)
// #email = wizardsworld@bigpond.com
// #web = http://www.tribalwar.com/wizard/
// #description = Determines players current loadout status from HUD information
// #category = Support
// #status = release
// #credit = Grenade tracking code by Ego, credited to Fragbait (integrated by UberGuy)
// #credit = WeaponReceived callback idea by MadMonk
// #include = support/callback.cs
// ---------------------------------------------------------------------------
//
//	Usage Notes and Examples:
//
// 	Callbacks included in this support script:
//		PlayerSpawn - called when player spawns.
//		WeaponChange - When player changes weapon.  Returns new weapon as 1st variable.
//		PlayerUseInv - Player used the inventory station
//		PlayerDeath - Player died somehow.  Could have changed teams or gone to obs.
//		MineUsed - A mine was removed from the players inventory either by use or otherwise
//		MineReceived - A mine was added to the players inventory
//		RepairKitUsed - A Repairkit was removed from the players inventory.
//		RepairKitReceived - A Repairkit was added to the players inventory.
//		BeaconUsed - A Beacon was removed from the players inventory.
//		BeaconReceived - A Beacon was added to the players inventory.
//		GrenadeUsed - A Grenade was removed from the players inventory.
//		GrenadeReceived - A Grenade was added to the players inventory.
//		BackpackReceived - The player received a backpack
//		BackpackDropped - The player's backpack was taken away
//		ModTypeChange - When you enter a server this callback returns mod name
//		WeaponReceived - A weapon has been added to your inventory. Returns weapon name and slot
//
//
//	Useful Functions in this support script:
//		loadout.isloadoutWeapon(%name); - Will return true or false if weapon is in players inv
//		loadout.getCurrentWeapon(); - Returns the name of the current weapon in players hand. "" for none.
//		loadout.getPreviousWeapon(); - Returns the name of the previously used weapon.  "" for none
//		loadout.getWeaponAmmo(%name); - Returns the ammo amount for that weapon in players inv. -1 for infinite.
//		loadout.getPack(); - Returns name of current pack.  "" for none.
//		loadout.getMineAmmo(); - Returns number of mines in players inv.
//		loadout.getRepairKit(); - Returns number of repairkits in players inv. (ie. 1 or 0)
//		loadout.getBeaconAmmo(); - Returns number of beacons in players inv.
//		loadout.getGrenadeAmmo(); - Returns number of grenades in players inv.
//		loadout.UseWeapon(%weapon); - Input the weapon name to load the correct weapon function
//		loadout.getGrenadeType(); - Returns the type of grenade in players inv.
//		loadout.getArmorType(); - Returns current type of armor (if mod with support).
//		loadout.getModType(); - Returns current server mod type.
//
//
//	Possible WeaponTypes Are:
//		Blaster
//		Plasma
//		Chaingun
//		Disc
//		GrenadeLauncher
//		SniperRifle
//		ELFGun
//		Mortar
//		MissileLauncher
//		ShockLance
//		TargetingLaser
//		RepairGun
//		ParticleGun			-	Shifter
//		HeaterGun			-	Shifter
//		RailGun				-	Shifter
//		Flamer				-	Shifter
//		EngineerRepairGun	-	Shifter
//		GravitronGun		-	Shifter
//		VoltProjector		-	Shifter
//		BoomStick			-	Shifter
//
//		Note: All weapons from any mod should be fine
//
//
//
//	Possible Grenade Types Are:
//		"Grenade"
//		"Whiteout Grenade"
//		"Concussion Grenade"
//		"Flare Grenade"
//		"Camera Grenade"
//
//
//	Possible Mine Types Are:
//		Mine
//
//
//	Possible Pack Types Are:
//		AmmoPack
//		CloakingPack`
//		EnergyPack
//		RepairPack
//		SatchelCharge
//		ShieldPack
//		InventoryDeployable
//		MotionSensorDeployable
//		PulseSensorDeployable
//		TurretOutdoorDeployable
//		TurretIndoorDeployable
//		SensorJammerPack
//		AABarrelPack
//		FusionBarrelPack
//		MissileBarrelPack
//		PlasmaBarrelPack
//		ELFBarrelPack
//		MortarBarrelPack
//		ThrusterPack 					-	TAC2
//		MorphPack						-	Shifter
//		TelePack						-	Shifter
//		DetPack							-	Shifter
//		DeployableThumperPack			-	Shifter
//		heavydevistatorcannon			-	Shifter
//		heavyplasmacannon				-	Shifter
//		FFBeacon						-	Shifter
//		DeployableTurretPack			-	Shifter
//		DeployableLaserBarrelPack		-	Shifter
//		DeployableShockerBarrelPack		-	Shifter
//		CycloneLauncherPack				-	Shifter
//		ShieldBeacon					-	Shifter
//		FFCube							-	Shifter
//		JammerBeacon					-	Shifter
//		ForceFieldDeployable			-	Shifter
//		RepairBeaconDeployable			-	Shifter
//
//
//
//
//	Note:   This script SHOULD work for mods as well.
//			I have only added mod weapon/pack names in here for TAC2 and Shifter although
//			other mods should also be fine.
//
//
//============================================================================

// UberGuy edit 01/25/03 - Ego's grenade support

loadout.grenadepickupText["some grenades"] = "Grenade";
loadout.grenadepickupText["some flash grenades"] = "Whiteout Grenade";
loadout.grenadepickupText["some concussion grenades"] = "Concussion Grenade";
loadout.grenadepickupText["some flare grenades"] = "Flare Grenade";
loadout.grenadepickupText["a deployable camera"] = "Deployable Camera";

loadout.command["Blaster"] = "useBlaster";
loadout.command["Plasma"] = "usePlasma";
loadout.command["Chaingun"] = "useChaingun";
loadout.command["Disc"] = "useDisc";
loadout.command["useGrenadeLauncher"] = "useGrenadeLauncher";
loadout.command["SniperRifle"] = "useSniperRifle";
loadout.command["ELFGun"] = "useELFGun";
loadout.command["Mortar"] = "useMortar";
loadout.command["MissileLauncher"] = "useMissileLauncher";
loadout.command["TargetingLaser"] = "useTargetingLaser";
loadout.command["ShockLance"] = "useShockLance";

package Inventory_Support
{
	function clientCmdSetWeaponsHudItem(%slot, %ammoAmount, %addItem)
	{
	   Parent::clientCmdSetWeaponsHudItem(%slot, %ammoAmount, %addItem);
	   if(%addItem)
			loadout::addweapon(%this, %slot);
	   else
		  	loadout::removeweapon(%this, %slot);
	}


	function clientCmdSetWeaponsHudAmmo(%slot, %ammoAmount)
	{
	   	Parent::clientCmdSetWeaponsHudAmmo(%slot, %ammoAmount);
	   	loadout.setWeaponAmmo(%slot, %ammoAmount);
	}

	// Modified to work with v25026.015 (UberGuy)
	function clientCmdSetWeaponsHudActive(%slot, %ret, %vis)
	{
	   Parent::clientCmdSetWeaponsHudActive(%slot, %ret, %vis);
	   loadout.setCurrentWeapon(%slot);
	}

	function clientCmdSetRepairReticle()
	{
	   Parent::clientCmdSetRepairReticle();
	   loadout.setCurrentWeapon(0, "RepairGun");
	}

	function clientCmdSetWeaponsHudClearAll()
	{
		loadout.clearall();
		Parent::clientCmdSetWeaponsHudClearAll();
	}

	//=============================================================

	function clientCmdSetBackpackHudItem(%num, %addItem)
	{
		if(%addItem) {
			loadout.addpack(%num);
			callback.trigger(BackpackReceived,loadout.pack); // UberGuy 01/27/03
			loadout.playerAtInvo = false;
		}
		else {
			if (!(loadout.playerAtInvo || loadout.playerDead || (loadout.pack !$= ""))) callback.trigger(BackPackDropped);
			loadout.clearpack();
		}
		Parent::clientCmdSetBackpackHudItem(%num, %addItem);

	}

	//=============================================================

	function clientCmdSetInventoryHudItem(%slot, %amount, %addItem)
	{
	   // <grenType>
	   loadout.grenType = "Grenade";	//Respawn grenade type - may be wrong in mods.
	   loadout.grenRefreshSelected();
	   // </grenType>
	   callback.trigger(PlayerSpawn);
	   Parent::clientCmdSetInventoryHudItem(%slot, %amount, %addItem);
	}

	function clientCmdSetInventoryHudAmount(%slot, %amount)
	{
	   loadout.setInvData(%slot, %amount);
	   Parent::clientCmdSetInventoryHudAmount(%slot, %amount);
	}

	function clientCmdSetInventoryHudClearAll()
	{
	   loadout.PlayerDeath();
	   Parent::clientCmdSetInventoryHudClearAll();
	}

	function clientCmdSetArmorType(%type)
	{
	   loadout.SetArmorType(%type);
	   Parent::clientCmdSetArmorType(%type);
	}

	// <grenType>
	function loadFavorite(%index, %echo)
	{
    	parent::loadFavorite(%index, %echo);
    	loadout.grenFavChange(%index);
    }

	function addQuickPackFavorite(%pack, %item)
	{
	    parent::addQuickPackFavorite(%pack, %item);
       	if (stricmp(%item,"grenade") == 0) loadout.selectedGrenType = %pack;
	}

	function addQuickChangeFavorite(%pack, %item){
	    parent::addQuickChangeFavorite(%pack, %item);
	    if (stricmp(%item,"grenade") == 0) loadout.selectedGrenType = %pack;
	}

    function toggleCursorHuds(%val)
    {
    	parent::toggleCursorHuds(%val);

    	if(%val $= 'inventoryScreen') loadout.grenRefreshSelected();
    }
    // </grenType>
};

activatepackage(Inventory_Support);

if(!isObject(loadout))
{
    new ScriptObject(loadout)
    {
        class = loadout;
    };
}

function handleloadoutHUDMissionInfo(%msgType, %msgString, %missionname, %missiontype, %servername)
{
	loadout.currentServerMod = getRecord( $ServerInfo, 2 );
	callback.trigger(ModTypeChange, loadout.currentServerMod);
}
addMessageCallback( 'MsgMissionDropInfo', handleloadoutHUDMissionInfo );


//==================================================

function loadout::addweapon(%this, %slot)
{
	%this.playerdead = false;
	%name = $WeaponNames[%slot];
	$loadout::weapon[%name] = true;
	callback.trigger(WeaponReceived, %name, %slot);
}

function loadout::removeweapon(%this, %slot)
{
	%name = $WeaponNames[%slot];
	$loadout::weapon[%name] = false;
}

function loadout::clearweapon(%this)
{
	for(%slot=0; %slot<11; %slot++)
	{
		%name = $WeaponNames[%slot];
		$loadout::weapon[%name] = false;
	}
}

function loadout::setCurrentWeapon(%this, %slot, %other)
{
	%this.playerdead = false;
	if(%this.currentWeapon !$= "")
		%this.previousWeapon = %this.currentWeapon;
	if(%slot == -1)
		%this.currentWeapon = "";
	else if(%other $= "")
		%this.currentWeapon = $WeaponNames[%slot];
	else
		%this.currentWeapon = %other;
	callback.trigger(WeaponChange, %this.currentWeapon);
}

function loadout::setWeaponAmmo(%this, %slot, %ammo)
{
	%name = $WeaponNames[%slot];
	%this.weaponAmmo[%name] = %ammo;
}

function loadout::isloadoutWeapon(%this, %name)
{
	if(%name $= "")
		return false;

	for(%slot=0; %slot<100; %slot++)
	{
		%namedata = $WeaponNames[%slot];
		if(%namedata $= "")
			return false;
		if(%name $= %namedata)
		{
			%val = $loadout::weapon[%namedata] == 1 ? 1 : 0;
			return %val;
		}
	}
	return false;
}

function loadout::getCurrentWeapon(%this)
{
	return %this.currentWeapon;
}

function loadout::getPreviousWeapon(%this)
{
	return %this.previousWeapon;
}

function loadout::getWeaponAmmo(%this, %name)
{
	%val = %this.weaponAmmo[%name] $= "" ? -1 : %this.weaponAmmo[%name];
	return %val;
}


//==============================================================

function loadout::addpack(%this, %slot)
{
	%this.pack = $BackpackHudData[%slot, itemDataName];
}

function loadout::clearpack(%this)
{
	%this.pack = "";
}

function loadout::getPack(%this)
{
	return %this.pack;
}

//==============================================================

function loadout::setInvData(%this, %slot, %ammo)
{
	%this.playerdead = false;
	if(%slot $= "")
		return;

	for(%num = 0; %num < $InventoryHudCount; %num++)
	{
		if($InventoryHudData[%num, slot] == %slot)
		{
			%numdata = %num;
			%num = $InventoryHudCount;
		}
	}
	%datatype = $InventoryHudData[%numdata, itemDataName];
	if(%datatype $= Mine)
	{
		%tmp = %this.mineAmmo;
		%this.mineAmmo = %ammo;
		if(%tmp > %ammo)
			callback.trigger(MineUsed);
		else if(%tmp < %ammo)
			callback.trigger(MineReceived);
	}
	else if(%datatype $= RepairKit)
	{
		%tmp = %this.repairKit;
		%this.repairKit = %ammo;
		if(%tmp > %ammo)
			callback.trigger(RepairKitUsed);
		else if(%tmp < %ammo)
			callback.trigger(RepairKitReceived);
	}
	else if(%datatype $= Beacon)
	{
		%tmp = %this.beaconAmmo;
		%this.beaconAmmo = %ammo;
		if(%tmp > %ammo)
			callback.trigger(BeaconUsed);
		else if(%tmp < %ammo)
			callback.trigger(BeaconReceived);
	}
	else
	{
		if(%ammo >= 0)
		{
			%tmp = %this.grenAmmo;
			%this.grenAmmo = %ammo;
			if(%tmp > %ammo)
				callback.trigger(GrenadeUsed);
			else if(%tmp < %ammo)
				callback.trigger(GrenadeReceived);
			//%this.grenType = %datatype; //
		}
		else if(%datatype $= %this.grenType)
		{
			%tmp = %this.grenAmmo;
			%this.grenAmmo = %ammo;
			if(%tmp > %ammo)
				callback.trigger(GrenadeUsed);
			else if(%tmp < %ammo)
				callback.trigger(GrenadeReceived);
		}
	}
}

function loadout::clearInvData(%this)
{
	%this.mineAmmo = 0;
	%this.repairKit = 0;
	%this.beaconAmmo = 0;
	%this.grenType = "";
	%this.grenAmmo = 0;
}

function loadout::getMineAmmo(%this)
{
	return %this.mineAmmo;
}

function loadout::getRepairKit(%this)
{
	return %this.repairKit;
}

function loadout::getBeaconAmmo(%this)
{
	return %this.beaconAmmo;
}

function loadout::getGrenadeType(%this)
{
	return %this.grenType;
}

function loadout::getGrenadeAmmo(%this)
{
	return %this.grenAmmo;
}

function loadout::getSelectedGrenadeType(%this)
{
	return %this.selectedGrenType;
}


//=======================================================

function loadout::clearall(%this)
{
	%this.clearweapon();
	//%this.clearpack();
	%this.clearInvData();
	if(!%this.playerdead)
		%this.playerAtInvo = true;
		// <grenType>
		%this.grenType = %this.selectedGrenType;
		// </grenType>
		callback.trigger(PlayerUseInv);
}

function loadout::PlayerDeath(%this)
{
	%this.playerdead = true;
	%this.clearall();
	callback.trigger(PlayerDeath);
}

function loadout::UseWeapon(%this, %weapon)
{
	%cmd = loadout.command[%weapon];
	if ($cmd $= "") use(%weapon);
	else call(%cmd,true);
}

// <grenType>
function loadout::grenRefreshSelected(%this)
{
   	for (%i = 1; %i < $Hud['inventoryScreen'].count; %i++)
	{
	   	%type = $Hud['inventoryScreen'].data[%i, 1].type;
       	%equipment = $Hud['inventoryScreen'].data[%i, 1].getValue();
       	if(%type $= "Grenade") %this.selectedGrenType = %equipment;
   	}
}

function loadout::grenFavChange(%this)
{
	%this.grenSelectedFav = $pref::Favorite[$pref::FavCurrentSelect];

	for (%i = 0; %i < getFieldCount(%this.grenSelectedFav); %i++)
	{
    	%type = getField(%this.grenSelectedFav, %i);
    	%equipment = getField(%this.grenSelectedFav, %i++);
    	if(%type $= "Grenade") %this.selectedGrenType = %equipment;
	}
}

function handlePickedUpMessage(%msgType, %msgText, %itemText)
{
    if (loadout.grenadepickupText[%itemtext] !$= "")
    	loadout.grenType = loadout.grenadepickupText[%itemtext];
}

addMessageCallback('MsgItemPickup', handlePickedUpMessage);
// </grenType>

//==========================================
//	Mod Functions

function loadout::getModType(%this)
{
	return %this.currentServerMod;
}