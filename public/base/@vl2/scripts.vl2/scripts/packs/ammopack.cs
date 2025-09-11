// ------------------------------------------------------------------
// AMMO PACK
// can be used by any armor type
// uses no energy, does not have to be activated
// increases the max amount of non-energy ammo carried

// put vars here for ammo max counts with ammo pack

$AmmoItem[0] = PlasmaAmmo;
$AmmoItem[1] = ChaingunAmmo;
$AmmoItem[2] = DiscAmmo;
$AmmoItem[3] = GrenadeLauncherAmmo;
$AmmoItem[4] = MortarAmmo;
$AmmoItem[5] = MissileLauncherAmmo;
$AmmoItem[6] = RepairKit;

$numAmmoItems = 7;

$grenAmmoType[0] = Grenade;
$grenAmmoType[1] = ConcussionGrenade;
$grenAmmoType[2] = FlashGrenade;
$grenAmmoType[3] = FlareGrenade;

$numGrenTypes = 4;

datablock ShapeBaseImageData(AmmoPackImage)
{
   shapeFile = "pack_upgrade_ammo.dts";
   item = AmmoPack;
   mountPoint = 1;
   offset = "0 0 0";
};

datablock ItemData(AmmoPack)
{
   className = Pack;
   catagory = "Packs";
   shapeFile = "pack_upgrade_ammo.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   rotate = true;
   image = "AmmoPackImage";
	pickUpName = "an ammo pack";

   computeCRC = true;


//   lightType = "PulsingLight";
//   lightColor = "0.2 0.4 0.0 1.0";
//   lightTime = "1200";
//   lightRadius = "1.0";

	max[PlasmaAmmo] = 30;
	max[ChaingunAmmo] = 150;
	max[DiscAmmo] = 15;
	max[GrenadeLauncherAmmo] = 15;
	max[MortarAmmo] = 10;
	max[MissileLauncherAmmo] = 4;
	max[Grenade] = 10;
	max[ConcussionGrenade] = 10;
	max[FlashGrenade] = 10;
	max[FlareGrenade] = 10;
	max[CameraGrenade] = 0;
    max[Mine] = 5;
	max[RepairKit] = 1;
};

function AmmoPack::onPickup(%this,%pack,%player,%amount)
{
	// %this = AmmoPack datablock
	// %pack = AmmoPack object number
	// %player = player
	// %amount = 1

	for (%idx = 0; %idx < $numAmmoItems; %idx++)
	{
	   %ammo = $AmmoItem[%idx];
      if (%pack.inv[%ammo] > 0)
      {
         %amount = %pack.getInventory(%ammo);
         %player.incInventory(%ammo,%amount);
         %pack.setInventory(%ammo,0);
      }
		else if(%pack.inv[%ammo] == -1)
		{
			// this particular type of ammo has already been exhausted for this pack;
			// don't give the player any
		}
      else
      {
         // Assume it's full if no inventory has been assigned
         %player.incInventory(%ammo,%this.max[%ammo]);
		}
   }
	// now check what type grenades (if any) player is carrying
	%gFound = false;
	for (%i = 0; %i < $numGrenTypes; %i++)
	{
		%gType = $grenAmmoType[%i];
		if(%player.inv[%gType] > 0)
		{
			%gFound = true;
			%playerGrenType = %gType;
			break;
		}
	}
	// if player doesn't have any grenades at all, give 'em whatever the ammo pack has
	if(!%gFound)
	{
		%given = false;
		for(%j = 0; %j < $numGrenTypes; %j++)
		{
			%packGren = $grenAmmoType[%j];
			if(%pack.inv[%packGren] > 0)
			{
				// pack has some of these grenades
	         %player.incInventory(%packGren, %pack.getInventory(%packGren));
	         %pack.setInventory(%packGren, 0);
				%given = true;
				break;
			}
			else if(%pack.inv[%packGren] == -1)
			{
				// the pack doesn't have any of this type of grenades
			}
			else
			{
				// pack has full complement of this grenade type
	         %player.incInventory(%packGren, %this.max[%packGren]);
				%given = true;
			}
			if(%given)
				break;
		}
	}
	else
	{
		// player had some amount of grenades before picking up pack
		if(%pack.inv[%playerGrenType] > 0)
		{
			// pack has 1 or more of this type of grenade
         %player.incInventory(%playerGrenType, %pack.getInventory(%playerGrenType));
         %pack.setInventory(%playerGrenType, 0);
		}
		else if(%pack.inv[%playerGrenType] == -1)
		{
			// sorry Chester, the pack is out of these grenades.
		}
		else
		{
			// pack is uninitialized for this grenade type -- meaning it has full count
			%player.incInventory(%playerGrenType, %this.max[%playerGrenType]);
		}
	}
	// now see if player had mines selected and if they're allowed in this mission type
	%mineFav = %player.client.favorites[getField(%player.client.mineIndex, 0)];
	if ( ( $InvBanList[$CurrentMissionType, "Mine"] !$= "1" ) 
	  && !( ( %mineFav $= "EMPTY" ) || ( %mineFav $= "INVALID" ) ) )
	{
		// player has selected mines, and they are legal in this mission type
		if(%pack.inv[Mine] > 0)
		{
			// and the pack has some mines in it! bonus!
			%player.incInventory(Mine, %pack.getInventory(Mine));
			%pack.setInventory(Mine, 0);
		}
		else if(%pack.inv[Mine] == -1)
		{
			// no mines left in the pack. do nothing.
		}
		else
		{
			// assume it's full of mines if no inventory has been assigned
			%player.incInventory(Mine,%this.max[Mine]);
		}
	}
}

