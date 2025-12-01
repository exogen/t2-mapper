// #name = Weapon List Handler
// #version = 1.4.0
// #date = Oct 10, 2001
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = This class maintains a mapping of numbers ("slots") to weapon names.
// #status = Release
// #include = support/map.cs
// #include = support/loadout.cs

// v1.4 Added support for weapon HUD info.

// This class defines 4 fields, 4 methods, and 4 Callbacks
// Fields:
//    slotByName[%name]  : evaluates to the slot for a given weapon name
//    numWeapons         : evaluates to the number of slots defined. See note below
//    loadOutSize        : evaluates to the current number of weapons in your loadout.
// Methods:
//    getWeapon(%slot)   : returns the weapon name corresponding to %slot
//    getSlot(%name)     : returns the slot corresponding to weapon called %name
//    weaponHudItem(%i)  : returns the name of the weapon in weapon HUD at position
//                         %i. Position 0 is the first position at the top.
//    weaponHudIndex(%n) : returns to the 0-based position in the weapon HUD of the
//                         weapon named %n.
// Callback:
//    WeaponListUpdated  : passes the arguments (%slot, %name).
//                         This is called as each weapon is added.
//    WeaponListCleared  : no arguments. Called when the list is about to be created
//    WeaponListUpdDone  : passes number of weapons in the list. Called when list is
//                         done being built.
//    WeaponHudUpdated   : Called when the weapons in your loadout change as reflected
//                         in the weapon HUD. Strange things happen at inventories and
//                         my code for handling this event there may not port to MODs.

if (!isObject(weaponList)) {
    new ScriptObject(weaponList) {
    	class = weaponList;
    	numWeapons = 0;
    	loadOutSize = 0;
    	updating = false;
    	atInvo = false;
    	data = Container::newListMap();
    };
}
Callback.add(PlayerUseInv,"weaponList.atInvo = true;");

package weaponListPkg {

	function weaponsHud::addWeapon(%this, %slot, %ammoAmount) {

		parent::addWeapon(%this, %slot, %ammoAmount);

		if (weaponList.weaponHudIndex[%slot] !$= "") return;
		weaponList.weaponHudItem[weaponList.loadOutSize] = %slot;
		weaponList.weaponHudIndex[%slot] = weaponList.loadOutSize;
		weaponList.loadOutSize++;
		// Not very mod friendly, but the TL is the last thing to be loaded into
		// the WeaponHud at an invo station in base code.
		if (weaponList.atInvo && ($WeaponNames[%slot] $= "TargetingLaser")) {
			Callback.trigger(WeaponHudUpdated,weaponList.loadOutSize);
			weaponList.atInvo = false;
		}
	}

	function weaponsHud::removeWeapon(%this, %slot) {

		parent::removeWeapon(%this, %slot);

		//error("Removing " @ $weaponnames[%slot]);
		if (weaponList.loadOutSize == 0) return;
		if (weaponList.weaponHudIndex[%slot] $= "") return;

		// Scoot all the entries down
		%i = weaponList.weaponHudIndex[%slot];
		weaponList.weaponHudIndex[%slot] = "";
		for(%i++; %i < weaponList.loadOutSize; %i++) {
			%nextSlot = weaponList.weaponHudItem[%i];
			weaponList.weaponHudIndex[%nextSlot] = %i-1;
			weaponList.weaponHudItem[%i-1] = %nextSlot;
		}
		weaponList.weaponHudItem[weaponList.loadOutSize--] = "";
		Callback.Trigger(WeaponHudUpdated,weaponList.loadOutSize);
	}

	function clientCmdSetWeaponsHudClearAll() {

		parent::clientCmdSetWeaponsHudClearAll();

		//error("***Clearing WeaponHUD***");
		while (weaponList.loadOutSize) {
			%slot = weaponList.weaponHudItem[weaponList.loadOutSize--];
			weaponList.weaponHudItem[weaponList.loadOutSize] = "";
			weaponList.weaponHudIndex[%slot] = "";
		}
	}

	function clientCmdSetWeaponsHudBitmap(%slot, %name, %bitmap) {

		// Note:
		// This code assumes no one will ever make a non-contiguous list of weapons
		// like Disc (1), Chain (2), Mortar (4).
		// If they do, I'll have to make this a relational structure.

		parent::clientCmdSetWeaponsHudBitmap(%slot, %name, %bitmap);

		if (!weaponList.updating) weaponList.updating = true;

		%N = %slot+1;
		if (weaponList.numWeapons < %N) weaponList.numWeapons = %N;
		weaponList.slotByName[$WeaponNames[%slot]] = %slot;
		Callback.trigger(WeaponListUpdated, %slot, $WeaponNames[%slot]);
	}

	function clientCmdSetInventoryHudBitmap(%slot, %name, %bitmap) {
		// In the current game scripts this is called right after the
		// Weapon HUD is updated.

		parent::clientCmdSetInventoryHudBitmap(%slot, %name, %bitmap);

		if (weaponList.updating) {
			weaponList.updating = false;
			Callback.trigger(WeaponListUpdDone, weaponList.numWeapons);
		}
	}

	function handleTeamListMessage( %msgType, %msgString, %teamCount, %teamList ) {
		// In the current game scripts this is called right before the
		// Weapon HUD is updated.

		weaponList.clear();
		parent::handleTeamListMessage( %msgType, %msgString, %teamCount, %teamList );
		Callback.Trigger(WeaponListCleared);
	}

	function throw(%item) {

		parent::throw(%item);
		if ((%slot = weaponList.slotByName[%item]) !$= "") {
			//schedule(100,0,"clientCmdSetWeaponsHudItem",%slot,0,0);
			clientCmdSetWeaponsHudItem(%slot,0,0);
		}
	}
};
activatePackage(weaponListPkg);


function weaponList::getWeapon(%this,%slot) {

	return $WeaponNames[%slot];
}

function weaponList::getSlot(%this,%weaponName) {

	return %this.slotByName[%weaponName];
}

function weaponList::weaponHudItem(%this, %i) {

	return $WeaponNames[%this.weaponHudItem[%i]];
}

function weaponList::weaponHudIndex(%this, %name) {

	return %this.weaponHudIndex[%this.slotByName[%name]];
}

function weaponList::clear(%this) {

	// Again, I asssume contiguous numbers for the slots.
	while (%this.numWeapons) {
		%this.slotByName[$WeaponNames[%this.numWeapons--]] = "";
	}
}

function weaponList::getWeaponByHudIndex(%this, %idx) {

	return $WeaponNames[%this.weaponHudItem[%idx]];
}

function weaponList::getWeaponHudSlot(%this, %weapon) {

	return %this.weaponHudIndex[%this.slotByName[%weapon]];
}
