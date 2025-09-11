//----------------------------------------------------------------------------

// Item Datablocks
//    image = Name of mounted image datablock
//    onUse(%this,%object)

// Item Image Datablocks
//    item = Name of item inventory datablock

// ShapeBase Datablocks
//    max[Item] = Maximum amount that can be caried

// ShapeBase Objects
//    inv[Item] = Count of item in inventory
//----------------------------------------------------------------------------

$TestCheats = 0;

function serverCmdUse(%client,%data)
{
   // Item names from the client must converted
   // into DataBlocks
   // %data = ItemDataBlock[%item];

   %client.getControlObject().use(%data);
}

function serverCmdThrow(%client,%data)
{
   // Item names from the client must converted
   // into DataBlocks
   // %data = ItemDataBlock[%item];
   %client.getControlObject().throw(%data);
}

function serverCmdThrowWeapon(%client,%data)
{
   // Item names from the client must converted
   // into DataBlocks
   // %data = ItemDataBlock[%item];
   %client.getControlObject().throwWeapon();
}

function serverCmdThrowPack(%client,%data)
{
   %client.getControlObject().throwPack();
}

function serverCmdTogglePack(%client,%data)
{
   // this function is apparently never called
   %client.getControlObject().togglePack();
}

function serverCmdThrowFlag(%client)
{
   //Game.playerDroppedFlag(%client.player);
   Game.dropFlag(%client.player);
}

function serverCmdSelectWeaponSlot( %client, %data )
{
   %client.getControlObject().selectWeaponSlot( %data );
}

function serverCmdCycleWeapon( %client, %data )
{
   %client.getControlObject().cycleWeapon( %data );
}

function serverCmdStartThrowCount(%client, %data)
{
   %client.player.throwStart = getSimTime();
}

function serverCmdEndThrowCount(%client, %data)
{
   if(%client.player.throwStart == 0)
      return;

   // throwStrength will be how many seconds the key was held
   %throwStrength = (getSimTime() - %client.player.throwStart) / 150;
   // trim the time to fit between 0.5 and 1.5
   if(%throwStrength > 1.5)
      %throwStrength = 1.5;
   else if(%throwStrength < 0.5)
      %throwStrength = 0.5;

   %throwScale = %throwStrength / 2;
   %client.player.throwStrength = %throwScale;

   %client.player.throwStart = 0;
}

//----------------------------------------------------------------------------

function ShapeBase::throwWeapon(%this)
{
   if(Game.shapeThrowWeapon(%this)) {
      %image = %this.getMountedImage($WeaponSlot);
      %this.throw(%image.item);
      %this.client.setWeaponsHudItem(%image.item, 0, 0);
   }
}

function ShapeBase::throwPack(%this)
{
   %image = %this.getMountedImage($BackpackSlot);
   %this.throw(%image.item);
   %this.client.setBackpackHudItem(%image.item, 0);
}

function ShapeBase::throw(%this,%data)
{
   if(!isObject(%data))
      return false;

   if (%this.inv[%data.getName()] > 0) {
      
      // save off the ammo count on this item
      if( %this.getInventory( %data ) < $AmmoIncrement[%data.getName()] )
         %data.ammoStore = %this.getInventory( %data );
      else
         %data.ammoStore = $AmmoIncrement[%data.getName()];

      // Throw item first...
      %this.throwItem(%data);
      if($AmmoIncrement[%data.getName()] !$= "")
         %this.decInventory(%data,$AmmoIncrement[%data.getName()]);
      else
         %this.decInventory(%data,1);
      return true;
   }
   return false;
}

