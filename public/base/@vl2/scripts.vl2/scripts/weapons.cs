$HandInvThrowTimeout = 0.8 * 1000; // 1/2 second between throwing grenades or mines

// z0dd - ZOD, 9/13/02. Added global array for serverside weapon reticles and "visible"
$WeaponsHudData[0, bitmapName] = "gui/hud_blaster";
$WeaponsHudData[0, itemDataName] = "Blaster";
//$WeaponsHudData[0, ammoDataName] = "";
$WeaponsHudData[0, reticle] = "gui/ret_blaster";
$WeaponsHudData[0, visible] = "true";
$WeaponsHudData[1, bitmapName] = "gui/hud_plasma";
$WeaponsHudData[1, itemDataName] = "Plasma";
$WeaponsHudData[1, ammoDataName] = "PlasmaAmmo";
$WeaponsHudData[1, reticle] = "gui/ret_plasma";
$WeaponsHudData[1, visible] = "true";
$WeaponsHudData[2, bitmapName] = "gui/hud_chaingun";
$WeaponsHudData[2, itemDataName] = "Chaingun";
$WeaponsHudData[2, ammoDataName] = "ChaingunAmmo";
$WeaponsHudData[2, reticle] = "gui/ret_chaingun";
$WeaponsHudData[2, visible] = "true";
$WeaponsHudData[3, bitmapName] = "gui/hud_disc";
$WeaponsHudData[3, itemDataName] = "Disc";
$WeaponsHudData[3, ammoDataName] = "DiscAmmo";
$WeaponsHudData[3, reticle] = "gui/ret_disc";
$WeaponsHudData[3, visible] = "true";
$WeaponsHudData[4, bitmapName] = "gui/hud_grenlaunch";
$WeaponsHudData[4, itemDataName] = "GrenadeLauncher";
$WeaponsHudData[4, ammoDataName] = "GrenadeLauncherAmmo";
$WeaponsHudData[4, reticle] = "gui/ret_grenade";
$WeaponsHudData[4, visible] = "true";
$WeaponsHudData[5, bitmapName] = "gui/hud_sniper";
$WeaponsHudData[5, itemDataName] = "SniperRifle";
//$WeaponsHudData[5, ammoDataName] = "";
$WeaponsHudData[5, reticle] = "gui/hud_ret_sniper";
$WeaponsHudData[5, visible] = "false";
$WeaponsHudData[6, bitmapName] = "gui/hud_elfgun";
$WeaponsHudData[6, itemDataName] = "ELFGun";
//$WeaponsHudData[6, ammoDataName] = "";
$WeaponsHudData[6, reticle] = "gui/ret_elf";
$WeaponsHudData[6, visible] = "true";
$WeaponsHudData[7, bitmapName] = "gui/hud_mortor";
$WeaponsHudData[7, itemDataName] = "Mortar";
$WeaponsHudData[7, ammoDataName] = "MortarAmmo";
$WeaponsHudData[7, reticle] = "gui/ret_mortor";
$WeaponsHudData[7, visible] = "true";
$WeaponsHudData[8, bitmapName] = "gui/hud_missiles";
$WeaponsHudData[8, itemDataName] = "MissileLauncher";
$WeaponsHudData[8, ammoDataName] = "MissileLauncherAmmo";
$WeaponsHudData[8, reticle] = "gui/ret_missile";
$WeaponsHudData[8, visible] = "true";
// WARNING!!! If you change the weapon index of the targeting laser,
// you must change the HudWeaponInvBase::addWeapon function to test
// for the new value!
$WeaponsHudData[9, bitmapName]   = "gui/hud_targetlaser";
$WeaponsHudData[9, itemDataName] = "TargetingLaser";
//$WeaponsHudData[9, ammoDataName] = "";
$WeaponsHudData[9, reticle] = "gui/hud_ret_targlaser";
$WeaponsHudData[9, visible] = "false";
$WeaponsHudData[10, bitmapName]   = "gui/hud_shocklance";
$WeaponsHudData[10, itemDataName] = "ShockLance";
//$WeaponsHudData[10, ammoDataName] = "";
$WeaponsHudData[10, reticle] = "gui/hud_ret_shocklance";
$WeaponsHudData[10, visible] = "false";