function AmmoPack::onThrow(%this,%pack,%player)
{
	// %this = AmmoPack datablock
	// %pack = AmmoPack object number
	// %player = player

	%player.throwAmmoPack = 1;
	dropAmmoPack(%pack, %player);
	// do the normal ItemData::onThrow stuff -- sound and schedule deletion
   serverPlay3D(ItemThrowSound, %player.getTransform());
   %pack.schedulePop();
}

function AmmoPack::onInventory(%this,%player,%value)
{
	// %this = AmmoPack
	// %player = player
	// %value = 1 if gaining a pack, 0 if losing a pack

	// the below test is necessary because this function is called everytime the ammo
	// pack gains or loses an item
	if(%player.getClassName() $= "Player")
	{
		if(!%value)
			if(%player.throwAmmoPack == 1)
			{
				%player.throwAmmoPack = 0;
				// ammo stuff already handled by AmmoPack::onThrow
			}
			else
			{
				// ammo pack was sold at inventory station -- no need to worry about
				// setting the ammo in the pack object (it doesn't exist any more)
				dropAmmoPack(-1, %player);
			}
	}
   Pack::onInventory(%this,%player,%value);
}

function dropAmmoPack(%packObj, %player)
{
	// %packObj = Ammo Pack object number if pack is being thrown, -1 if sold at inv station
	// %player = player object

	for(%i = 0; %i < $numAmmoItems; %i++)
	{
		%ammo = $AmmoItem[%i];
		// %pAmmo == how much of this ammo type the player has
		%pAmmo = %player.getInventory(%ammo);
		// %pMax == how much of this ammo type the player's datablock says can be carried
		%pMax = %player.getDatablock().max[%ammo];
		if(%pAmmo > %pMax)
		{
			// if player has more of this ammo type than datablock's max...
			if(%packObj > 0)
			{
				// put ammo that player can't carry anymore in pack
				%packObj.setInventory(%ammo, %pAmmo - %pMax);
			}
			// set player to max for this ammo type
			%player.setInventory(%ammo, %pMax);
		}
		else
		{
			if(%packObj > 0)
			{
				// the pack gets -1 of this ammo type -- else it'll assume it's full
				// can't use setInventory() because it won't allow values less than 1
				%packObj.inv[%ammo] = -1;
			}
		}
	}
	// and, of course, a pass for the grenades. Whee.
	%gotGren = false;
	// check to see what kind of grenades the player has.
	for(%j = 0; %j < $numGrenTypes; %j++)
	{
		%gType = $grenAmmoType[%j];
		if(%player.inv[%gType] > 0)
		{
			%gotGren = true;
			%playerGren = %gType;
			break;
		}
		else
		{
			// ammo pack only carries type of grenades that player who bought it (or picked
			// it up) had at the time -- all else are zeroed out (value of -1)
			if(%packObj > 0)
				%packObj.inv[%gType] = -1;
		}
	}
	if(%gotGren)
	{
		%pAmmo = %player.getInventory(%playerGren);
		%pMax = %player.getDatablock().max[%playerGren];
		if(%pAmmo > %pMax)
		{
			if(%packObj > 0)
				%packObj.setInventory(%playerGren, %pAmmo - %pMax);
			%player.setInventory(%playerGren, %pMax);
		}
		else
			if(%packObj > 0)
				%packObj.inv[%playerGren] = -1;
	}
	else
	{
		// player doesn't have any grenades at all. nothing needs to be done here.
	}
	// crap. forgot the mines.
	if(%player.getInventory(Mine) > %player.getDatablock().max[Mine])
	{
		// if player has more mines than datablock's max...
		if(%packObj > 0)
		{
			// put mines that player can't carry anymore in pack
			%packObj.setInventory(Mine, %player.getInventory(Mine) - %player.getDatablock().max[Mine]);
		}
		// set player to max mines
		%player.setInventory(Mine, %player.getDatablock().max[Mine]);
	}
	else
	{
		if(%packObj > 0)
		{
			// the pack gets -1 for mines -- else it'll assume it's full
			// can't use setInventory() because it won't allow values less than 1
			%packObj.inv[Mine] = -1;
		}
	}
}