function ShapeBase::use(%this, %data)
{
   //if(%data.class $= "Weapon") {
   // error("ShapeBase::use " @ %data);
   //}
   if(%data $= Grenade)
   {
      // figure out which grenade type you're using
      for(%x = 0; $InvGrenade[%x] !$= ""; %x++) {
         if(%this.inv[$NameToInv[$InvGrenade[%x]]] > 0)
         {
            %data = $NameToInv[$InvGrenade[%x]];   
            break;
         }
      }
   }
   else if(%data $= "Backpack") {
      %pack = %this.getMountedImage($BackpackSlot);
      // if you don't have a pack but have placed a satchel charge, detonate it
      if(!%pack && (%this.thrownChargeId > 0) && %this.thrownChargeId.armed )
      {
         %this.playAudio( 0, SatchelChargeExplosionSound );
         schedule( 800, %this, "detonateSatchelCharge", %this );
         return true;
      }
      return false;
   }
   else if(%data $= Beacon) 
   {
      %data.onUse(%this);
      if (%this.inv[%data.getName()] > 0)
         return true;
   }

   // default case
   if (%this.inv[%data.getName()] > 0) {
      %data.onUse(%this);
      return true;
   }
   return false;
}

function ShapeBase::pickup(%this,%obj,%amount)
{
   %data = %obj.getDatablock();
   %delta = %this.incInventory(%data,%amount);
   
   if (%delta)
      %data.onPickup(%obj,%this,%delta);
   return %delta;
}

function ShapeBase::hasInventory(%this, %data)
{
   // changed because it was preventing weapons cycling correctly (MES)
   return (%this.inv[%data] > 0);
}

function ShapeBase::maxInventory(%this,%data)
{
   if($TestCheats)
      return 999;
   else
      return %this.getDatablock().max[%data.getName()];
}

function ShapeBase::incInventory(%this,%data,%amount)
{
   %max = %this.maxInventory(%data);
   %cv = %this.inv[%data.getName()];
   if (%cv < %max) {
      if (%cv + %amount > %max)
         %amount = %max - %cv;
      %this.setInventory(%data,%cv + %amount);
      %data.incCatagory(%this); // Inc the players weapon count
      return %amount;
   }
   return 0;
}

function ShapeBase::decInventory(%this,%data,%amount)
{
   %name = %data.getName();
   %cv = %this.inv[%name];
   if (%cv > 0) {
      if (%cv < %amount)
         %amount = %cv;
      %this.setInventory(%data,%cv - %amount, true);
      %data.decCatagory(%this); // Dec the players weapon count
      return %amount;
   }
   return 0;
}

function SimObject::decCatagory(%this)
{
   //function was added to reduce console err msg spam
}

function SimObject::incCatagory(%this)
{
   //function was added to reduce console err msg spam
}

function ShapeBase::setInventory(%this,%data,%value,%force)
{
   if (!isObject(%data))
      return;

   %name = %data.getName();
   if (%value < 0)
      %value = 0;
   else 
   {
      if (!%force) 
      {
         // Impose inventory limits
         %max = %this.maxInventory(%data);
         if (%value > %max)
            %value = %max;
      }
   }
   if (%this.inv[%name] != %value) 
   {
      %this.inv[%name] = %value;
      %data.onInventory(%this,%value);

      if ( %data.className $= "Weapon" )
      {
         if ( %this.weaponSlotCount $= "" )
            %this.weaponSlotCount = 0;

         %cur = -1;
         for ( %slot = 0; %slot < %this.weaponSlotCount; %slot++ )
         {
            if ( %this.weaponSlot[%slot] $= %name )
            {
               %cur = %slot;
               break;
            }
         }

         if ( %cur == -1 )
         {
            // Put this weapon in the next weapon slot:
            if ( %this.weaponSlot[%this.weaponSlotCount - 1] $= "TargetingLaser" )
            {
               %this.weaponSlot[%this.weaponSlotCount - 1] = %name;
               %this.weaponSlot[%this.weaponSlotCount] = "TargetingLaser";
            }
            else
               %this.weaponSlot[%this.weaponSlotCount] = %name;
            %this.weaponSlotCount++;
         }
         else
         {
            // Remove the weapon from the weapon slot:
            for ( %i = %cur; %i < %this.weaponSlotCount - 1; %i++ )
               %this.weaponSlot[%i] = %this.weaponSlot[%i + 1];
            %this.weaponSlot[%i] = "";
            %this.weaponSlotCount--;
         }
      }

      %this.getDataBlock().onInventory(%data,%value);
   }
   return %value;
}