// TR2 weapons
$WeaponsHudData[11, bitmapName]   = "gui/hud_disc";
$WeaponsHudData[11, itemDataName] = "TR2Disc";
$WeaponsHudData[11, ammoDataName] = "TR2DiscAmmo";
$WeaponsHudData[11, reticle] = "gui/ret_disc";
$WeaponsHudData[11, visible] = "true";

$WeaponsHudData[12, bitmapName]   = "gui/hud_grenlaunch";
$WeaponsHudData[12, itemDataName] = "TR2GrenadeLauncher";
$WeaponsHudData[12, ammoDataName] = "TR2GrenadeLauncherAmmo";
$WeaponsHudData[12, reticle] = "gui/ret_grenade";
$WeaponsHudData[12, visible] = "true";

$WeaponsHudData[13, bitmapName]   = "gui/hud_chaingun";
$WeaponsHudData[13, itemDataName] = "TR2Chaingun";
$WeaponsHudData[13, ammoDataName] = "TR2ChaingunAmmo";
$WeaponsHudData[13, reticle] = "gui/ret_chaingun";
$WeaponsHudData[13, visible] = "true";

$WeaponsHudData[14, bitmapName]   = "gui/hud_targetlaser";
$WeaponsHudData[14, itemDataName] = "TR2GoldTargetingLaser";
$WeaponsHudData[14, reticle] = "gui/hud_ret_targlaser";
$WeaponsHudData[14, visible] = "false";

$WeaponsHudData[15, bitmapName]   = "gui/hud_targetlaser";
$WeaponsHudData[15, itemDataName] = "TR2SilverTargetingLaser";
$WeaponsHudData[15, reticle] = "gui/hud_ret_targlaser";
$WeaponsHudData[15, visible] = "false";

$WeaponsHudData[16, bitmapName]   = "gui/hud_shocklance";
$WeaponsHudData[16, itemDataName] = "TR2ShockLance";
$WeaponsHudData[16, reticle] = "gui/hud_ret_shocklance";
$WeaponsHudData[16, visible] = "false";

$WeaponsHudData[17, bitmapName] = "gui/hud_mortor";
$WeaponsHudData[17, itemDataName] = "TR2Mortar";
$WeaponsHudData[17, ammoDataName] = "TR2MortarAmmo";
$WeaponsHudData[17, reticle] = "gui/ret_mortor";
$WeaponsHudData[17, visible] = "true";

$WeaponsHudCount = 18;

$AmmoIncrement[TR2DiscAmmo]            = 5;
$AmmoIncrement[TR2GrenadeLauncherAmmo] = 5;
$AmmoIncrement[TR2ChaingunAmmo] = 25;
$AmmoIncrement[TR2MortarAmmo] = 5;
$AmmoIncrement[TR2Grenade]             = 5;

$AmmoIncrement[PlasmaAmmo]          = 10;
$AmmoIncrement[ChaingunAmmo]        = 25;
$AmmoIncrement[DiscAmmo]            = 5;
$AmmoIncrement[GrenadeLauncherAmmo] = 5;
$AmmoIncrement[MortarAmmo]          = 5;
$AmmoIncrement[MissileLauncherAmmo] = 2;
$AmmoIncrement[Mine]                = 3;
$AmmoIncrement[Grenade]             = 5;
$AmmoIncrement[FlashGrenade]        = 5;
$AmmoIncrement[FlareGrenade]        = 5;
$AmmoIncrement[ConcussionGrenade]   = 5;
$AmmoIncrement[RepairKit]           = 1;

// -------------------------------------------------------------------
// z0dd - ZOD, 4/17/02. Addition. Ammo pickup fix, these were missing.
$AmmoIncrement[CameraGrenade]       = 2;
$AmmoIncrement[Beacon]              = 1;

//----------------------------------------------------------------------------
// Weapons scripts
//--------------------------------------

// --- Mounting weapons
exec("scripts/weapons/blaster.cs");
exec("scripts/weapons/plasma.cs");
exec("scripts/weapons/chaingun.cs");
exec("scripts/weapons/disc.cs");
exec("scripts/weapons/grenadeLauncher.cs");
exec("scripts/weapons/sniperRifle.cs");
exec("scripts/weapons/ELFGun.cs");
exec("scripts/weapons/mortar.cs");
exec("scripts/weapons/missileLauncher.cs");
exec("scripts/weapons/targetingLaser.cs");
exec("scripts/weapons/shockLance.cs");

// --- Throwing weapons
exec("scripts/weapons/mine.cs");
exec("scripts/weapons/grenade.cs");
exec("scripts/weapons/flashGrenade.cs");
exec("scripts/weapons/flareGrenade.cs");
exec("scripts/weapons/concussionGrenade.cs");
exec("scripts/weapons/cameraGrenade.cs");

//----------------------------------------------------------------------------

function Weapon::onUse(%data, %obj)
{
   if(Game.weaponOnUse(%data, %obj))
      if (%obj.getDataBlock().className $= Armor)
         %obj.mountImage(%data.image, $WeaponSlot);
}

function WeaponImage::onMount(%this,%obj,%slot)
{
   //MES -- is call below useful at all?
   //Parent::onMount(%this, %obj, %slot);
   if(%obj.getClassName() !$= "Player")
      return;

   //messageClient(%obj.client, 'MsgWeaponMount', "", %this, %obj, %slot);
   // Looks arm position
   if (%this.armthread $= "")
   {
      %obj.setArmThread(look);
   }
   else
   {
      %obj.setArmThread(%this.armThread);
   }
   
   // Initial ammo state
   if(%obj.getMountedImage($WeaponSlot).ammo !$= "")
      if (%obj.getInventory(%this.ammo))
         %obj.setImageAmmo(%slot,true);

   %obj.client.setWeaponsHudActive(%this.item);
   if(%obj.getMountedImage($WeaponSlot).ammo !$= "")
      %obj.client.setAmmoHudCount(%obj.getInventory(%this.ammo));
   else
      %obj.client.setAmmoHudCount(-1);
}

function WeaponImage::onUnmount(%this,%obj,%slot)
{
   %obj.client.setWeaponsHudActive(%this.item, 1);
   %obj.client.setAmmoHudCount(-1);
   commandToClient(%obj.client,'removeReticle');
   // try to avoid running around with sniper/missile arm thread and no weapon
   %obj.setArmThread(look);
   Parent::onUnmount(%this, %obj, %slot);
}

function Ammo::onInventory(%this,%obj,%amount)
{
   // Loop through and make sure the images using this ammo have
   // their ammo states set.
   for (%i = 0; %i < 8; %i++) {
      %image = %obj.getMountedImage(%i);
      if (%image > 0)
      {
         if (isObject(%image.ammo) && %image.ammo.getId() == %this.getId())
            %obj.setImageAmmo(%i,%amount != 0);
      }
   }
   ItemData::onInventory(%this,%obj,%amount);
   // Uh, don't update the hud ammo counters if this is a corpse...that's bad.
   if ( %obj.getClassname() $= "Player" && %obj.getState() !$= "Dead" )
   {
      %obj.client.setWeaponsHudAmmo(%this.getName(), %amount);
      if(%obj.getMountedImage($WeaponSlot).ammo $= %this.getName())
         %obj.client.setAmmoHudCount(%amount);
   }
}