function ShapeBase::getInventory(%this,%data)
{
   if ( isObject( %data ) )
      return( %this.inv[%data.getName()] );
   else
      return( 0 );
}

// z0dd - ZOD, 9/13/02. Streamlined.
function ShapeBase::hasAmmo( %this, %weapon )
{
   if(%weapon $= LaserRifle)
      return( %this.getInventory( EnergyPack ) );

   if (%weapon.image.ammo $= "")
   {
      if (%weapon $= TargetingLaser)
      {
         return( false );   
      }
      else 
      {
         return( true );
      }
   }
   else
   {
      return( %this.getInventory( %weapon.image.ammo ) > 0 );
   }
}

function SimObject::onInventory(%this, %obj)
{
   //function was added to reduce console error msg spam
}

function ShapeBase::throwItem(%this,%data)
{
   %item = new Item() {
      dataBlock = %data;
      rotation = "0 0 1 " @ (getRandom() * 360);
   };
   
   %item.ammoStore = %data.ammoStore;
   MissionCleanup.add(%item);
   %this.throwObject(%item);
}

function ShapeBase::throwObject(%this,%obj)
{
   //-------------------------------------------
   // z0dd - ZOD, 5/27/02. Fixes flags hovering
   // over friendly player when collision occurs
   if(%obj.getDataBlock().getName() $= "Flag")
      %obj.static = false;
   //-------------------------------------------

   //if the object is being thrown by a corpse, use a random vector
   if (%this.getState() $= "Dead")
   {
      %vec = (-1.0 + getRandom() * 2.0) SPC (-1.0 + getRandom() * 2.0) SPC getRandom();
      %vec = vectorScale(%vec, 10);
   }

   // else Initial vel based on the dir the player is looking
   else
   {
      %eye = %this.getEyeVector();
      %vec = vectorScale(%eye, 20);
   }

   // Add a vertical component to give the item a better arc
   %dot = vectorDot("0 0 1",%eye);
   if (%dot < 0)
      %dot = -%dot;
   %vec = vectorAdd(%vec,vectorScale("0 0 8",1 - %dot));

   // Add player's velocity
   %vec = vectorAdd(%vec,%this.getVelocity());
   %pos = getBoxCenter(%this.getWorldBox());

   //since flags have a huge mass (so when you shoot them, they don't bounce too far)
   //we need to up the %vec so that you can still throw them...
   if (%obj.getDataBlock().getName() $= "Flag")
      %vec = vectorScale(%vec, 40);

   //
   %obj.setTransform(%pos);
   %obj.applyImpulse(%pos,%vec);
   %obj.setCollisionTimeout(%this);
   %data = %obj.getDatablock();
   %data.onThrow(%obj,%this);

   //call the AI hook
   AIThrowObject(%obj);
}

function ShapeBase::clearInventory(%this)
{
   %this.setInventory(RepairKit,0);

   %this.setInventory(Mine,0);
   //%this.setInventory(MineAir,0);
   //%this.setInventory(MineLand,0);
   //%this.setInventory(MineSticky,0);

   %this.setInventory(Grenade,0);
   %this.setInventory(FlashGrenade,0);
   %this.setInventory(ConcussionGrenade,0);
   %this.setInventory(FlareGrenade,0);
   %this.setInventory(CameraGrenade, 0);

   %this.setInventory(Blaster,0);
   %this.setInventory(Plasma,0);
   %this.setInventory(Disc,0);
   %this.setInventory(Chaingun, 0);
   %this.setInventory(Mortar, 0);
   %this.setInventory(GrenadeLauncher, 0);
   %this.setInventory(MissileLauncher, 0);
   %this.setInventory(SniperRifle, 0);
   %this.setInventory(TargetingLaser, 0);
   %this.setInventory(ELFGun, 0);
   %this.setInventory(ShockLance, 0);

   %this.setInventory(PlasmaAmmo,0);  
   %this.setInventory(ChaingunAmmo, 0);
   %this.setInventory(DiscAmmo, 0);
   %this.setInventory(GrenadeLauncherAmmo, 0);
   %this.setInventory(MissileLauncherAmmo, 0);
   %this.setInventory(MortarAmmo, 0);
   %this.setInventory(Beacon, 0);

   // take away any pack the player has
   %curPack = %this.getMountedImage($BackpackSlot);
   if(%curPack > 0)
      %this.setInventory(%curPack.item, 0);

}   