function Weapon::onInventory(%this,%obj,%amount)
{
   if(Game.weaponOnInventory(%this, %obj, %amount))
   {
      // Do not update the hud if this object is a corpse:
      if ( %obj.getState() !$= "Dead" )
         %obj.client.setWeaponsHudItem(%this.getName(), 0, 1);   
      ItemData::onInventory(%this,%obj,%amount);
      // if a player threw a weapon (which means that player isn't currently
      // holding a weapon), set armthread to "no weapon"
		// MES - taken out to avoid v-menu animation problems (bug #4749)
      //if((%amount == 0) && (%obj.getClassName() $= "Player"))
      //   %obj.setArmThread(looknw);
   }
}

function Weapon::onPickup(%this, %obj, %shape, %amount)
{
   // If player doesn't have a weapon in hand, use this one...
   if ( %shape.getClassName() $= "Player" 
     && %shape.getMountedImage( $WeaponSlot ) == 0 )
      %shape.use( %this.getName() );
}

function HandInventory::onInventory(%this,%obj,%amount)
{
   // prevent console errors when throwing ammo pack
   if(%obj.getClassName() $= "Player")
      %obj.client.setInventoryHudAmount(%this.getName(), %amount);
   ItemData::onInventory(%this,%obj,%amount);
}

function HandInventory::onUse(%data, %obj)
{
   // %obj = player  %data = datablock of what's being thrown
   if(Game.handInvOnUse(%data, %obj))
   {
      //AI HOOK - If you change the %throwStren, tell Tinman!!!
      //Or edit aiInventory.cs and search for: use(%grenadeType);

      %tossTimeout = getSimTime() - %obj.lastThrowTime[%data];
      if(%tossTimeout < $HandInvThrowTimeout)
         return;

      %throwStren = %obj.throwStrength;

      %obj.decInventory(%data, 1);
      %thrownItem = new Item()
      {
         dataBlock = %data.thrownItem;
         sourceObject = %obj;
      };
      MissionCleanup.add(%thrownItem);
      
      // throw it
      %eye = %obj.getEyeVector();
      %vec = vectorScale(%eye, (%throwStren * 20.0));
      
      // add a vertical component to give it a better arc
      %dot = vectorDot("0 0 1", %eye);
      if(%dot < 0)
         %dot = -%dot;
      %vec = vectorAdd(%vec, vectorScale("0 0 4", 1 - %dot));
      
      // add player's velocity
      %vec = vectorAdd(%vec, vectorScale(%obj.getVelocity(), 0.4));
      %pos = getBoxCenter(%obj.getWorldBox());
      

      %thrownItem.sourceObject = %obj;
      %thrownItem.team = %obj.team;
      %thrownItem.setTransform(%pos);
      
      %thrownItem.applyImpulse(%pos, %vec);
      %thrownItem.setCollisionTimeout(%obj);
      serverPlay3D(GrenadeThrowSound, %pos);
      %obj.lastThrowTime[%data] = getSimTime();

      %thrownItem.getDataBlock().onThrow(%thrownItem, %obj);
      %obj.throwStrength = 0;
   }
}

function HandInventoryImage::onMount(%this,%obj,%slot)
{
   messageClient(%col.client, 'MsgHandInventoryMount', "", %this, %obj, %slot);
   // Looks arm position
   if (%this.armthread $= "")
      %obj.setArmThread(look);
   else
      %obj.setArmThread(%this.armThread);
   
   // Initial ammo state
   if (%obj.getInventory(%this.ammo))
      %obj.setImageAmmo(%slot,true);

   %obj.client.setWeaponsHudActive(%this.item);
}

function Weapon::incCatagory(%data, %obj)
{
   // Don't count the targeting laser as a weapon slot:
   if ( %data.getName() !$= "TargetingLaser" )
      %obj.weaponCount++;   
}

function Weapon::decCatagory(%data, %obj)
{
   // Don't count the targeting laser as a weapon slot:
   if ( %data.getName() !$= "TargetingLaser" )
      %obj.weaponCount--;   
}

function SimObject::damageObject(%data)
{
   //function was added to reduce console err msg spam
}