//----------------------------------------------------------------------------
function ShapeBase::cycleWeapon( %this, %data )
{
   if ( %this.weaponSlotCount == 0 )
      return;

   %slot = -1;
   if ( %this.getMountedImage($WeaponSlot) != 0 )
   {
      %curWeapon = %this.getMountedImage($WeaponSlot).item.getName();
      for ( %i = 0; %i < %this.weaponSlotCount; %i++ )
      {
         //error("curWeaponName == " @ %curWeaponName);
         if ( %curWeapon $= %this.weaponSlot[%i] )
         {
            %slot = %i;
            break;
         }
      }
   }

   if ( %data $= "prev" )
   {
      // Previous weapon...
      if ( %slot == 0 || %slot == -1 )
      {
         %i = %this.weaponSlotCount - 1;
         %slot = 0;
      }
      else
         %i = %slot - 1;
   }
   else
   {
      // Next weapon...
      if ( %slot == ( %this.weaponSlotCount - 1 ) || %slot == -1 )
      {
         %i = 0;
         %slot = ( %this.weaponSlotCount - 1 );
      }
      else
         %i = %slot + 1;
   }

   %newSlot = -1;
   while ( %i != %slot )
   {
      if ( %this.weaponSlot[%i] !$= ""
        && %this.hasInventory( %this.weaponSlot[%i] ) 
        && %this.hasAmmo( %this.weaponSlot[%i] ) )
      {
         // player has this weapon and it has ammo or doesn't need ammo
         %newSlot = %i;
         break;
      }

      if ( %data $= "prev" )
      {
         if ( %i == 0 )
            %i = %this.weaponSlotCount - 1;
         else
            %i--;
      }
      else
      {
         if ( %i == ( %this.weaponSlotCount - 1 ) )
            %i = 0;
         else
            %i++;
      }
   }

   if ( %newSlot != -1 )
      %this.use( %this.weaponSlot[%newSlot] );
}

//----------------------------------------------------------------------------
function ShapeBase::selectWeaponSlot( %this, %data )
{
   if ( %data < 0 || %data > %this.weaponSlotCount 
     || %this.weaponSlot[%data] $= "" || %this.weaponSlot[%data] $= "TargetingLaser" )
      return;

   %this.use( %this.weaponSlot[%data] );
}

//----------------------------------------------------------------------------

function serverCmdGiveAll(%client)
{
   if($TestCheats)
   {
      %player = %client.player;
      %player.setInventory(RepairKit,999);
      %player.setInventory(Mine,999);
      //%player.setInventory(MineAir,999);
      //%player.setInventory(MineLand,999);
      //%player.setInventory(MineSticky,999);
      %player.setInventory(Grenade,999);
      %player.setInventory(FlashGrenade,999);
      %player.setInventory(FlareGrenade,999);
      %player.setInventory(ConcussionGrenade,999);
      %player.setInventory(CameraGrenade, 999);
      %player.setInventory(Blaster,1);
      %player.setInventory(Plasma,1);
      %player.setInventory(Chaingun, 1);
      %player.setInventory(Disc,1);
      %player.setInventory(GrenadeLauncher, 1);
      %player.setInventory(SniperRifle, 1);
      %player.setInventory(ELFGun, 1);
      %player.setInventory(Mortar, 1);
      %player.setInventory(MissileLauncher, 1);
      %player.setInventory(ShockLance, 1);
      %player.setInventory(TargetingLaser, 1);
      %player.setInventory(MissileLauncherAmmo, 999);
      %player.setInventory(GrenadeLauncherAmmo, 999);
      %player.setInventory(MortarAmmo, 999);
      %player.setInventory(PlasmaAmmo,999);  
      %player.setInventory(ChaingunAmmo, 999);
      %player.setInventory(DiscAmmo, 999);
      %player.setInventory(Beacon, 999);
   }
}
