autoExec("scripts/StarsiegeTribes.cs",0,0);
$T1ScriptExec = 1;
datablock StaticShapeData(T1StartObj)
{
   catagory             = "misc";
   shapeFile            = "t1baseflag.dts";
};
function T1StartObj::onAdd(%this, %obj){  
   Parent::onAdd(%this, %obj);
   if(!isObject(StarsiegeTribesMap)){
      %obj.setName("StarsiegeTribesMap");
   }
}


function T1WeaponImage::onMount(%this,%obj,%slot)
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

   %shape = %this.shapeFile;
   switch$(%shape){//    t1RepairPackGun.dts
      case "t1plasma.dts":
         %obj.client.setWeaponsHudActive("Blaster");
      case "t1Chaingun.dts":
         %obj.client.setWeaponsHudActive("Chaingun");
      case "t1disc.dts":
         %obj.client.setWeaponsHudActive("Disc");
      case "T1ELF.dts":
         %obj.client.setWeaponsHudActive("ELFGun");
      case "t1GrenadeLauncher.dts":
         %obj.client.setWeaponsHudActive("GrenadeLauncher");
      case "t1mortar.dts":
         %obj.client.setWeaponsHudActive("Mortar");
      case "t1plasma.dts":
         %obj.client.setWeaponsHudActive("Plasma");
      case "t1sniper.dts":
         %obj.client.setWeaponsHudActive("SniperRifle");
      case "t1TargetLaser.dts":
         %obj.client.setWeaponsHudActive("TargetingLaser");
      default:
         %obj.client.setWeaponsHudActive("Blaster");
   }
   if(%obj.getMountedImage($WeaponSlot).ammo !$= "")
      %obj.client.setAmmoHudCount(%obj.getInventory(%this.ammo));
   else
      %obj.client.setAmmoHudCount(-1);
}

function T1WeaponImage::onUnmount(%this,%obj,%slot)
{
   %obj.client.setWeaponsHudActive(%this.item, 1);
   %obj.client.setAmmoHudCount(-1);
   commandToClient(%obj.client,'removeReticle');
   // try to avoid running around with sniper/missile arm thread and no weapon
   %obj.setArmThread(look);
   Parent::onUnmount(%this, %obj, %slot);
}

function giveDisc(){
   %player = LocalClientConnection.player; 
   %player.setInventory("T1Disc", 1, true);
   %player.setInventory("DiscAmmo", 15, true);
}


datablock AudioProfile(T1RainSfx)
{
   filename    = "t1sounds/rain.wav";
   description = AudioLooping2d;
};

datablock PrecipitationData(T1Rain)
{
   type = 0;
   soundProfile = "T1RainSfx";
   materialList = "raindrops.dml";
   sizeX = 0.2;
   sizeY = 0.45;

   movingBoxPer = 0.35;
   divHeightVal = 1.5;
   sizeBigBox = 1;
   topBoxSpeed = 20;
   frontBoxSpeed = 30;
   topBoxDrawPer = 0.5;
   bottomDrawHeight = 40;
   skipIfPer = -0.3;
   bottomSpeedPer = 1.0;
   frontSpeedPer = 1.5;
   frontRadiusPer = 0.5;

};

datablock AudioProfile(T1DiscSwitchSound)
{
   filename    = "t1sounds/Pku_weap.wav";
   description = AudioClosest3d;
   preload = true;
};

datablock AudioProfile(T1DiscLoopSound)
{
   filename    = "t1sounds/DISCLOOP.wav";
   description = ClosestLooping3d;
};


datablock AudioProfile(T1DiscFireSound)
{
   filename    = "t1sounds/rocket2.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock AudioProfile(T1DiscReloadSound)
{
   filename    = "t1sounds/discreload.wav";
   description = AudioClosest3d;
   preload = true;
};

datablock AudioProfile(T1DiscExpSound)
{
   filename    = "t1sounds/rockexp.wav";
   description = AudioExplosion3d;
   preload = true;
};

//datablock AudioProfile(discProjectileSound)
//{
   //filename    = "fx/weapons/spinfusor_projectile.wav";
   //description = ProjectileLooping3d;
   //preload = true;
//};
//
//datablock AudioProfile(DiscDryFireSound)
//{
   //filename    = "fx/weapons/spinfusor_dryfire.wav";
   //description = AudioClose3d;
   //preload = true;
//};
datablock ExplosionData(T1DiscExplosion)
{
   explosionShape = "disc_explosion.dts";
   soundProfile   = T1DiscExpSound;

   faceViewer     = true;
   explosionScale = "1 1 1";

   shakeCamera = true;
   camShakeFreq = "10.0 11.0 10.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 0.5;
   camShakeRadius = 10.0;

   sizes[0] = "1.0 1.0 1.0";
   sizes[1] = "1.0 1.0 1.0";
   times[0] = 0.0;
   times[1] = 1.0;
};

datablock LinearProjectileData(T1DiscProjectile)
{
   projectileShapeName = "disc.dts";
   emitterDelay        = -1;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.50;
   damageRadius        = 7.5;
   radiusDamageType    = $DamageType::Disc;
   kickBackStrength    = 2000;  // z0dd - ZOD, 4/24/02. Was 1750

   sound 				= discProjectileSound;
   explosion           = "T1DiscExplosion";
   underwaterExplosion = "UnderwaterDiscExplosion";
   splash              = DiscSplash;

   dryVelocity       = 95; // z0dd - ZOD, 3/30/02. Slight disc speed up. was 90
   wetVelocity       = 55; // z0dd - ZOD, 3/30/02. Slight disc speed up. was 50
   velInheritFactor  = 0.75; // z0dd - ZOD, 3/30/02. was 0.5
   fizzleTimeMS      = 5000;
   lifetimeMS        = 5000;
   explodeOnDeath    = true;
   reflectOnWaterImpactAngle = 15.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 20.0; // z0dd - ZOD, 4/24/02. Was 0.0. 20 degrees skips off water
   fizzleUnderwaterMS        = 5000;

   activateDelayMS = 200;

   hasLight    = true;
   lightRadius = 6.0;
   lightColor  = "0.175 0.175 0.5";
};


datablock ItemData(T1Disc){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "t1disc.dts";
   image = T1DiscImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   pickUpName = "a T1 disc";
   ammoAmount = 15;
   ammo = DiscAmmo;
};


datablock ItemData(T1DiscAmmo)
{
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_disc.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "some spinfusor discs";
   computeCRC = true; // z0dd - ZOD, 5/19/03. Was missing this param
};


datablock ShapeBaseImageData(T1DiscImage){   
   className = T1WeaponImage;
   shapeFile = "t1disc.dts";
   item = T1Disc;
   ammo = T1DiscAmmo;
   offset = "0 0 0";
   emap = true;

   //projectileSpread = 1.0 / 1000.0; // z0dd - ZOD, 4/14/02. No disc spread.

   projectile = T1DiscProjectile;
   projectileType = LinearProjectile;

   // State Data
   stateName[0]                     = "Preactivate";
   stateTransitionOnLoaded[0]       = "Activate";
   stateTransitionOnNoAmmo[0]       = "NoAmmo";

   stateName[1]                     = "Activate";
   stateTransitionOnTimeout[1]      = "Ready";
   stateTimeoutValue[1]             = 0.5;
   stateSequence[1]                 = "Activated";
   stateSound[1]                    = T1DiscSwitchSound;

   stateName[2]                     = "Ready";
   stateTransitionOnNoAmmo[2]       = "NoAmmo";
   stateTransitionOnTriggerDown[2]  = "Fire";
   stateSequence[2]                 = "DiscSpin";
   stateSound[2]                    = T1DiscLoopSound;

   stateName[3]                     = "Fire";
   stateTransitionOnTimeout[3]      = "Reload";
   stateTimeoutValue[3]             = 1.25;
   stateFire[3]                     = true;
   stateRecoil[3]                   = LightRecoil;
   stateAllowImageChange[3]         = false;
   stateSequence[3]                 = "Fire";
   stateScript[3]                   = "onFire";
   stateSound[3]                    = T1DiscFireSound;

   stateName[4]                     = "Reload";
   stateTransitionOnNoAmmo[4]       = "NoAmmo";
   stateTransitionOnTimeout[4]      = "Ready";
   stateTimeoutValue[4]             = 0.5; // 0.25 load, 0.25 spinup
   stateAllowImageChange[4]         = false;
   stateSequence[4]                 = "Reload";
   stateSound[4]                    = T1DiscReloadSound;

   stateName[5]                     = "NoAmmo";
   stateTransitionOnAmmo[5]         = "Reload";
   stateSequence[5]                 = "NoAmmo";
   stateTransitionOnTriggerDown[5]  = "DryFire";

   stateName[6]                     = "DryFire";
   stateSound[6]                    = DiscDryFireSound;
   stateTimeoutValue[6]             = 1.0;
   stateTransitionOnTimeout[6]      = "NoAmmo";
};

function T1DiscImage::onMount(%this,%obj,%slot){ 
   Parent::onMount(%this, %obj, %slot);
}

function T1DiscImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);

}



//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
datablock AudioProfile(T1TargetingLaserPaintSound)
{
   filename    = "t1sounds/tgt_laser.wav";
   description = CloseLooping3d;
   preload = true;
};

datablock ItemData(T1TargetingLaser)
{
   className    = Weapon;
   catagory     = "Spawn Items";
   shapeFile    = "t1TargetLaser.dts";
   image        = T1TargetingLaserImage;
   mass         = 1;
   elasticity   = 0.2;
   friction     = 0.6;
   pickupRadius = 2;
	pickUpName = "a targeting laser rifle";

   computeCRC = true;

};

datablock TargetProjectileData(t1BasicTargeter)
{
   directDamage        	= 0.0;
   hasDamageRadius     	= false;
   indirectDamage      	= 0.0;
   damageRadius        	= 0.0;
   velInheritFactor    	= 1.0;

   maxRifleRange       	= 1000;
   beamColor           	= "0.1 1.0 0.1";
								
   startBeamWidth			= 0.05;
   pulseBeamWidth 	   = 0.05;
   beamFlareAngle 	   = 3.0;
   minFlareSize        	= 0.0;
   maxFlareSize        	= 400.0;
   pulseSpeed          	= 6.0;
   pulseLength         	= 0.150;

   textureName[0]      	= "special/nonlingradient";
   textureName[1]      	= "special/flare";
   textureName[2]      	= "special/pulse";
   textureName[3]      	= "special/expFlare";
   beacon               = true;
};


datablock ShapeBaseImageData(T1TargetingLaserImage)
{
   className = T1WeaponImage;

   shapeFile = "t1TargetLaser.dts";
   item = TargetingLaser;
   offset = "0 0 0";

   projectile = t1BasicTargeter;
   projectileType = TargetProjectile;
   deleteLastProjectile = true;

	usesEnergy = true;
	minEnergy = 3;

   stateName[0]                     = "Activate";
   stateSequence[0]                 = "Activate";
	stateSound[0]                    = T1DiscSwitchSound;
   stateTimeoutValue[0]             = 0.5;
   stateTransitionOnTimeout[0]      = "ActivateReady";

   stateName[1]                     = "ActivateReady";
   stateTransitionOnAmmo[1]         = "Ready";
   stateTransitionOnNoAmmo[1]       = "NoAmmo";

   stateName[2]                     = "Ready";
   stateTransitionOnNoAmmo[2]       = "NoAmmo";
   stateTransitionOnTriggerDown[2]  = "Fire";

   stateName[3]                     = "Fire";
	stateEnergyDrain[3]              = 3;
   stateFire[3]                     = true;
   stateAllowImageChange[3]         = false;
   stateScript[3]                   = "onFire";
   stateSequence[3]                 = "Fire";
   stateTransitionOnTriggerUp[3]    = "Deconstruction";
   stateTransitionOnNoAmmo[3]       = "Deconstruction";
   stateSound[3]                    = T1TargetingLaserPaintSound;

   stateName[4]                     = "NoAmmo";
   stateTransitionOnAmmo[4]         = "Ready";

   stateName[5]                     = "Deconstruction";
   stateScript[5]                   = "deconstruct";
   stateSequence[5] = "activate";
   stateTransitionOnTimeout[5]      = "Ready";
};

function T1TargetingLaserImage::onMount(%this,%obj,%slot){ 
   Parent::onMount(%this, %obj, %slot);
}

function T1TargetingLaserImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
}
function TargetingLaser::onUse(%data, %obj){
    if(Game.weaponOnUse(%data, %obj)){
       if (%obj.getDataBlock().className $= Armor){
         if(isObject(StarsiegeTribesMap)){
            %obj.mountImage(T1TargetingLaserImage, $WeaponSlot);
         }
         else{
            %obj.mountImage(TargetingLaserImage, $WeaponSlot);  
         }
       }
    }
 }
 
 function TargetingLaser::onThrow(%data,%obj,%plr){
   //parent::onThrow(%data,%obj,%plr);
   if(isObject(%obj) && isObject(StarsiegeTribesMap)){
      %obj.setDataBlock(T1TargetingLaser);
      %plr.unmountImage($WeaponSlot);
   }
 }

function giveTargetLaser(){
   %player = LocalClientConnection.player; 
   %player.setInventory("T1TargetingLaser", 1, true);
}

function T1TargetingLaserImage::onFire(%data,%obj,%slot)
{
   %p = Parent::onFire(%data, %obj, %slot);
   //--------------------------------------------------------
   // z0dd - ZOD, 9/3/02. Anti rapid fire mortar/missile fix.
   if(!%p)
   {
      return;	
   }
   //--------------------------------------------------------
   %p.setTarget(%obj.team);
}

////////////////////////////////////////////////////////////////////////////////////////////////
datablock ItemData(T1ELF){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "T1ELF.dts";
   image = T1ELFImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   pickUpName = "a T1 disc";
};
datablock ELFProjectileData(T1BasicELF)
{
   beamRange         = 38; // z0dd - ZOD, 5/18/02. WHAT?? INCREASE ELF RANGE?!!? was 37
   numControlPoints  = 8;
   restorativeFactor = 3.75;
   dragFactor        = 4.5;
   endFactor         = 2.25;
   randForceFactor   = 2;
   randForceTime     = 0.125;
	drainEnergy			= 1.0;
	drainHealth			= 0.01;
   directDamageType  = $DamageType::ELF;
	mainBeamWidth     = 0.1;           // width of blue wave beam
	mainBeamSpeed     = 9.0;            // speed that the beam travels forward
	mainBeamRepeat    = 0.25;           // number of times the texture repeats
   lightningWidth    = 0.1;
   lightningDist      = 0.15;           // distance of lightning from main beam

   fireSound    = ElfGunFireSound;
   wetFireSound = ElfFireWetSound;

	textures[0] = "special/ELFBeam";
   textures[1] = "special/ELFLightning";
   textures[2] = "special/BlueImpact";

   emitter = ELFSparksEmitter;
};

datablock ShapeBaseImageData(T1ELFImage){   
   className = T1WeaponImage;
   shapeFile = "T1ELF.dts";
   item = T1ELF;
   offset = "0 0 0";
   emap = true;

   projectile = T1BasicELF;
   projectileType = ELFProjectile;
   deleteLastProjectile = true;
   emap = true;
   

	usesEnergy = true;
 	minEnergy = 3;

   stateName[0]                     = "Activate";
   stateSequence[0]                 = "Activate";
	stateSound[0]                    = ELFGunSwitchSound;
   stateTimeoutValue[0]             = 0.5;
   stateTransitionOnTimeout[0]      = "ActivateReady";

   stateName[1]                     = "ActivateReady";
   stateTransitionOnAmmo[1]         = "Ready";
   stateTransitionOnNoAmmo[1]       = "NoAmmo";

   stateName[2]                     = "Ready";
   stateTransitionOnNoAmmo[2]       = "NoAmmo";
   stateTransitionOnTriggerDown[2]  = "CheckWet";

   stateName[3]                     = "Fire";
	stateEnergyDrain[3]              = 5;
   stateFire[3]                     = true;
   stateAllowImageChange[3]         = false;
   stateScript[3]                   = "onFire";
   stateTransitionOnTriggerUp[3]    = "Deconstruction";
   stateTransitionOnNoAmmo[3]       = "Deconstruction";
   //stateSound[3]                    = ElfFireWetSound;

   stateName[4]                     = "NoAmmo";
   stateTransitionOnAmmo[4]         = "Ready";

   stateName[5]                     = "Deconstruction";
   stateScript[5]                   = "deconstruct";
   stateTransitionOnTimeout[5]      = "Ready";
   stateTransitionOnNoAmmo[6]       = "NoAmmo";
   
   stateName[6]                     = "DryFire";
   stateSound[6]                    = ElfFireWetSound;
   stateTimeoutValue[6]             = 0.5;
   stateTransitionOnTimeout[6]      = "Ready";
   
   stateName[7]                     = "CheckWet";
   stateTransitionOnWet[7]          = "DryFire";
   stateTransitionOnNotWet[7]       = "Fire";
};

function T1ELFImage::onFire(%data, %obj, %slot)
{
   %p = Parent::onFire(%data, %obj, %slot);
   //--------------------------------------------------------
   // z0dd - ZOD, 9/3/02. Anti rapid fire mortar/missile fix.
   if(!%p)
   {
      return;	
   }
   //--------------------------------------------------------
   if(!%p.hasTarget())
      %obj.playAudio(0, ELFFireWetSound);
}

function T1ELFImage::onMount(%this,%obj,%slot){ 
   Parent::onMount(%this, %obj, %slot); 
}

function T1ELFImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
}

function giveELF(){
   %player = LocalClientConnection.player; 
   %player.setInventory("T1ELF", 1, true);
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

datablock AudioProfile(T1SniperFireSound)
{
   filename    = "t1sounds/sniper.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock AudioProfile(T1SniperExpSound)
{
   filename    = "t1sounds/laserhit.wav";
   description = AudioExplosion3d;
   preload = true;
};
datablock ExplosionData(T1SniperExplosion)
{
   explosionShape = "energy_explosion.dts";
   soundProfile   = T1SniperExpSound;

   particleEmitter = SniperExplosionEmitter;
   particleDensity = 150;
   particleRadius = 0.25;

   faceViewer           = false;
};


//--------------------------------------
// Projectile
//--------------------------------------
datablock SniperProjectileData(T1BasicSniperShot)
{
   directDamage        = 0.4;
   hasDamageRadius     = false;
   indirectDamage      = 0.0;
   damageRadius        = 0.0;
   velInheritFactor    = 1.0;
   sound 				  = "";
   explosion           = "T1SniperExplosion";
   splash              = SniperSplash;
   directDamageType    = $DamageType::Laser;

   maxRifleRange       = 1000;
   rifleHeadMultiplier = 1.3;
   beamColor           = "1 0.1 0.1";
   fadeTime            = 1.0;

   startBeamWidth		  = 0.145;
   endBeamWidth 	     = 0.25;
   pulseBeamWidth 	  = 0.5;
   beamFlareAngle 	  = 3.0;
   minFlareSize        = 0.0;
   maxFlareSize        = 400.0;
   pulseSpeed          = 6.0;
   pulseLength         = 0.150;

   lightRadius         = 1.0;
   lightColor          = "0.3 0.0 0.0";

   textureName[0]      = "special/flare";
   textureName[1]      = "special/nonlingradient";
   textureName[2]      = "special/laserrip01";
   textureName[3]      = "special/laserrip02";
   textureName[4]      = "special/laserrip03";
   textureName[5]      = "special/laserrip04";
   textureName[6]      = "special/laserrip05";
   textureName[7]      = "special/laserrip06";
   textureName[8]      = "special/laserrip07";
   textureName[9]      = "special/laserrip08";
   textureName[10]     = "special/laserrip09";
   textureName[11]     = "special/sniper00";

};

datablock ItemData(T1Sniper){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "t1sniper.dts";
   image = T1SniperImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   pickUpName = "a T1 disc";
};

datablock ShapeBaseImageData(T1SniperImage){   
   className = T1WeaponImage;
   shapeFile = "t1sniper.dts";
   item = T1Sniper;
   //ammo = PlasmaAmmo;
   offset = "0 0 0";
   emap = true;

   projectile = T1BasicSniperShot;
   projectileType = SniperProjectile;
  // armThread = looksn;
   // z0dd - ZOD, 5/07/04. Use ammo if gameplay changes in affect
   usesEnergy = $Host::ClassicLoadSniperChanges ? false : true;
   minEnergy = 6;

   stateName[0]                     = "Activate";
   stateTransitionOnTimeout[0]      = "ActivateReady";
   stateSound[0]                    = SniperRifleSwitchSound;
   stateTimeoutValue[0]             = 0.5;
   stateSequence[0]                 = "Activate";

   stateName[1]                     = "ActivateReady";
   stateTransitionOnLoaded[1]       = "Ready";
   stateTransitionOnNoAmmo[1]       = "NoAmmo";

   stateName[2]                     = "Ready";
   stateTransitionOnNoAmmo[2]       = "NoAmmo";
   stateTransitionOnTriggerDown[2]  = "CheckWet";

   stateName[3]                     = "Fire";
   stateTransitionOnTimeout[3]      = "Reload";
   stateTimeoutValue[3]             = 0.5;
   stateFire[3]                     = true;
   stateAllowImageChange[3]         = false;
   stateSequence[3]                 = "Fire";
   stateScript[3]                   = "onFire";

   stateName[4]                     = "Reload";
   stateTransitionOnTimeout[4]      = "Ready";
   stateTimeoutValue[4]             = 0.5;
   stateAllowImageChange[4]         = false;

   stateName[5]                     = "CheckWet";
   stateTransitionOnWet[5]          = "DryFire";
   stateTransitionOnNotWet[5]       = "Fire";
   
   stateName[6]                     = "NoAmmo";
   stateTransitionOnAmmo[6]         = "Reload";
   stateTransitionOnTriggerDown[6]  = "DryFire";
   stateSequence[6]                 = "NoAmmo";
   
   stateName[7]                     = "DryFire";
   stateSound[7]                    = SniperRifleDryFireSound;
   stateTimeoutValue[7]             = 0.5;
   stateTransitionOnTimeout[7]      = "Ready";
};
function T1SniperImage::onFire(%data,%obj,%slot)
{
   if(!%obj.hasEnergyPack || %obj.getEnergyLevel() < %this.minEnergy) // z0dd - ZOD, 5/22/03. Check for energy too.
   {
      // siddown Junior, you can't use it
      serverPlay3D(SniperRifleDryFireSound, %obj.getTransform());
      return;
   }

   %pct = %obj.getEnergyLevel() / %obj.getDataBlock().maxEnergy;
   %p = new (%data.projectileType)() {
      dataBlock        = %data.projectile;
      initialDirection = %obj.getMuzzleVector(%slot);
      initialPosition  = %obj.getMuzzlePoint(%slot);
      sourceObject     = %obj;
      damageFactor     = %pct * %pct;
      sourceSlot       = %slot;
   };
   %p.setEnergyPercentage(%pct);

   %obj.lastProjectile = %p;
   MissionCleanup.add(%p);
   serverPlay3D(T1SniperFireSound, %obj.getTransform());
   
   // AI hook
   if(%obj.client)
      %obj.client.projectile = %p;

   %obj.setEnergyLevel(0);
   if($Host::ClassicLoadSniperChanges)
      %obj.decInventory(%data.ammo, 1);
}

function T1SniperImage::onMount(%this,%obj,%slot){ 
   Parent::onMount(%this, %obj, %slot);
}

function T1SniperImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
}

function giveSniper(){ 
   %player = LocalClientConnection.player; 
   %player.setInventory("T1Sniper", 1, true);
   //%player.setInventory("PlasmaAmmo", 25, true);
}


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

datablock AudioProfile(T1BlasterFireSound)
{
   filename    = "t1sounds/rifle1.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock AudioProfile(T1BlasterExpSound)
{
   filename    = "t1sounds/energyexp.wav";
   description = AudioExplosion3d;
   preload = true;
};


datablock ExplosionData(T1BlasterExplosion)
{
   soundProfile   = T1BlasterExpSound;
   emitter[0]     = BlasterExplosionEmitter;
   emitter[1]     = BlasterExplosionEmitter2;
};

datablock EnergyProjectileData(T1EnergyBolt)
{
   emitterDelay        = -1;
   // z0dd - ZOD, 5/07/04. Less damage shotgun blaster is gameplay changes in affect
   directDamage        = $Host::ClassicLoadBlasterChanges ? 0.05 : 0.15;
   directDamageType    = $DamageType::Blaster;
   kickBackStrength    = 0.0;
   bubbleEmitTime      = 1.0;
   // z0dd - ZOD, 5/07/04. Shotgun blaster no sound when gameplay changes in affect
   sound = "";
   velInheritFactor    = 0.5;

   explosion           = "T1BlasterExplosion";
   splash              = BlasterSplash;


   grenadeElasticity = 0.998;
   grenadeFriction   = 0.0;
   armingDelayMS     = 500;

   muzzleVelocity    = 90.0;

   drag = 0.05;

   gravityMod        = 0.0;

   dryVelocity       = 200.0;
   wetVelocity       = 150.0;

   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 3000;

   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "0.5 0.175 0.175";

   scale = "0.25 20.0 1.0";
   crossViewAng = 0.99;
   crossSize = 0.55;

   lifetimeMS     = 3000;
   blurLifetime   = 0.2;
   blurWidth      = 0.25;
   blurColor = "0.4 0.0 0.0 1.0";

   texture[0] = "special/blasterBolt";
   texture[1] = "special/blasterBoltCross";
};


datablock ItemData(T1Blaster){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "t1blaster.dts";
   image = T1BlasterImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   pickUpName = "a T1 disc";
};

datablock ShapeBaseImageData(T1BlasterImage){   
   className = T1WeaponImage;
   shapeFile = "t1blaster.dts";
   item = T1Blaster;
   //ammo = PlasmaAmmo;
   offset = "0 0 0";
   emap = true;

   projectile = T1EnergyBolt;
   projectileType = EnergyProjectile;

   usesEnergy = true;
   // z0dd - ZOD, 5/07/04. More drain shotgun blaster is gameplay changes in affect
   fireEnergy = $Host::ClassicLoadBlasterChanges ? 8 : 4;
   minEnergy = $Host::ClassicLoadBlasterChanges ? 8 : 4;

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";
   stateSound[0] = T1DiscSwitchSound;

   stateName[1] = "ActivateReady";
   stateTransitionOnLoaded[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "NoAmmo";

   stateName[2] = "Ready";
   stateSequence[2] = "Activate";
   stateTransitionOnNoAmmo[2] = "NoAmmo";
   stateTransitionOnTriggerDown[2] = "Fire";

   stateName[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 0.3;
   stateFire[3] = true;
   stateRecoil[3] = NoRecoil;
   stateAllowImageChange[3] = false;
   //stateSequence[3] = "Fire";
   stateSound[3] = T1BlasterFireSound;
   stateScript[3] = "onFire";

   stateName[4] = "Reload";
   stateTransitionOnNoAmmo[4] = "NoAmmo";
   stateTransitionOnTimeout[4] = "Ready";
   stateAllowImageChange[4] = false;
   //stateSequence[4] = "Reload";

   stateName[5] = "NoAmmo";
   stateTransitionOnAmmo[5] = "Reload";
   //stateSequence[5] = "NoAmmo";
   stateTransitionOnTriggerDown[5] = "DryFire";
   
   stateName[6] = "DryFire";
   stateTimeoutValue[6] = 0.3;
   stateSound[6] = BlasterDryFireSound;
   stateTransitionOnTimeout[6] = "Ready";
};

function T1BlasterImage::onMount(%this,%obj,%slot){ 
   Parent::onMount(%this, %obj, %slot);
}

function T1BlasterImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
}

function giveBlaster(){
   %player = LocalClientConnection.player; 
   %player.setInventory("T1Blaster", 1, true);
   //%player.setInventory("PlasmaAmmo", 25, true);
}


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

datablock AudioProfile(T1PlasmaFireSound)
{
   filename    = "t1sounds/Plasma2.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock AudioProfile(T1plasmaExpSound)
{
   filename    = "t1sounds/Explo4.wav";
   description = AudioExplosion3d;
   preload = true;
};
datablock ExplosionData(T1PlasmaBoltExplosion)
{
   explosionShape = "effect_plasma_explosion.dts";
   soundProfile   = T1plasmaExpSound;
   particleEmitter = PlasmaExplosionEmitter;
   particleDensity = 150;
   particleRadius = 1.25;
   faceViewer = true;

   sizes[0] = "1.0 1.0 1.0";
   sizes[1] = "1.0 1.0 1.0";
   times[0] = 0.0;
   times[1] = 1.5;
};


datablock LinearFlareProjectileData(T1PlasmaBolt)
{
   projectileShapeName = "plasmabolt.dts";
   scale               = "2.0 2.0 2.0";
   faceViewer          = true;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.45;
   damageRadius        = 4.0;
   kickBackStrength    = 0.0;
   radiusDamageType    = $DamageType::Plasma;

   explosion           = "T1PlasmaBoltExplosion";
   splash              = PlasmaSplash;

   dryVelocity       = 70.0; // z0dd - ZOD, 7/20/02. Faster plasma projectile. was 55
   wetVelocity       = -1;
   velInheritFactor  = 0.3;
   fizzleTimeMS      = 2000;
   lifetimeMS        = 3000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   //activateDelayMS = 100;
   activateDelayMS = -1;

   size[0]           = 0.2;
   size[1]           = 0.5;
   size[2]           = 0.1;


   numFlares         = 35;
   flareColor        = "1 0.75 0.25";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

	sound        = PlasmaProjectileSound;
   fireSound    = PlasmaFireSound;
   wetFireSound = PlasmaFireWetSound;
   
   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "1 0.75 0.25";
};




datablock ItemData(T1Plasma){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "t1plasma.dts";
   image = T1PlasmaImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   pickUpName = "a T1 disc";
   ammoAmount = 30;
   ammo = PlasmaAmmo;
};

datablock ItemData(T1PlasmaAmmo)
{
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_disc.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "some plasma rounds";
   computeCRC = true; // z0dd - ZOD, 5/19/03. Was missing this param
};

datablock ShapeBaseImageData(T1PlasmaImage){   
   className = T1WeaponImage;
   shapeFile = "t1plasma.dts";
   item = T1Plasma;
   ammo = T1PlasmaAmmo;
   offset = "0 0 0";
   emap = true;

    projectile = T1PlasmaBolt;
   projectileType = LinearFlareProjectile;

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";
   stateSound[0] = T1DiscSwitchSound;

   stateName[1] = "ActivateReady";
   stateTransitionOnLoaded[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "NoAmmo";

   stateName[2] = "Ready";
   stateTransitionOnNoAmmo[2] = "NoAmmo";
   stateTransitionOnTriggerDown[2] = "CheckWet";

   stateName[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 0.1;
   stateFire[3] = true;
   stateRecoil[3] = LightRecoil;
   stateAllowImageChange[3] = false;
   stateScript[3] = "onFire";
   stateSequence[3] = "Fire";
   stateEmitterTime[3] = 0.2;
   stateSound[3] = T1PlasmaFireSound;

   stateName[4] = "Reload";
   stateTransitionOnNoAmmo[4] = "NoAmmo";
   stateTransitionOnTimeout[4] = "Ready";
   stateTimeoutValue[4] = 0.6;
   stateAllowImageChange[4] = false;
   stateSequence[4] = "Reload";
   //stateSound[4] = PlasmaReloadSound;

   stateName[5] = "NoAmmo";
   stateTransitionOnAmmo[5] = "Reload";
   stateSequence[5] = "NoAmmo";
   stateTransitionOnTriggerDown[5] = "DryFire";

   stateName[6]       = "DryFire";
   stateSound[6]      = PlasmaDryFireSound;
   stateTimeoutValue[6]        = 1.5;
   stateTransitionOnTimeout[6] = "NoAmmo";
   
   stateName[7]       = "WetFire";
   stateSound[7]      = PlasmaFireWetSound;
   stateTimeoutValue[7]        = 1.5;
   stateTransitionOnTimeout[7] = "Ready";
   
   stateName[8]               = "CheckWet";
   stateTransitionOnWet[8]    = "WetFire";
   stateTransitionOnNotWet[8] = "Fire"; 
};

function T1PlasmaImage::onMount(%this,%obj,%slot){ 
   Parent::onMount(%this, %obj, %slot);
}

function T1PlasmaImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
}

function givePlasma(){
   %player = LocalClientConnection.player; 
   %player.setInventory("T1Plasma", 1, true);
   %player.setInventory("PlasmaAmmo", 25, true);
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

datablock AudioProfile(T1MortarFireSound)
{
   filename    = "t1sounds/mortar_fire.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock AudioProfile(T1MortarExpSound)
{
   filename    = "t1sounds/shockexp.wav";
   description = AudioExplosion3d;
   preload = true;
};

datablock AudioProfile(T1MortarReloadSound)
{
   filename    = "t1sounds/Mortar_reload.wav";
   description = AudioExplosion3d;
   preload = true;
};

datablock AudioProfile(T1MortarIdleSound)
{
   filename    = "t1sounds/mortar_idle.wav";
   description = AudioDefaultLooping3d;
   preload = true;
};

datablock ItemData(T1Mortar){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "t1mortar.dts"; 
   image = T1MortarImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   pickUpName = "a T1 disc";
   ammoAmount = 10;
   ammo = MortarAmmo;
};

datablock ItemData(T1MortarAmmo)
{
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_disc.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "some mortar rounds";
   computeCRC = true; // z0dd - ZOD, 5/19/03. Was missing this param
};


datablock ExplosionData(T1MortarExplosion)
{
   soundProfile   = T1MortarExpSound;

   shockwave = MortarShockwave;
   shockwaveOnTerrain = true;

   subExplosion[0] = MortarSubExplosion1;
   subExplosion[1] = MortarSubExplosion2;
   subExplosion[2] = MortarSubExplosion3;

   emitter[0] = MortarExplosionSmokeEmitter;
   emitter[1] = MortarCrescentEmitter;

   shakeCamera = true;
   camShakeFreq = "8.0 9.0 7.0";
   camShakeAmp = "100.0 100.0 100.0";
   camShakeDuration = 1.3;
   camShakeRadius = 25.0;
};

datablock GrenadeProjectileData(T1MortarShot)
{
   projectileShapeName = "mortar_projectile.dts";
   emitterDelay        = -1;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 1.0;
   damageRadius        = 19.0; // z0dd - ZOD, 8/13/02. Was 20.0
   radiusDamageType    = $DamageType::Mortar;
   kickBackStrength    = 2500;

   explosion           = "T1MortarExplosion";
   underwaterExplosion = "UnderwaterMortarExplosion";
   velInheritFactor    = 0.5;
   splash              = MortarSplash;
   depthTolerance      = 10.0; // depth at which it uses underwater explosion
   
   baseEmitter         = MortarSmokeEmitter;
   bubbleEmitter       = MortarBubbleEmitter;
   
   grenadeElasticity = 0.15;
   grenadeFriction   = 0.4;
   armingDelayMS     = 1500; // z0dd - ZOD, 4/14/02. Was 2000

   gravityMod        = 1.1;  // z0dd - ZOD, 5/18/02. Make mortar projectile heavier, less floaty
   muzzleVelocity    = 75.95; // z0dd - ZOD, 8/13/02. More velocity to compensate for higher gravity. Was 63.7
   drag              = 0.1;
   sound	     = MortarProjectileSound;

   hasLight    = true;
   lightRadius = 4;
   lightColor  = "0.05 0.2 0.05";

   hasLightUnderwaterColor = true;
   underWaterLightColor = "0.05 0.075 0.2";

   // z0dd - ZOD, 5/22/03. Limit the mortars effective range to around 450 meters.
   // Addresses long range mortar spam exploit.
   explodeOnDeath = $Host::ClassicLoadMortarChanges ? true : false;
   fizzleTimeMS = $Host::ClassicLoadMortarChanges ? 8000 : -1;
   lifetimeMS = $Host::ClassicLoadMortarChanges ? 10000 : -1;
   fizzleUnderwaterMS = $Host::ClassicLoadMortarChanges ? 8000 : -1;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact = false;
   deflectionOnWaterImpact = 0.0;
};

datablock ShapeBaseImageData(T1MortarImage){   
   className = T1WeaponImage;
   shapeFile = "t1mortar.dts";
   item = T1Mortar;
   ammo = T1MortarAmmo;
   offset = "0 0 0";
   emap = true;

   projectile = T1MortarShot;
   projectileType = GrenadeProjectile;

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";
   stateSound[0] = T1DiscSwitchSound;

   stateName[1] = "ActivateReady";
   stateTransitionOnAmmo[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "FirstLoad";

   stateName[2] = "Ready";
   stateTransitionOnNoAmmo[2] = "NoAmmo";
   stateTransitionOnTriggerDown[2] = "Fire";
   stateSound[2] = T1MortarIdleSound;

   stateName[3] = "Fire";
   stateSequence[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 0.8;
   stateFire[3] = true;
   stateRecoil[3] = LightRecoil;
   stateAllowImageChange[3] = false;
   stateScript[3] = "onFire";
   stateSound[3] = T1MortarFireSound;

   stateName[4] = "Reload";
   stateTransitionOnNoAmmo[4] = "NoAmmo";
   stateTransitionOnTimeout[4] = "Ready";
   stateTimeoutValue[4] = 2.0;
   stateAllowImageChange[4] = false;
   stateSequence[4] = "Reload";
   stateSound[4] = T1MortarReloadSound;

   stateName[5] = "NoAmmo";
   stateTransitionOnAmmo[5] = "Reload";
   stateSequence[5] = "NoAmmo";
   stateTransitionOnTriggerDown[5] = "DryFire";

   stateName[6]       = "DryFire";
   stateSound[6]      = MortarDryFireSound;
   stateTimeoutValue[6]        = 1.5;
   stateTransitionOnTimeout[6] = "NoAmmo";
   
   stateName[7] = "FirstLoad";
   stateTransitionOnAmmo[7] = "Ready";
};

function T1MortarImage::onMount(%this,%obj,%slot){ 
   Parent::onMount(%this, %obj, %slot);
}

function T1MortarImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
}

function giveMortar(){
   %player = LocalClientConnection.player; 
   %player.setInventory("T1Mortar", 1, true);
   %player.setInventory("MortarAmmo", 25, true);
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

datablock AudioProfile(T1GLFireSound)
{
   filename    = "t1sounds/Grenade.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock AudioProfile(T1GLExpSound)
{
   filename    = "t1sounds/EXPLO3.wav";
   description = AudioExplosion3d;
   preload = true;
};

datablock AudioProfile(T1GLReloadSound)
{
   filename    = "t1sounds/Dryfire1.wav";
   description = AudioExplosion3d;
   preload = true;
};


datablock ExplosionData(T1GrenadeExplosion)
{
   soundProfile   = T1GLExpSound;

   faceViewer           = true;
   explosionScale = "0.8 0.8 0.8";

   debris = GrenadeDebris;
   debrisThetaMin = 10;
   debrisThetaMax = 50;
   debrisNum = 8;
   debrisVelocity = 26.0;
   debrisVelocityVariance = 7.0;

   emitter[0] = GrenadeDustEmitter;
   emitter[1] = GExplosionSmokeEmitter;
   emitter[2] = GrenadeSparksEmitter;

   shakeCamera = true;
   camShakeFreq = "10.0 6.0 9.0";
   camShakeAmp = "20.0 20.0 20.0";
   camShakeDuration = 0.5;
   camShakeRadius = 20.0;
};

datablock GrenadeProjectileData(T1BasicGrenade)
{
   projectileShapeName = "grenade_projectile.dts";
   emitterDelay        = -1;
   directDamage        = 0.0;
   hasDamageRadius     = true;
   indirectDamage      = 0.40;
   damageRadius        = 15.0;
   radiusDamageType    = $DamageType::Grenade;
   kickBackStrength    = 1500;
   bubbleEmitTime      = 1.0;

   sound               = GrenadeProjectileSound;
   explosion           = "T1GrenadeExplosion";
   underwaterExplosion = "UnderwaterGrenadeExplosion";
   velInheritFactor    = 0.85; // z0dd - ZOD, 3/30/02. Was 0.5
   splash              = GrenadeSplash;

   baseEmitter         = GrenadeSmokeEmitter;
   bubbleEmitter       = GrenadeBubbleEmitter;

   grenadeElasticity = 0.30; // z0dd - ZOD, 9/13/02. Was 0.35
   grenadeFriction   = 0.2;
   armingDelayMS     = 650; // z0dd - ZOD, 9/13/02. Was 1000
   muzzleVelocity    = 75.00; // z0dd - ZOD, 3/30/02. GL projectile is faster. Was 47.00
   //drag = 0.1; // z0dd - ZOD, 3/30/02. No drag.
   gravityMod        = 1.9; // z0dd - ZOD, 5/18/02. Make GL projectile heavier, less floaty
};

datablock ItemData(T1GL){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "t1GrenadeLauncher.dts"; 
   image = T1GLImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   pickUpName = "a T1 disc";
   ammoAmount = 10;
   ammo = GrenadeLauncherAmmo;
};

datablock ItemData(T1GrenadeLauncherAmmo)
{
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_disc.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "some grenade launcher rounds";
   computeCRC = true; // z0dd - ZOD, 5/19/03. Was missing this param
};


datablock ShapeBaseImageData(T1GLImage){   
   className = T1WeaponImage;
   shapeFile = "t1GrenadeLauncher.dts";
   item = T1GL;
   ammo = T1GrenadeLauncherAmmo;
   offset = "0 0 0";
   emap = true;

   projectile = T1BasicGrenade;
   projectileType = GrenadeProjectile;

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.5;
   stateSequence[0] = "Activate";
   stateSound[0] = T1DiscSwitchSound;

   stateName[1] = "ActivateReady";
   stateTransitionOnLoaded[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "NoAmmo";

   stateName[2] = "Ready";
   stateTransitionOnNoAmmo[2] = "NoAmmo";
   stateTransitionOnTriggerDown[2] = "Fire";

   stateName[3] = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3] = 0.4;
   stateFire[3] = true;
   stateRecoil[3] = LightRecoil;
   stateAllowImageChange[3] = false;
   stateSequence[3] = "Fire";
   stateScript[3] = "onFire";
   stateSound[3] = T1GLFireSound;

   stateName[4] = "Reload";
   stateTransitionOnNoAmmo[4] = "NoAmmo";
   stateTransitionOnTimeout[4] = "Ready";
   stateTimeoutValue[4] = 0.5;
   stateAllowImageChange[4] = false;
   stateSequence[4] = "Reload";
   stateSound[4] = T1GLReloadSound;

   stateName[5] = "NoAmmo";
   stateTransitionOnAmmo[5] = "Reload";
   stateSequence[5] = "NoAmmo";
   stateTransitionOnTriggerDown[5] = "DryFire";

   stateName[6]       = "DryFire";
   stateSound[6]      = GrenadeDryFireSound;
   stateTimeoutValue[6]        = 1.5;
   stateTransitionOnTimeout[6] = "NoAmmo";
};

function T1GLImage::onMount(%this,%obj,%slot){ 
   Parent::onMount(%this, %obj, %slot);
}

function T1GLImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
}

function giveGL(){
   %player = LocalClientConnection.player; 
   %player.setInventory("T1GL", 1, true);
   %player.setInventory("GrenadeLauncherAmmo", 25, true);
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

datablock AudioProfile(T1ChaingunFireSound)
{
   filename    = "t1sounds/machinegun.wav";
   description = AudioDefaultLooping3d;
   preload = true;
};
datablock AudioProfile(T1ChaingunSpinDownSound)
{
   filename    = "t1sounds/Machgun2.wav";
   description = AudioClosest3d;
   preload = true;
};

datablock AudioProfile(T1ChaingunSpinUpSound)
{
   filename    = "t1sounds/machgun3.wav";
   description = AudioClosest3d;
   preload = true;
};

datablock AudioProfile(T1ChaingunImpact1)
{
   filename    = "t1sounds/Ricoche1.wav";
   description = AudioClosest3d;
   preload = true;
};
datablock AudioProfile(T1ChaingunImpact2)
{
   filename    = "t1sounds/Ricoche2.wav";
   description = AudioClosest3d;
   preload = true;
};
datablock AudioProfile(T1ChaingunImpact3)
{
   filename    = "t1sounds/Ricoche3.wav";
   description = AudioClosest3d;
   preload = true;
};
datablock ExplosionData(T1ChaingunExplosion1)
{
   soundProfile   = T1ChaingunImpact1;

   emitter[0] = ChaingunImpactSmoke;
   emitter[1] = ChaingunSparkEmitter;

   faceViewer           = false;
};
datablock ExplosionData(T1ChaingunExplosion2)
{
   soundProfile   = T1ChaingunImpact2;

   emitter[0] = ChaingunImpactSmoke;
   emitter[1] = ChaingunSparkEmitter;

   faceViewer           = false;
};
datablock ExplosionData(T1ChaingunExplosion3)
{
   soundProfile   = T1ChaingunImpact3;

   emitter[0] = ChaingunImpactSmoke;
   emitter[1] = ChaingunSparkEmitter;

   faceViewer           = false;
};

datablock TracerProjectileData(t1ChaingunBullet1)
{
   doDynamicClientHits = true;
   directDamage        = 0.0825;
   directDamageType    = $DamageType::Bullet;
   explosion           = "T1ChaingunExplosion1";
   splash              = ChaingunSplash;
   kickBackStrength  = 0.0;
   sound = ChaingunProjectile;
   dryVelocity       = 750.0; // z0dd - ZOD, 7/12/03. Was 425.0
   wetVelocity       = 280.0; // z0dd - ZOD, 7/12/03. Was 100.0
   velInheritFactor  = 1.0;
   fizzleTimeMS      = 3000;
   lifetimeMS        = 3000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 3000;
   tracerLength    = 30.0; // z0dd - ZOD, 7/12/03. Was 15.0
   tracerAlpha     = false;
   tracerMinPixels = 6;
   tracerColor     = 211.0/255.0 @ " " @ 215.0/255.0 @ " " @ 120.0/255.0 @ " 0.75";
   tracerTex[0] = "special/tracer00";
   tracerTex[1] = "special/tracercross";
   tracerWidth  = 0.20; // z0dd - ZOD, 7/12/03. Was 0.10
   crossSize       = 0.20;
   crossViewAng    = 0.990;
   renderCross     = true;
   decalData[0] = ChaingunDecal1;
   decalData[1] = ChaingunDecal2;
   decalData[2] = ChaingunDecal3;
   decalData[3] = ChaingunDecal4;
   decalData[4] = ChaingunDecal5;
   decalData[5] = ChaingunDecal6;
};

datablock TracerProjectileData(t1ChaingunBullet2) : t1ChaingunBullet1 { 
   explosion           = "T1ChaingunExplosion2";
};

datablock TracerProjectileData(t1ChaingunBullet3) : t1ChaingunBullet1 { 
   explosion           = "T1ChaingunExplosion3";
}; 

datablock ItemData(T1ChainGun){
   className = Weapon;
   catagory = "Spawn Items";
   shapeFile = "t1Chaingun.dts"; 
   image = T1ChainGunImage;
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   pickUpName = "a T1 chaingun";
   ammoAmount = 200;
   ammo = ChaingunAmmo;
};

datablock ItemData(T1ChaingunAmmo)
{
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_disc.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "some spinfusor discs";
   computeCRC = true; // z0dd - ZOD, 5/19/03. Was missing this param
};


datablock ShapeBaseImageData(T1ChainGunImage){   
   className = T1WeaponImage;
   shapeFile = "t1Chaingun.dts";

   item = T1ChainGun;
   ammo = T1ChaingunAmmo;
   offset = "0 0.01 0";
   emap = true;

   projectile = t1ChaingunBullet1;
   projectileType = TracerProjectile;
   emap = true;

   casing              = ShellDebris;
   shellExitDir        = "1.0 0.3 1.0";
   shellExitOffset     = "0.15 -0.56 -0.1";
   shellExitVariance   = 15.0;
   shellVelocity       = 3.0;

   projectileSpread = 6.0 / 1000.0; // z0dd - ZOD, 7/12/03. Was 8.0

   //--------------------------------------
   stateName[0]             = "Activate";
   stateSequence[0]         = "Activate";
   stateSound[0]            = T1DiscSwitchSound;
   stateAllowImageChange[0] = false;
   //
   stateTimeoutValue[0]        = 0.5;
   stateTransitionOnTimeout[0] = "Ready";
   stateTransitionOnNoAmmo[0]  = "NoAmmo";

   //--------------------------------------
   stateName[1]       = "Ready";
   stateSpinThread[1] = Stop;
   //
   stateTransitionOnTriggerDown[1] = "Spinup";
   stateTransitionOnNoAmmo[1]      = "NoAmmo";
   stateSequence[1]         = "Activate";

   //--------------------------------------
   stateName[2]               = "NoAmmo";
   stateTransitionOnAmmo[2]   = "Ready";
   stateSpinThread[2]         = Stop;
   stateTransitionOnTriggerDown[2] = "DryFire";

   //--------------------------------------
   stateName[3]         = "Spinup";
   stateSpinThread[3]   = SpinUp;
   stateSound[3]        = T1ChaingunSpinupSound;
   //
   stateTimeoutValue[3]          = 0.5;
   stateWaitForTimeout[3]        = false;
   stateTransitionOnTimeout[3]   = "Fire";
   stateTransitionOnTriggerUp[3] = "Spindown";

   //--------------------------------------
   stateName[4]             = "Fire";
   stateSequence[4]            = "Fire";
   stateSequenceRandomFlash[4] = true;
   stateSpinThread[4]       = FullSpeed;
   stateSound[4]            = T1ChaingunFireSound;
   //stateRecoil[4]           = LightRecoil;
   stateAllowImageChange[4] = false;
   stateScript[4]           = "onFire";
   stateFire[4]             = true;
   stateEjectShell[4]       = true;
   //
   stateTimeoutValue[4]          = 0.15;
   stateTransitionOnTimeout[4]   = "Fire";
   stateTransitionOnTriggerUp[4] = "Spindown";
   stateTransitionOnNoAmmo[4]    = "EmptySpindown";

   //--------------------------------------
   stateName[5]       = "Spindown";
   stateSound[5]      = T1ChaingunSpinDownSound;
   stateSpinThread[5] = SpinDown;
   stateSequence[5]         = "Activate";
   //
   stateTimeoutValue[5]            = 1.0;
   stateWaitForTimeout[5]          = true;
   stateTransitionOnTimeout[5]     = "Ready";
   stateTransitionOnTriggerDown[5] = "Spinup";

   //--------------------------------------
   stateName[6]       = "EmptySpindown";
   stateSound[6]      = T1ChaingunSpinDownSound;
   stateSpinThread[6] = SpinDown;
   stateSequence[6]         = "Activate";
   //
   stateTimeoutValue[6]        = 0.5;
   stateTransitionOnTimeout[6] = "NoAmmo";
   
   //--------------------------------------
   stateName[7]       = "DryFire";
   stateSound[7]      = ChaingunDryFireSound;
   stateTimeoutValue[7]        = 0.5;
   stateTransitionOnTimeout[7] = "NoAmmo";
};

function T1ChainGunImage::onFire(%data, %obj, %slot){
   %vector = %obj.getMuzzleVector(%slot);
   %x = (getRandom() - 0.5) * 2 * 3.1415926 * %data.projectileSpread;
   %y = (getRandom() - 0.5) * 2 * 3.1415926 * %data.projectileSpread;
   %z = (getRandom() - 0.5) * 2 * 3.1415926 * %data.projectileSpread;
   %mat = MatrixCreateFromEuler(%x @ " " @ %y @ " " @ %z);
   %vector = MatrixMulVector(%mat, %vector);

   %p = new (%data.projectileType)() {
      dataBlock        = "t1ChaingunBullet" @ getRandom(1,3);
      initialDirection = %vector;
      initialPosition  = %obj.getMuzzlePoint(%slot);
      sourceObject     = %obj;
      sourceSlot       = %slot;
   };
   MissionCleanup.add(%p);
   %obj.decInventory(%data.ammo,1);
   %obj.lastProjectile = %p;
   %client.projectile = %p; 
   return %p;
}


function T1ChainGunImage::onMount(%this,%obj,%slot){ 
   Parent::onMount(%this, %obj, %slot); 
}

function T1ChainGunImage::onUnmount(%this,%obj,%slot){
   Parent::onUnmount(%this, %obj, %slot);
}

function giveCG(){
   %player = LocalClientConnection.player; 
   %player.setInventory("T1ChainGun", 1, true);
   %player.setInventory("T1ChaingunAmmo", 200, true);
}

datablock AudioProfile(t1SensorHumSound)
{
   filename    = "t1sounds/pulse_power.wav";
   description = CloseLooping3d;
   preload = true;
};

datablock StaticShapeData(t1SensorMediumPulse) : StaticShapeDamageProfile
{
   className = Sensor;  
   catagory = "Sensors";
   shapeFile = "t1mSensor.dts"; 
   maxDamage = 1.2;
   destroyedLevel = 1.2;
   disabledLevel = 1.2;
   explosion      = ShapeExplosion;
   expDmgRadius = 7.0;
   expDamage = 0.4;
   expImpulse = 1500;

   dynamicType = $TypeMasks::SensorObjectType;
   isShielded = true;
   energyPerDamagePoint = 33;
   maxEnergy = 90;
   rechargeRate = 0.31;
   ambientThreadPowered = true;
   humSound = t1SensorHumSound;

   cmdCategory = "Support";
   cmdIcon = CMDSensorIcon;
   cmdMiniIconName = "commander/MiniIcons/com_sensor_grey";
   targetNameTag = 'Medium';
   targetTypeTag = 'Sensor';
   sensorData = SensorMedPulseObj;
   sensorRadius = SensorMedPulseObj.detectRadius;
   sensorColor = "255 194 9";

   debrisShapeName = "debris_generic.dts";
   debris = StaticShapeDebris;
};

datablock StaticShapeData(t1SensorLargePulse) : StaticShapeDamageProfile
{
   className = Sensor;  
   catagory = "Sensors";
   shapeFile = "t1LSensor.dts";
   maxDamage = 1.5;
   destroyedLevel = 1.5;
   disabledLevel = 0.85;
   explosion      = ShapeExplosion;
   expDmgRadius = 10.0;
   expDamage = 0.5;
   expImpulse = 2000.0;

   dynamicType = $TypeMasks::SensorObjectType;
   isShielded = true;
   energyPerDamagePoint = 33;
   maxEnergy = 110;
   rechargeRate = 0.31;
   ambientThreadPowered = true;
   humSound = t1SensorHumSound;

   cmdCategory = "Support";
   cmdIcon = CMDSensorIcon;
   cmdMiniIconName = "commander/MiniIcons/com_sensor_grey";
   targetNameTag = 'Large';
   targetTypeTag = 'Sensor';
   sensorData = SensorLgPulseObj;
   sensorRadius = SensorLgPulseObj.detectRadius;
   sensorColor = "255 194 9";

   debrisShapeName = "debris_generic.dts";
   debris = StaticShapeDebris;
};

datablock StaticShapeData(t1ammoPad)
{
   catagory = "Stations";
   shapeFile = "t1ammopad.dts";
   maxDamage = 1.00;
   destroyedLevel = 1.00;
   disabledLevel = 0.70;
   explosion      = ShapeExplosion;
   expDmgRadius = 8.0;
   expDamage = 0.4;
   expImpulse = 1500.0;
   // don't allow this object to be damaged in non-team-based
   // mission types (DM, Rabbit, Bounty, Hunters)
   noIndividualDamage = true;
   dynamicType = $TypeMasks::StationObjectType;
   isShielded = true;
   energyPerDamagePoint = 75;
   maxEnergy = 50;
   rechargeRate = 0.35;
   doesRepair = true;
   //humSound = StationInventoryHumSound;
   cmdCategory = "Support";
   cmdIcon = CMDStationIcon;
   cmdMiniIconName = "commander/MiniIcons/com_inventory_grey";
   targetNameTag = 'Inventory';
   targetTypeTag = 'Station';
   debrisShapeName = "debris_generic.dts";
   debris = StationDebris;

};

datablock StaticShapeData(t1VehPad)
{
   catagory = "Stations";
   shapeFile = "t1VehPad.dts";
   maxDamage = 10.00;
   destroyedLevel = 10.00;
   disabledLevel = 9.00;
   explosion      = ShapeExplosion;
   expDmgRadius = 8.0;
   expDamage = 0.4;
   expImpulse = 1500.0;
   // don't allow this object to be damaged in non-team-based
   // mission types (DM, Rabbit, Bounty, Hunters)
   noIndividualDamage = true;
   dynamicType = $TypeMasks::StationObjectType;
   isShielded = true;
   energyPerDamagePoint = 75;
   maxEnergy = 150;
   rechargeRate = 0.35;
   doesRepair = true;
   //humSound = StationInventoryHumSound;
   cmdCategory = "Support";
   cmdIcon = CMDVehicleStationIcon;
   cmdMiniIconName = "commander/MiniIcons/com_vehicle_pad_inventory";
   targetTypeTag = 'Vehicle Station';
   debrisShapeName = "debris_generic.dts";
   debris = StationDebris;

};

datablock StaticShapeData(t1VehStation)
{
   catagory = "Stations";
   shapeFile = "t1VehStation.dts";
   maxDamage = 1.00;
   destroyedLevel = 1.00;
   disabledLevel = 0.70;
   explosion      = ShapeExplosion;
   expDmgRadius = 8.0;
   expDamage = 0.4;
   expImpulse = 1500.0;
   // don't allow this object to be damaged in non-team-based
   // mission types (DM, Rabbit, Bounty, Hunters)
   noIndividualDamage = true;
   dynamicType = $TypeMasks::StationObjectType;
   isShielded = true;
   energyPerDamagePoint = 75;
   maxEnergy = 50;
   rechargeRate = 0.35;
   doesRepair = true;
   //humSound = StationInventoryHumSound;
   cmdCategory = "Support";
   cmdIcon = CMDVehicleStationIcon;
   cmdMiniIconName = "commander/MiniIcons/com_vehicle_pad_inventory";
   targetTypeTag = 'Vehicle Station';
   debrisShapeName = "debris_generic.dts";
   debris = StationDebris;

};

function t1VehStation::onAdd(%this, %obj)
{  
   Parent::onAdd(%this, %obj);
   %obj.init = 0;
   if(%obj.vPadObj $= ""){
      %obj.vPadObj = "replaceMe";
   }

   %trigger = new Trigger()
   { 
      dataBlock = t1StationTrigger;
      polyhedron = "-0.125 0.0 0.1 0.25 0.0 0.0 0.0 -0.8 0.0 0.0 0.0 1.0";
   };     

   MissionCleanup.add(%trigger);

   %trans = %obj.getTransform();
   %vSPos = getWords(%trans,0,2);
   %vRot =  getWords(%trans,3,5);
   %vAngle = getWord(%trans,6);
   %matrix = VectorOrthoBasis(%vRot @ " " @ %vAngle + 0.0);
   %yRot = getWords(%matrix, 3, 5);
   %pos = vectorAdd(%vSPos, vectorScale(%yRot, 1));

   %trigger.setTransform(%pos @ " " @ %vRot @ " " @ %vAngle);

   // associate the trigger with the station
   %trigger.station =%obj;
   %obj.trigger = %trigger;
}

function t1VehStation::onRemove(%this, %obj){
   parent::onRemove(%this, %obj);
   if(isObject(%obj.trigger)){
      %obj.trigger.delete();
   }
}

datablock StaticShapeData(t1CMDStation)
{
   catagory = "Stations";
   shapeFile = "t1CMDStation.dts";
   maxDamage = 1.00;
   destroyedLevel = 1.00;
   disabledLevel = 0.70;
   explosion      = ShapeExplosion;
   expDmgRadius = 8.0;
   expDamage = 0.4;
   expImpulse = 1500.0;
   // don't allow this object to be damaged in non-team-based
   // mission types (DM, Rabbit, Bounty, Hunters)
   noIndividualDamage = true;
   dynamicType = $TypeMasks::StationObjectType;
   isShielded = true;
   energyPerDamagePoint = 75;
   maxEnergy = 50;
   rechargeRate = 0.35;
   doesRepair = true;
   //humSound = StationInventoryHumSound;
   cmdCategory = "Support";
   cmdIcon = CMDStationIcon;
   cmdMiniIconName = "commander/MiniIcons/com_inventory_grey";
   targetNameTag = 'Inventory';
   targetTypeTag = 'Station';
   debrisShapeName = "debris_generic.dts";
   debris = StationDebris;

};

function t1CMDStation::onAdd(%this, %obj)
{
   Parent::onAdd(%this, %obj);
   %obj.init = 0;
   %trigger = new Trigger()
   { 
      dataBlock = t1StationTrigger;
      polyhedron = "-0.125 0.0 0.1 0.25 0.0 0.0 0.0 -0.8 0.0 0.0 0.0 1.0";
   };     

   MissionCleanup.add(%trigger);

   %trans = %obj.getTransform();
   %vSPos = getWords(%trans,0,2);
   %vRot =  getWords(%trans,3,5);
   %vAngle = getWord(%trans,6);
   %matrix = VectorOrthoBasis(%vRot @ " " @ %vAngle + 0.0);
   %yRot = getWords(%matrix, 3, 5);
   %pos = vectorAdd(%vSPos, vectorScale(%yRot, 1));

   %trigger.setTransform(%pos @ " " @ %vRot @ " " @ %vAngle);

   // associate the trigger with the station
   %trigger.station =%obj;
   %obj.trigger = %trigger;
}

function t1CMDStation::onRemove(%this, %obj){
   parent::onRemove(%this, %obj);
   if(isObject(%obj.trigger)){
      %obj.trigger.delete();
   }
}

datablock TriggerData(t1StationTrigger)
{
   tickPeriodMS = 30;
};

datablock AudioProfile(invyPowerActivate)
{
   filename    = "t1sounds/inv_power.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock AudioProfile(invyPadActivate)
{
   filename    = "t1sounds/inv_activate.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock AudioProfile(invyPadRun)
{
   filename    = "t1sounds/inv_use.wav";
   description = AudioDefaultLooping3d;
   preload = true;
};

datablock AudioProfile(ammoPadActivate)
{
   filename    = "t1sounds/ammo_activate.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock AudioProfile(ammoPadRun)
{
   filename    = "t1sounds/ammo_use.wav";
   description = AudioDefaultLooping3d;
   preload = true;
};

datablock AudioProfile(cmdStationActivate)
{
   filename    = "t1sounds/command_activate.wav";
   description = AudioDefault3d;
   preload = true;
};


function t1StationTrigger::onEnterTrigger(%data, %trigger, %player){
   %station = %trigger.station;
   %targetname = %station.getDataBlock().getName(); 
   if(%trigger.powerTrig){
      if(%station.isEnabled() &&  %station.isPowered() && (!%player.client.lastInvySfx || (getSimTime() - %player.client.lastInvySfx) > 10000)){
         %player.client.play3D(invyPowerActivate, %trigger.getPosition());
         %player.client.lastInvySfx = getSimTime();
      }
      return;
   }

   if((%station.team != %player.client.team) && (%station.team != 0)){
         //%obj.station.playAudio(2, StationAccessDeniedSound);
         messageClient(%player.client, 'msgStationDenied', '\c2Access Denied -- Wrong team.~wt1sounds/Access_Denied.wav');
   }
   else if(%station.isDisabled()){
      messageClient(%player.client, 'msgStationDisabled', '\c2Station is disabled.');
   }
   else if(!%station.isPowered()){
      messageClient(%player.client, 'msgStationNoPower', '\c2Station is not powered.');
   }
   else if(%station.notDeployed){
      messageClient(%player.client, 'msgStationNotDeployed', '\c2Station is not deployed.');
   }
   else if(%station.isDestroyed){
      messageClient(%player.client, 'msgStationDestroyed', '\c2Station is destroyed.');
   }
   else if(isObject(%station) && %station.isEnabled() &&  %station.isPowered()){
      messageClient(%player.client, 'CloseHud', "", 'inventoryScreen');
      commandToClient(%player.client, 'TogglePlayHuds', true);
      if(%targetname $= "t1ammoPad"){
         %station.playAudio(2, ammoPadActivate);
         %station.schRunHum = %station.schedule(1300,"playAudio", 3, ammoPadRun);
         t1buyDeployableFavorites(%player.client);
         %oldRate = %player.getRepairRate();
         %player.setRepairRate(%oldRate + 0.00625);
         if(%station.init){
               %station.setThreadDir(2, true);
         }
         else{
               %station.playThread(2, "activate"); 
               %station.init = 1;
         } 
      }
      else if(%targetname $= "t1InvyPad"){
         %station.playAudio(2, invyPadActivate);
         %station.playAudio(3, invyPadRun);
         t1buyFavorites(%player.client);
         %plrRot = getWords(%player.getTransform(), 3, 6);
         %fvec = %station.getForwardVector();
         %sPos = vectorAdd(%station.getPosition(),"0 0 0.25");
         %player.setTransform(vectorAdd(%sPos,vectorScale(%fvec,1.5)) SPC %plrRot);
         %oldRate = %player.getRepairRate();
         %player.setRepairRate(%oldRate + 0.00625);

         if(%station.init){
               %station.setThreadDir(2, true);
         }
         else{
               %station.playThread(2, "activate");
               %station.init = 1;
         } 

      }
      else if(%targetname $= "t1CMDStation"){
         %station.playAudio(2, cmdStationActivate);
         commandToClient(%player.client,'OpenCommanderMap',1);
         if(%station.init){
               %station.setThreadDir(2, true);
         }
         else{
               %station.playThread(2, "activate"); 
               %station.init = 1;
         } 
      }
      else if(%targetname $= "t1VehStation"){
         commandToClient(%player.client,'PickVehMenu', 1, "buyT1Veh", "Buy Vehicle","","Scout", "Light Transport", "Heavy Transport");
         %player.atVPad =  %station;
         %station.playAudio(2, invyPadActivate);
         %station.playAudio(3, invyPadRun);
         if(%station.init){
               %station.setThreadDir(2, true);
         }
         else{
               %station.playThread(2, "activate"); 
               %station.init = 1;
         } 
      }
      else if(%targetname $= "T1InvyDeployableObj"){
         %station.playAudio(2, ammoPadRun);
         t1buyDeployableFavorites(%player.client);
         %oldRate = %player.getRepairRate();
         %player.setRepairRate(%oldRate + 0.00625);
         %station.playThread(2, "activate"); 
      }
      else if(%targetname $= "T1AmmoDeployableObj"){
         %station.playAudio(2, ammoPadRun);
         T1getAmmoStationLovin(%player.client);
         %oldRate = %player.getRepairRate();
         %player.setRepairRate(%oldRate + 0.00625);
         %station.playThread(2, "activate"); 
      }
   }
   %trigger.lastObj = %player;
}

function t1StationTrigger::onleaveTrigger(%data, %trigger, %player){
   %station = %trigger.station;
   %targetname = %station.getDataBlock().getName(); 
   if(%player.team == %station.team && !%trigger.powerTrig){
      if(isObject(%station)){
         if(%targetname $= "t1ammoPad"){
            %station.setThreadDir(2, false);
            if(!%station.isDestroyed && %station.isPowered() && !%station.isDisabled()){
               %station.playAudio(2, ammoPadActivate);
            }
            %player.setRepairRate(0);
            %station.stopAudio(3);
            cancel(%station.schRunHum);
         }
         else if(%targetname $= "t1InvyPad"){
            %station.setThreadDir(2, false);
            if(!%station.isDestroyed && %station.isPowered() && !%station.isDisabled()){
               %station.playAudio(2, invyPadActivate);   
            }
            %player.setRepairRate(0);
            %station.stopAudio(3);
         }
         else if(%targetname $= "t1CMDStation"){
            %station.setThreadDir(2, false);
            %station.playAudio(2, cmdStationActivate);
         }
         else if(%targetname $= "t1VehStation"){
            %station.setThreadDir(2, false);
            if(!%station.isDestroyed && %station.isPowered() && !%station.isDisabled()){
               %station.playAudio(2, invyPadActivate);   
            }
            %station.stopAudio(3);
            commandToClient(%player.client,'PickVehMenu', 0);
            %player.atVPad = "";
         }
         else if(%targetname $= "T1InvyDeployableObj"){
             %station.stopThread(2);
            %player.setRepairRate(0);
            %station.stopAudio(2);
            cancel(%station.schRunHum);
         }
         else if(%targetname $= "T1AmmoDeployableObj"){
             %station.stopThread(2);
            %player.setRepairRate(0);
            %station.stopAudio(2);
            cancel(%station.schRunHum);
         }

         if(%player.getMountedImage($WeaponSlot) == 0)
         {
            if(%player.inv[%player.lastWeapon])
               %player.use(%player.lastWeapon);
            else 
               %player.selectWeaponSlot( 0 );
         }
      }
   }
   %trigger.lastObj = "";
}

function t1StationTrigger::onTickTrigger(%data, %trig){
	return;
}

function t1ammoPad::onAdd(%this, %obj)
{
   Parent::onAdd(%this, %obj);
   %obj.init = 0;
   %trigger = new Trigger()
   { 
      dataBlock = t1StationTrigger;
      polyhedron = "-0.125 0.0 0.1 0.25 0.0 0.0 0.0 -0.8 0.0 0.0 0.0 1.0";
   };     

   MissionCleanup.add(%trigger);

   %trans = %obj.getTransform();
   %vSPos = getWords(%trans,0,2);
   %vRot =  getWords(%trans,3,5);
   %vAngle = getWord(%trans,6);
   %matrix = VectorOrthoBasis(%vRot @ " " @ %vAngle + 0.0);
   %yRot = getWords(%matrix, 3, 5);
   %pos = vectorAdd(%vSPos, vectorScale(%yRot, 1));

   %trigger.setTransform(%pos @ " " @ %vRot @ " " @ %vAngle);

   // associate the trigger with the station
   %trigger.station =%obj;
   %obj.trigger = %trigger;
}

function t1ammoPad::onRemove(%this, %obj){
   parent::onRemove(%this, %obj);
   if(isObject(%obj.trigger)){
      %obj.trigger.delete();
   }
}

// function t1ammoPadCol::onDestroyed(%data, %obj, %prevState){
//    parent::onDestroyed(%data, %obj, %prevState);
//    if(isObject(%obj.sobj)){
//       %obj.sobj.setDamageState("Destroyed");
//       %obj.sobj.stopThread(1);
//    }
// }
// function t1ammoPadCol::onEnabled(%data, %obj, %prevState){
//    parent::onEnabled(%data, %obj, %prevState);
//    if(isObject(%obj.sobj)){
//       %obj.sobj.setDamageState("Enabled");
//        %obj.sobj.playThread(1,power);
//    }
// }

// function t1ammoPadCol::onGainPowerEnabled(%data, %obj){
//    Parent::onGainPowerEnabled(%data, %obj);
//    if(isObject(%obj.sobj)){
//        %obj.sobj.setDamageState("Enabled");
//        %obj.sobj.playThread(1,power);
//    }

// }

// function t1ammoPadCol::onLosePowerDisabled(%data, %obj){
//    Parent::onLosePowerDisabled(%data, %obj);
//    if(isObject(%obj.sobj)){
//       %obj.sobj.stopThread(1);
//    }
// }


datablock AudioProfile(ammoPadActivate)
{
   filename    = "t1sounds/ammo_activate.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock AudioProfile(ammoPadRun)
{
   filename    = "t1sounds/ammo_use.wav";
   description = AudioDefaultLooping3d;
   preload = true;
};


datablock StaticShapeData(t1InvyPad)
{
   catagory = "Stations";
   shapeFile = "t1inventorystation.dts";
   //shapeFile = "t1ammopad.dts";
   maxDamage = 1.00;
   destroyedLevel = 1.00;
   disabledLevel = 0.70;
   explosion      = ShapeExplosion;
   expDmgRadius = 8.0;
   expDamage = 0.4;
   expImpulse = 1500.0;
   // don't allow this object to be damaged in non-team-based
   // mission types (DM, Rabbit, Bounty, Hunters)
   noIndividualDamage = true;
   dynamicType = $TypeMasks::StationObjectType;
   isShielded = true;
   energyPerDamagePoint = 75;
   maxEnergy = 50;
   rechargeRate = 0.35;
   doesRepair = true;
   //humSound = StationInventoryHumSound;
   cmdCategory = "Support";
   cmdIcon = CMDStationIcon;
   cmdMiniIconName = "commander/MiniIcons/com_inventory_grey";
   targetNameTag = 'Inventory';
   targetTypeTag = 'Station';
   debrisShapeName = "debris_generic.dts";
   debris = StationDebris;

};


function t1InvyPad::onAdd(%this, %obj)
{
   Parent::onAdd(%this, %obj);
   %obj.init = 0;
   %trigger = new Trigger()
   { 
      dataBlock = t1StationTrigger;
      polyhedron = "-0.5 0.5 -0.5 1.0 0.0 0.0 -0.0 -1.0 -0.0 -0.0 -0.0 1.0";
      powerTrig = 1;
      scale = "12 12 8";
   };     
   MissionCleanup.add(%trigger);
   %trigger.setTransform(%obj.getTransform());
   %trigger.station = %obj;
   %obj.pwrTrigger = %trigger;

   %trigger = new Trigger()
   { 
      dataBlock = t1StationTrigger;
      polyhedron = "-1.0 0.0 0.1 2.0 0.0 0.0 0.0 -1 0.0 0.0 0.0 2.0";//
   };     
   MissionCleanup.add(%trigger);
   %obj.trigger = %trigger;

   %trans = %obj.getTransform();
   %vSPos = getWords(%trans,0,2);
   %vRot =  getWords(%trans,3,5);
   %vAngle = getWord(%trans,6);
   %matrix = VectorOrthoBasis(%vRot @ " " @ %vAngle + 0.0);
   %yRot = getWords(%matrix, 3, 5);
   %pos = vectorAdd(%vSPos, vectorScale(%yRot, 1.25));
   %trigger.setTransform(%pos @ " " @ %vRot @ " " @ %vAngle);

   // associate the trigger with the station
   %trigger.station = %obj;
}

function t1InvyPad::onRemove(%this, %obj){
   parent::onRemove(%this, %obj);
   if(isObject(%obj.trigger)){
      %obj.trigger.delete();
   }
   if(isObject(%obj.pwrTrigger)){
      %obj.pwrTrigger.delete();
   }
}

// function t1InvyPad::onDestroyed(%data, %obj, %prevState){
//    parent::onDestroyed(%data, %obj, %prevState);
//    if(isObject(%obj.sobj)){
//       %obj.sobj.setDamageState("Destroyed");
//       %obj.sobj.stopThread(1);
//    }
// }
// function t1InvyPad::onEnabled(%data, %obj, %prevState){
//    parent::onEnabled(%data, %obj, %prevState);
//    if(isObject(%obj.sobj)){
//       %obj.sobj.setDamageState("Enabled");
//        %obj.sobj.playThread(1,power);
//    }
// }

// function t1InvyPad::onGainPowerEnabled(%data, %obj){
//    Parent::onGainPowerEnabled(%data, %obj);
//    if(isObject(%obj.sobj)){
//        %obj.sobj.setDamageState("Enabled");
//        %obj.sobj.playThread(1,power);
//    }

// }

// function t1InvyPad::onLosePowerDisabled(%data, %obj){
//    Parent::onLosePowerDisabled(%data, %obj);
//    if(isObject(%obj.sobj)){
//       %obj.sobj.stopThread(1);
//    }
// }


datablock AudioProfile(T1PlasmaBarrelExpSound)
{
   filename    = "t1sounds/turretexp.wav";
   description = "AudioExplosion3d";
   preload = true;
};
datablock AudioProfile(T1TurretFireSound)
{
   filename    = "t1sounds/turretfire4.wav";
   description = "AudioExplosion3d";
   preload = true;
};
datablock AudioProfile(t1TurretReady)
{
   filename    = "t1sounds/turreton4.wav";
   description = "AudioExplosion3d";
   preload = true;
};
datablock AudioProfile(t1TurretPark)
{
   filename    = "t1sounds/turretoff4.wav";
   description = "AudioExplosion3d";
   preload = true;
};

datablock ExplosionData(T1PlasmaBarrelBoltExplosion)
{
   soundProfile   = T1PlasmaBarrelExpSound;
   particleEmitter = PlasmaBarrelExplosionEmitter;
   particleDensity = 250;
   particleRadius = 1.25;
   faceViewer = true;

   emitter[0] = PlasmaBarrelCrescentEmitter;

   subExplosion[0] = PlasmaBarrelSubExplosion1;
   subExplosion[1] = PlasmaBarrelSubExplosion2;
   subExplosion[2] = PlasmaBarrelSubExplosion3;

   shakeCamera = true;
   camShakeFreq = "10.0 9.0 9.0";
   camShakeAmp = "10.0 10.0 10.0";
   camShakeDuration = 0.5;
   camShakeRadius = 15.0;
};

datablock LinearFlareProjectileData(T1PlasmaBarrelBolt)
{
   doDynamicClientHits = true;

   directDamage        = 0;
   directDamageType    = $DamageType::PlasmaTurret;
   hasDamageRadius     = true;
   // z0dd - ZOD, 5/07/04. Lower damage if gameplay changes in affect
   indirectDamage      = $Host::ClassicLoadPlasmaTurretChanges ? 1.0 : 1.2;
   damageRadius        = 10.0;
   kickBackStrength    = 500;
   radiusDamageType    = $DamageType::PlasmaTurret;
   explosion           = T1PlasmaBarrelBoltExplosion;
   splash              = PlasmaSplash;

   // z0dd - ZOD, 5/07/04. Lower velocity if gameplay changes in affect
   dryVelocity       = $Host::ClassicLoadPlasmaTurretChanges ? 65 : 75;
   wetVelocity       = -1;
   velInheritFactor  = 1.0;
   fizzleTimeMS      = 4000;
   lifetimeMS        = 4000; // z0dd - ZOD, 4/25/02. Was 6000
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = true;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = -1;

   activateDelayMS = 100;

   scale             = "1.5 1.5 1.5";
   numFlares         = 30;
   flareColor        = "0.1 0.3 1.0";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";
};


datablock TurretImageData(hellFireTurretBarrel)
{
   shapeFile = "hellFireGun.dts";

   projectile = T1PlasmaBarrelBolt;
   projectileType = LinearFlareProjectile;
   usesEnergy = true;
   fireEnergy = 10;
   minEnergy = 10;
   emap = true;

   // Turret parameters
   activationMS      = 1000; // z0dd - ZOD, 3/27/02. Was 1000. Amount of time it takes turret to unfold
   deactivateDelayMS = 1500;
   thinkTimeMS       = 140; // z0dd - ZOD, 3/27/02. Was 200. Amount of time before turret starts to unfold (activate)
   degPerSecTheta    = 300;
   degPerSecPhi      = 500;
   attackRadius      = 150; // z0dd - ZOD, 3/27/02. Was 120

   // State transitions
   stateName[0]                  = "Activate";
   stateTransitionOnNotLoaded[0] = "Dead";
   stateTransitionOnLoaded[0]    = "ActivateReady";

   stateName[1]                  = "ActivateReady";
   stateSequence[1]              = "Activate";
   stateSound[1]                 = t1TurretReady;
   stateTimeoutValue[1]          = 1;
   stateTransitionOnTimeout[1]   = "Ready";
   stateTransitionOnNotLoaded[1] = "Deactivate";
   stateTransitionOnNoAmmo[1]    = "NoAmmo";

   stateName[2]                    = "Ready";
   stateTransitionOnNotLoaded[2]   = "Deactivate";
   stateTransitionOnTriggerDown[2] = "Fire";
   stateTransitionOnNoAmmo[2]      = "NoAmmo";

   stateName[3]                = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3]        = 0.3;
   stateFire[3]                = true;
   stateRecoil[3]              = LightRecoil;
   stateAllowImageChange[3]    = false;
   stateSequence[3]            = "Fire";
   stateSound[3]               = T1TurretFireSound;
   stateScript[3]              = "onFire";

   stateName[4]                  = "Reload";
   stateTimeoutValue[4]          = 0.80;
   stateAllowImageChange[4]      = false;
   stateSequence[4]              = "Reload";
   stateTransitionOnTimeout[4]   = "Ready";
   stateTransitionOnNotLoaded[4] = "Deactivate";
   stateTransitionOnNoAmmo[4]    = "NoAmmo";

   stateName[5]                = "Deactivate";
   stateSound[5]               = t1TurretPark;
   stateSequence[5]            = "Activate";
   stateDirection[5]           = false;
   stateTimeoutValue[5]        = 1;
   stateTransitionOnLoaded[5]  = "ActivateReady";
   stateTransitionOnTimeout[5] = "Dead";

   stateName[6]               = "Dead";
   stateTransitionOnLoaded[6] = "ActivateReady";

   stateName[7]             = "NoAmmo";
   stateTransitionOnAmmo[7] = "Reload";
   stateSequence[7]         = "NoAmmo";
};


datablock TurretData(hellFireTurret) : TurretDamageProfile
{
   //className = Turret;
   catagory = "Turrets";
   shapeFile = "hellFireTurret.dts";

   barrel = hellFireTurretBarrel;
   
   preload        = true;

   mass           = 1.0;  // Not really relevant

   maxDamage      = 2.25;
   destroyedLevel = 2.25;
   disabledLevel  = 1.35;
   explosion      = TurretExplosion;
	expDmgRadius = 15.0;
	expDamage = 0.66;
	expImpulse = 2000.0;
   repairRate     = 0;
   emap = true;
   
   thetaMin = 15;
   thetaMax = 140;

   isShielded           = true;
   energyPerDamagePoint = 50;
   maxEnergy = 150;
   rechargeRate = 0.31;
   //humSound = BaseTurretHumSound; // Was SensorHumSound
   pausePowerThread = true;

   canControl = true;
   cmdCategory = "Tactical";
   cmdIcon = CMDTurretIcon;
   cmdMiniIconName = "commander/MiniIcons/com_turretbase_grey";
   targetNameTag = 'Base';
   targetTypeTag = 'Turret';
   sensorData = TurretBaseSensorObj;
   sensorRadius = TurretBaseSensorObj.detectRadius;
   sensorColor = "0 212 45";

   firstPersonOnly = true;

   debrisShapeName = "debris_generic.dts";
   debris = TurretDebris;


};

function hellFireTurret::onAdd(%data, %obj){
   Parent::onAdd(%data, %obj);
   %obj.mountImage(%data.barrel, 0, true);
}

datablock AudioProfile(T1BlasterFireSound)
{
   filename    = "t1sounds/rifle1.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock ExplosionData(T1SentryTurretExplosion)
{
   explosionShape = "energy_explosion.dts";
   soundProfile   = T1BlasterExpSound;

   particleEmitter = SentryTurretExplosionEmitter;
   particleDensity = 120;
   particleRadius = 0.15;

   faceViewer           = false;
};

datablock LinearFlareProjectileData(T1SentryTurretEnergyBolt)
{
   directDamage        = 0.1;
   directDamageType    = $DamageType::SentryTurret;

   explosion           = "T1SentryTurretExplosion";
   kickBackStrength  = 0.0;

   dryVelocity       = 200.0;
   wetVelocity       = 150.0;
   velInheritFactor  = 0.5;
   fizzleTimeMS      = 2000;
   lifetimeMS        = 3000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 3000;

   numFlares         = 10;
   size              = 0.35;
   flareColor        = "0.35 0.35 1";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   //sound = SentryTurretProjectileSound;

   hasLight    = true;
   lightRadius = 1.5;
   lightColor  = "0.35 0.35 1";
};

datablock TurretImageData(T1SentryTurretBarrel)
{
   shapeFile = "turret_muzzlepoint.dts";

   projectile = T1SentryTurretEnergyBolt;
   projectileType = LinearFlareProjectile;
   usesEnergy = true;
   fireEnergy = 6.00;
   minEnergy = 6.00;
   emap = true;

   // Turret parameters
   activationMS      = 300;
   deactivateDelayMS = 500;
   thinkTimeMS       = 200;
   degPerSecTheta    = 520;
   degPerSecPhi      = 960;
   attackRadius      = 60;


      // State transitions
   stateName[0]                  = "Activate";
   stateTransitionOnNotLoaded[0] = "Dead";
   stateTransitionOnLoaded[0]    = "ActivateReady";

   stateName[1]                  = "ActivateReady";
   stateSequence[1]              = "Activate";
   stateSound[1]                 = t1TurretReady;
   stateTimeoutValue[1]          = 0.1;
   stateTransitionOnTimeout[1]   = "Ready";
   stateTransitionOnNotLoaded[1] = "Deactivate";
   stateTransitionOnNoAmmo[1]    = "NoAmmo";

   stateName[2]                    = "Ready";
   stateTransitionOnNotLoaded[2]   = "Deactivate";
   stateTransitionOnTriggerDown[2] = "Fire";
   stateTransitionOnNoAmmo[2]      = "NoAmmo";

   stateName[3]                = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3]        = 0.13;
   stateFire[3]                = true;
   stateRecoil[3]              = LightRecoil;
   stateAllowImageChange[3]    = false;
   stateSequence[3]            = "Fire";
   stateSound[3]               = T1BlasterFireSound;
   stateScript[3]              = "onFire";

   stateName[4]                  = "Reload";
   stateTimeoutValue[4]          = 0.40;
   stateAllowImageChange[4]      = false;
   stateSequence[4]              = "Reload";
   stateTransitionOnTimeout[4]   = "Ready";
   stateTransitionOnNotLoaded[4] = "Deactivate";
   stateTransitionOnNoAmmo[4]    = "NoAmmo";

   stateName[5]                = "Deactivate";
   stateSound[5]               = t1TurretPark;
   stateSequence[5]            = "Activate";
   stateDirection[5]           = false;
   stateTimeoutValue[5]        = 0.1;
   stateTransitionOnLoaded[5]  = "ActivateReady";
   stateTransitionOnTimeout[5] = "Dead";

   stateName[6]               = "Dead";
   stateTransitionOnLoaded[6] = "ActivateReady";

   stateName[7]             = "NoAmmo";
   stateTransitionOnAmmo[7] = "Reload";
   stateSequence[7]         = "NoAmmo";
};

datablock TurretData(T1SentryTurret) : TurretDamageProfile
{
   //className = Turret;
   catagory = "Turrets";
   shapeFile = "t1Sentry.dts";

   //Uses the same stats as an outdoor deployable turret (balancing info for Dave)
   mass = 5.0;

   barrel = T1SentryTurretBarrel;

   maxDamage = 1.2;
   destroyedLevel = 1.2;
   disabledLevel = 0.84;
   explosion      = ShapeExplosion;
   expDmgRadius = 5.0;
   expDamage = 0.4;
   expImpulse = 1000.0; 
   repairRate = 0;

   thetaMin = 0;
   thetaMax = 180;
   emap = true;
   

   isShielded           = true;
   energyPerDamagePoint = 100;
   maxEnergy = 150;
   rechargeRate = 0.40;

   canControl = true;
   cmdCategory = "Tactical";
   cmdIcon = CMDTurretIcon;
   cmdMiniIconName = "commander/MiniIcons/com_turret_grey";
   targetNameTag = 'Sentry';
   targetTypeTag = 'Turret';
   sensorData = SentryMotionSensor;
   sensorRadius = SentryMotionSensor.detectRadius;
   sensorColor = "9 136 255";
   firstPersonOnly = false;
};

function T1SentryTurret::onAdd(%data, %obj){
   Parent::onAdd(%data, %obj);
   %obj.mountImage(%data.barrel, 0, true);
}

datablock AudioProfile(t1GeneratorHumSound)
{
   filename    = "t1sounds/generator.wav";
   description = ClosestLooping3d;
};

datablock StaticShapeData(T1GeneratorLarge) : StaticShapeDamageProfile 
{   
   className      = Generator;
   catagory       = "Generators";
   shapeFile      = "t1PowerGen.dts";
   explosion      = ShapeExplosion;
   maxDamage      = 1.5;
   destroyedLevel = 1.5;
   disabledLevel  = 0.85;
   expDmgRadius = 10.0;
   expDamage = 0.5;
   expImpulse = 1500.0;
   noIndividualDamage = true; //flag to make these invulnerable for certain mission types

   dynamicType = $TypeMasks::GeneratorObjectType;
   isShielded = true;
   energyPerDamagePoint = 30;
   maxEnergy = 70; // z0dd - ZOD, 09/20/02. Was 50
   rechargeRate = 0.15; // z0dd - ZOD, 09/20/02. Was 0.05
   humSound = t1GeneratorHumSound;
   
   cmdCategory = "Support";
   cmdIcon = "CMDGeneratorIcon";
   cmdMiniIconName = "commander/MiniIcons/com_generator";   
   targetTypeTag = 'Generator';

   debrisShapeName = "debris_generic.dts";
   debris = StaticShapeDebris;
};

datablock StaticShapeData(T1GeneratorMed) : StaticShapeDamageProfile 
{   
   className      = Generator;
   catagory       = "Generators";
   shapeFile      = "t1pGen.dts";
   explosion      = ShapeExplosion;
   maxDamage      = 1.5;
   destroyedLevel = 1.5;
   disabledLevel  = 0.85;
   expDmgRadius = 10.0;
   expDamage = 0.5;
   expImpulse = 1500.0;
   noIndividualDamage = true; //flag to make these invulnerable for certain mission types

   dynamicType = $TypeMasks::GeneratorObjectType;
   isShielded = true;
   energyPerDamagePoint = 30;
   maxEnergy = 70; // z0dd - ZOD, 09/20/02. Was 50
   rechargeRate = 0.15; // z0dd - ZOD, 09/20/02. Was 0.05
   humSound = t1GeneratorHumSound;
   
   cmdCategory = "Support";
   cmdIcon = "CMDGeneratorIcon";
   cmdMiniIconName = "commander/MiniIcons/com_generator";   
   targetTypeTag = 'Generator';

   debrisShapeName = "debris_generic.dts";
   debris = StaticShapeDebris;
};


datablock StaticShapeData(t1SolarPanel) : StaticShapeDamageProfile
{
   className = Generator;
   catagory = "Generators";
   shapeFile = "t1Solar.dts";
   explosion = ShapeExplosion;
   maxDamage = 1.00;
   destroyedLevel = 1.00;
   disabledLevel = 0.55;
   expDmgRadius = 5.0;
   expDamage = 0.3;
   expImpulse = 1000.0;
   noIndividualDamage = true; //flag to make these invulnerable for certain mission types
   emap = true;

   isShielded = true;
   energyPerDamagePoint = 30;
   rechargeRate = 0.1; // z0dd - ZOD, 09/20/02. Was 0.05

   dynamicType = $TypeMasks::GeneratorObjectType;
   maxEnergy = 30;
   //humSound = GeneratorHumSound;

   cmdCategory = "Support";
   cmdIcon = CMDSolarGeneratorIcon;
   cmdMiniIconName = "commander/MiniIcons/com_solargen_grey";
   targetTypeTag = 'Solar Panel';

   debrisShapeName = "debris_generic.dts";
   debris = StaticShapeDebris;
};

datablock SeekerProjectileData(t1TurretMissile)
{
   casingShapeName     = "weapon_missile_casement.dts";
   projectileShapeName = "weapon_missile_projectile.dts";
   hasDamageRadius     = true;
   indirectDamage      = 1.0;
   damageRadius        = 4.0;
   radiusDamageType    = $DamageType::MissileTurret;
   kickBackStrength    = 2500;

   flareDistance = 200;
   flareAngle    = 30;
   minSeekHeat   = 0.05;

   explosion           = "MissileExplosion";
   velInheritFactor    = 0.2;

   splash              = MissileSplash;
   baseEmitter         = MissileSmokeEmitter;
   delayEmitter        = MissileFireEmitter;
   puffEmitter         = MissilePuffEmitter;

   lifetimeMS          = 20000;
   muzzleVelocity      = 90.0; // z0dd - ZOD, 3/27/02. Was 80. Velocity of projectile
   turningSpeed        = 90.0;
   
   proximityRadius     = 4;

   terrainAvoidanceSpeed = 180;
   terrainScanAhead      = 25;
   terrainHeightFail     = 12;
   terrainAvoidanceRadius = 100;

   useFlechette = true;
   flechetteDelayMs = 550;
   casingDeb = FlechetteDebris;
};
datablock AudioProfile(t1MissilePark)
{
   filename    = "t1sounds/turretoff1.wav";
   description = AudioDefault3d;
   preload = true;
};
datablock AudioProfile(t1MissileAct)
{
   filename    = "t1sounds/turreton1.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock AudioProfile(t1MissileFire)
{
   filename    = "t1sounds/turretfire1.wav";
   description = AudioDefault3d;
   preload = true;
};

datablock TurretImageData(T1MissileBarrel)
{
   shapeFile = "turret_muzzlepoint.dts";
   item      = MissileBarrelPack; // z0dd - ZOD, 4/25/02. Was wrong: MissileBarrelLargePack

   projectile = t1TurretMissile;
   projectileType = SeekerProjectile;

   usesEnergy = true;
   fireEnergy = 60.0;
   minEnergy = 60.0;

   isSeeker     = true;
   seekRadius   = 200;
   maxSeekAngle = 30;
   seekTime     = 1.0;
   minSeekHeat  = 0.05;
   emap = true;
   minTargetingDistance = 20;

   // Turret parameters
   activationMS      = 2000; // z0dd - ZOD, 3/27/02. Was 250. Amount of time it takes turret to unfold
   deactivateDelayMS = 1500;
   thinkTimeMS       = 256; // z0dd - ZOD, 3/27/02. Was 200. Amount of time before turret starts to unfold (activate)
   degPerSecTheta    = 580;
   degPerSecPhi      = 1080;
   attackRadius      = 150;

   // State transitions
   stateName[0]                  = "Activate";
   stateTransitionOnNotLoaded[0] = "Dead";
   stateTransitionOnLoaded[0]    = "ActivateReady";

   stateName[1]                  = "ActivateReady";
   stateSequence[1]              = "Activate";
   stateSound[1]                 = t1MissileAct; // z0dd - ZOD, 3/27/02. Was MBLSwitchSound, changed for sound fix.
   stateTimeoutValue[1]          = 2.2;
   stateTransitionOnTimeout[1]   = "Ready";
   stateTransitionOnNotLoaded[1] = "Deactivate";
   stateTransitionOnNoAmmo[1]    = "NoAmmo";

   stateName[2]                    = "Ready";
   stateTransitionOnNotLoaded[2]   = "Deactivate";
   stateTransitionOnTriggerDown[2] = "Fire";
   stateTransitionOnNoAmmo[2]      = "NoAmmo";

   stateName[3]                = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3]        = 0.3;
   stateFire[3]                = true;
   stateRecoil[3]              = LightRecoil;
   stateAllowImageChange[3]    = false;
   stateSequence[3]            = "Fire";
   stateSound[3]               = t1MissileFire; // z0dd - ZOD, 3/27/02. Was MBLFireSound, changed for sound fix.
   stateScript[3]              = "onFire";

   stateName[4]                  = "Reload";
   stateTimeoutValue[4]          = 3.5;
   stateAllowImageChange[4]      = false;
   stateSequence[4]              = "Reload";
   stateTransitionOnTimeout[4]   = "Ready";
   stateTransitionOnNotLoaded[4] = "Deactivate";
   stateTransitionOnNoAmmo[4]    = "NoAmmo";

   stateName[5]                = "Deactivate";
   stateSound[5]               = t1MissilePark;
   stateSequence[5]            = "Activate";
   stateDirection[5]           = false;
   stateTimeoutValue[5]        = 2.2;
   stateTransitionOnLoaded[5]  = "ActivateReady";
   stateTransitionOnTimeout[5] = "Dead";

   stateName[6]               = "Dead";
   stateTransitionOnLoaded[6] = "ActivateReady";

   stateName[7]             = "NoAmmo";
   stateTransitionOnAmmo[7] = "Reload";
   stateSequence[7]         = "NoAmmo";
};

datablock TurretData(t1MissileTurret) : TurretDamageProfile
{
   //className = Turret;
   catagory = "Turrets";
   shapeFile = "t1MisTurret.dts";

   barrel = T1MissileBarrel;
   
   preload        = true;

   mass           = 1.0;  // Not really relevant

   maxDamage      = 2.25;
   destroyedLevel = 2.25;
   disabledLevel  = 1.35;
   explosion      = TurretExplosion;
	expDmgRadius = 15.0;
	expDamage = 0.66;
	expImpulse = 2000.0;
   repairRate     = 0;
   emap = true;
   
   thetaMin = 15;
   thetaMax = 140;

   isShielded           = true;
   energyPerDamagePoint = 50;
   maxEnergy = 150;
   rechargeRate = 0.31;
   //humSound = BaseTurretHumSound; // Was SensorHumSound
   pausePowerThread = true;

   canControl = true;
   cmdCategory = "Tactical";
   cmdIcon = CMDTurretIcon;
   cmdMiniIconName = "commander/MiniIcons/com_turretbase_grey";
   targetNameTag = 'Base';
   targetTypeTag = 'Turret';
   sensorData = TurretBaseSensorObj;
   sensorRadius = TurretBaseSensorObj.detectRadius;
   sensorColor = "0 212 45";

   firstPersonOnly = true;

   debrisShapeName = "debris_generic.dts";
   debris = TurretDebris;


};

function T1MissileBarrel::onFire(%data,%obj,%slot)
{
   %p = Parent::onFire(%data,%obj,%slot);
   //--------------------------------------------------------
   // z0dd - ZOD, 9/3/02. Anti rapid fire mortar/missile fix.
   if(!%p)
   {
      return;	
   }
   //--------------------------------------------------------
   MissileSet.add(%p); // z0dd - ZOD, 8/10/03. Bots need this.
   if (%obj.getControllingClient())
   {
      // a player is controlling the turret
      %target = %obj.getLockedTarget();
   }
   else
   {
      // The ai is controlling the turret
      %target = %obj.getTargetObject();
   }
   if(%target)
      %p.setObjectTarget(%target);
   else if(%obj.isLocked())
      %p.setPositionTarget(%obj.getLockedPosition());
   else
      %p.setNoTarget(); // set as unguided. Only happens when itchy trigger can't wait for lock tone.
}


function t1MissileTurret::onAdd(%data, %obj){
   Parent::onAdd(%data, %obj);
   %obj.mountImage(%data.barrel, 0, true);
}


datablock TurretImageData(T1ELFBarrelLarge)
{
   shapeFile = "turret_muzzlepoint.dts";
   item      = ELFBarrelPack; // z0dd - ZOD, 4/25/02. Was wrong: ELFBarrelLargePack

   projectile = ELFTurretBolt;
   projectileType = ELFProjectile;
   deleteLastProjectile = true;
   usesEnergy = true;
   fireEnergy = 0.0;
   minEnergy = 0.0;

   // Turret parameters
   activationMS      = 1500; // z0dd - ZOD, 3/27/02. Was 500. Amount of time it takes turret to unfold
   deactivateDelayMS = 1500;
   thinkTimeMS       = 70; // z0dd - ZOD, 3/27/02. Was 100. Amount of time before turret starts to unfold (activate)
   degPerSecTheta    = 580;
   degPerSecPhi      = 960;
   attackRadius      = 75;

   yawVariance          = 30.0; // these will smooth out the elf tracking code.
   pitchVariance        = 30.0; // more or less just tolerances
   
   // State transiltions
   stateName[0]                        = "Activate";
   stateTransitionOnNotLoaded[0]       = "Dead";
   stateTransitionOnLoaded[0]          = "ActivateReady";

   stateName[1]                        = "ActivateReady";
   stateSequence[1]                    = "Activate";
   stateSound[1]                       = t1TurretReady;
   stateTimeoutValue[1]                = 1;
   stateTransitionOnTimeout[1]         = "Ready";
   stateTransitionOnNotLoaded[1]       = "Deactivate";
   stateTransitionOnNoAmmo[1]          = "NoAmmo";

   stateName[2]                        = "Ready";
   stateTransitionOnNotLoaded[2]       = "Deactivate";
   stateTransitionOnTriggerDown[2]     = "Fire";
   stateTransitionOnNoAmmo[2]          = "NoAmmo";

   stateName[3]                        = "Fire";
   stateFire[3]                        = true;
   stateRecoil[3]                      = LightRecoil;
   stateAllowImageChange[3]            = false;
   stateSequence[3]                    = "Fire";
   stateSound[3]                       = EBLFireSound;
   stateScript[3]                      = "onFire";
   stateTransitionOnTriggerUp[3]       = "Deconstruction";
   stateTransitionOnNoAmmo[3]          = "Deconstruction";

   stateName[4]                        = "Reload";
   stateTimeoutValue[4]                = 0.01;
   stateAllowImageChange[4]            = false;
   stateSequence[4]                    = "Reload";
   stateTransitionOnTimeout[4]         = "Ready";
   stateTransitionOnNotLoaded[4]       = "Deactivate";
   stateTransitionOnNoAmmo[4]          = "NoAmmo";

   stateName[5]                        = "Deactivate";
   stateSequence[5]                    = "Activate";
   stateDirection[5]                   = false;
   stateTimeoutValue[5]                = 1;
   stateSound[5]                       = t1TurretPark;
   stateTransitionOnLoaded[5]          = "ActivateReady";
   stateTransitionOnTimeout[5]         = "Dead";

   stateName[6]                        = "Dead";
   stateTransitionOnLoaded[6]          = "ActivateReady";

   stateName[7]                        = "NoAmmo";
   stateTransitionOnAmmo[7]            = "Reload";
   stateSequence[7]                    = "NoAmmo";
   
   stateName[8]                       = "Deconstruction";
   stateScript[8]                     = "deconstruct";
   stateTransitionOnNoAmmo[8]         = "NoAmmo";
   stateTransitionOnTimeout[8]        = "Reload";
   stateTimeoutValue[8]               = 0.1;
};

datablock TurretData(t1ElfTurret) : TurretDamageProfile
{
   //className = Turret;
   catagory = "Turrets";
   shapeFile = "t1elfTurret.dts";

   barrel = T1ELFBarrelLarge;
   
   preload        = true;

   mass           = 1.0;  // Not really relevant

   maxDamage      = 2.25;
   destroyedLevel = 2.25;
   disabledLevel  = 1.35;
   explosion      = TurretExplosion;
	expDmgRadius = 15.0;
	expDamage = 0.66;
	expImpulse = 2000.0;
   repairRate     = 0;
   emap = true;
   
   thetaMin = 15;
   thetaMax = 140;

   isShielded           = true;
   energyPerDamagePoint = 50;
   maxEnergy = 150;
   rechargeRate = 0.31;
   //humSound = BaseTurretHumSound; // Was SensorHumSound
   pausePowerThread = true;

   canControl = true;
   cmdCategory = "Tactical";
   cmdIcon = CMDTurretIcon;
   cmdMiniIconName = "commander/MiniIcons/com_turretbase_grey";
   targetNameTag = 'Base';
   targetTypeTag = 'Turret';
   sensorData = TurretBaseSensorObj;
   sensorRadius = TurretBaseSensorObj.detectRadius;
   sensorColor = "0 212 45";

   firstPersonOnly = true;

   debrisShapeName = "debris_generic.dts";
   debris = TurretDebris;


};

function t1ElfTurret::onAdd(%data, %obj){
   Parent::onAdd(%data, %obj);
   %obj.mountImage(%data.barrel, 0, true);
}

datablock AudioProfile(t1FlyerEngineSound)
{
   filename    = "t1sounds/flyer_idle.wav";
   description = AudioDefaultLooping3d;
};

datablock AudioProfile(t1FlyThrustSound)
{
   filename    = "t1sounds/flyer_fly.wav";
   description = AudioDefaultLooping3d;
};

$Vehiclemax[T1ScoutFlyer]     = 4;
datablock FlyingVehicleData(T1ScoutFlyer) : ShrikeDamageProfile
{
   spawnOffset = "0 0 2";

   catagory = "Vehicles";
   shapeFile = "t1flyer.dts";
   multipassenger = false;
   computeCRC = true;

   debrisShapeName = "vehicle_air_scout_debris.dts";
   debris = ShapeDebris;
   renderWhenDestroyed = false;

   drag    = 0.15;
   density = 1.0;

   mountPose[0] = scoutRoot;
   numMountPoints = 1;  
   isProtectedMountPoint[0] = true;
   cameraMaxDist = 15;
   cameraOffset = 2.5;
   cameraLag = 0.9;
   explosion = VehicleExplosion;
	explosionDamage = 0.5;
	explosionRadius = 5.0;

   maxDamage = 1.40;
   destroyedLevel = 1.40;

   isShielded = true;
   energyPerDamagePoint = 160;
   maxEnergy = 280;      // Afterburner and any energy weapon pool
   rechargeRate = 0.8;

   minDrag = 30;           // Linear Drag (eventually slows you down when not thrusting...constant drag)
   rotationalDrag = 900;        // Anguler Drag (dampens the drift after you stop moving the mouse...also tumble drag)

   maxAutoSpeed = 15;       // Autostabilizer kicks in when less than this speed. (meters/second)
   autoAngularForce = 400;       // Angular stabilizer force (this force levels you out when autostabilizer kicks in)
   autoLinearForce = 300;        // Linear stabilzer force (this slows you down when autostabilizer kicks in)
   autoInputDamping = 0.95;      // Dampen control input so you don't` whack out at very slow speeds
   
   // Maneuvering
   maxSteeringAngle = 5;    // Max radiens you can rotate the wheel. Smaller number is more maneuverable.
   horizontalSurfaceForce = 6;   // Horizontal center "wing" (provides "bite" into the wind for climbing/diving and turning)
   verticalSurfaceForce = 4;     // Vertical center "wing" (controls side slip. lower numbers make MORE slide.)
   maneuveringForce = 3000;      // Horizontal jets (W,S,D,A key thrust)
   steeringForce = 1200;         // Steering jets (force applied when you move the mouse)
   steeringRollForce = 400;      // Steering jets (how much you heel over when you turn)
   rollForce = 4;                // Auto-roll (self-correction to right you after you roll/invert)
   hoverHeight = 4;        // Height off the ground at rest
   createHoverHeight = 4;  // Height off the ground when created
   maxForwardSpeed = 100;  // speed in which forward thrust force is no longer applied (meters/second)

   // Turbo Jet
   jetForce = 2000;      // Afterburner thrust (this is in addition to normal thrust)
   minJetEnergy = 28;     // Afterburner can't be used if below this threshhold.
   jetEnergyDrain = 2.8;       // Energy use of the afterburners (low number is less drain...can be fractional)                                                                                                                                                                                                                                                                                          // Auto stabilize speed
   vertThrustMultiple = 4.0; // z0dd - ZOD, 9/8/02. Was 3.0

   // Rigid body
   mass = 150;        // Mass of the vehicle
   bodyFriction = 0;     // Don't mess with this.
   bodyRestitution = 0.5;   // When you hit the ground, how much you rebound. (between 0 and 1)
   minRollSpeed = 0;     // Don't mess with this.
   softImpactSpeed = 14;       // Sound hooks. This is the soft hit.
   hardImpactSpeed = 25;    // Sound hooks. This is the hard hit.

   // Ground Impact Damage (uses DamageType::Ground)
   minImpactSpeed = 10;      // If hit ground at speed above this then it's an impact. Meters/second
   speedDamageScale = 0.06;

   // Object Impact Damage (uses DamageType::Impact)
   collDamageThresholdVel = 23.0;
   collDamageMultiplier   = 0.02;

   //
   minTrailSpeed = 15;      // The speed your contrail shows up at.
   trailEmitter = ContrailEmitter;
   forwardJetEmitter = WildcatJetEmitter;
   downJetEmitter = "";

   //
   jetSound = t1FlyThrustSound;
   engineSound = t1FlyerEngineSound;
   softImpactSound = SoftImpactSound;
   hardImpactSound = HardImpactSound;
   //wheelImpactSound = WheelImpactSound;
   
   //
   softSplashSoundVelocity = 10.0; 
   mediumSplashSoundVelocity = 15.0;   
   hardSplashSoundVelocity = 20.0;   
   exitSplashSoundVelocity = 10.0;
   
   exitingWater      = VehicleExitWaterMediumSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterMediumSound;
   waterWakeSound    = VehicleWakeMediumSplashSound; 
    
   dustEmitter = VehicleLiftoffDustEmitter;
   triggerDustHeight = 4.0;
   dustHeight = 1.0;

   damageEmitter[0] = LightDamageSmoke;
   damageEmitter[1] = HeavyDamageSmoke;
   damageEmitter[2] = DamageBubbles;
   damageEmitterOffset[0] = "0.0 -3.0 0.0 ";
   damageLevelTolerance[0] = 0.3;
   damageLevelTolerance[1] = 0.7;
   numDmgEmitterAreas = 1;

   
   minMountDist = 4;

   splashEmitter[0] = VehicleFoamDropletsEmitter;
   splashEmitter[1] = VehicleFoamEmitter;

   shieldImpact = VehicleShieldImpact;

   cmdCategory = "Tactical";
   cmdIcon = CMDFlyingScoutIcon;
   cmdMiniIconName = "commander/MiniIcons/com_scout_grey";
   targetNameTag = 'Shrike';
   targetTypeTag = 'Turbograv';
   sensorData = AWACPulseSensor;
   sensorRadius = AWACPulseSensor.detectRadius;
   sensorColor = "255 194 9";
   
   checkRadius = 5.5;
   observeParameters = "1 10 10";

   runningLight[0] = ShrikeLight1;
//   runningLight[1] = ShrikeLight2;

   shieldEffectScale = "0.937 1.125 0.60";

};
datablock AudioProfile(T1ScoutFireSound)
{
   filename    = "t1sounds/flierRocket.wav";
   description = AudioDefault3d;
   preload = true;
};

function T1ScoutFlyer::onAdd(%this, %obj)
{
   Parent::onAdd(%this, %obj);
   %obj.mountImage(T1ScoutMissileParam, 0);
   %obj.mountImage(T1ScoutMissileImage, 2);
   %obj.mountImage(T1ScoutMissilePairImage, 3);
   %obj.nextWeaponFire = 2;
}

datablock ParticleData(T1MissileSmokeParticle)
{
   dragCoeffiecient     = 0.0;
   gravityCoefficient   = -0.02;
   inheritedVelFactor   = 0.1;

   lifetimeMS           = 1200;
   lifetimeVarianceMS   = 100;

   textureName          = "particleTest";

   useInvAlpha = false;
   spinRandomMin = -90.0;
   spinRandomMax = 90.0;

   colors[0]     = "1.0 0.75 0.0 0.0";
   colors[1]     = "0.5 0.5 0.5 1.0";
   colors[2]     = "0.3 0.3 0.3 0.0";
   sizes[0]      = 1;
   sizes[1]      = 2;
   sizes[2]      = 3;
   times[0]      = 0.0;
   times[1]      = 0.1;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(T1MissileSmokeEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;

   ejectionVelocity = 1.5;
   velocityVariance = 0.3;

   thetaMin         = 0.0;
   thetaMax         = 50.0;  

   particles = "T1MissileSmokeParticle";
};
datablock ExplosionData(ScoutMissileExplosion)
{
   explosionShape = "effect_plasma_explosion.dts";
   soundProfile   = T1DiscExpSound;
   particleEmitter = MissileExplosionSmokeEmitter;
   particleDensity = 150;
   particleRadius = 1.25;
   faceViewer = true;

   sizes[0] = "1.0 1.0 1.0";
   sizes[1] = "1.0 1.0 1.0";
   times[0] = 0.0;
   times[1] = 1.5;
};
datablock LinearProjectileData(T1ScoutRocket)
{
   projectileShapeName = "weapon_missile_projectile.dts";
   emitterDelay = -1;
   baseEmitter = T1MissileSmokeEmitter;
   delayEmitter = MissileFireEmitter;
   bubbleEmitter = GrenadeBubbleEmitter;
   bubbleEmitTime = 1.0;
   directDamage = 0.0;
   hasDamageRadius = true;
   indirectDamage = 0.25;
   damageRadius = 7.5;
   radiusDamageType = $DamageType::Missile;
   kickBackStrength = 1000;
   sound = "";
   explosion = "ScoutMissileExplosion";
   underwaterExplosion = "UnderwaterDiscExplosion";
   splash = MissileSplash;
   dryVelocity = 90;
   wetVelocity = 50;
   velInheritFactor = 1.0;
   fizzleTimeMS = 5000;
   lifetimeMS = 5000;
   explodeOnDeath = true;
   reflectOnWaterImpactAngle = 15.0;
   explodeOnWaterImpact = false;
   deflectionOnWaterImpact = 20.0;
   fizzleUnderwaterMS = 5000;
//   activateDelayMS = 200;
   hasLight = true;
   lightRadius = 6.0;
   lightColor = "0.175 0.175 0.5";
};

datablock ShapeBaseImageData(T1ScoutMissilePairImage)
{
   className = WeaponImage;
   shapeFile = "weapon_energy_vehicle.dts";
   item      = Chaingun;
   ammo   = ChaingunAmmo;
   projectile = T1ScoutRocket;
   projectileType = LinearProjectile;
   mountPoint = 10;
   offset = "0.8 -0.1 0.1";
   
   usesEnergy = true;
   useMountEnergy = true;
   // DAVEG -- balancing numbers below!
   minEnergy = 5;
   fireEnergy = 5;
   fireTimeout = 500;

   stateName[0]                     = "Activate";
   stateTransitionOnTimeout[0]      = "ActivateReady";
   stateTimeoutValue[0]             = 0.5;
   stateSequence[0]                 = "Activate";
   stateSound[0]                    = MissileSwitchSound;

   stateName[1]                     = "ActivateReady";
   stateTransitionOnLoaded[1]       = "Ready";
   stateTransitionOnNoAmmo[1]       = "NoAmmo";

   stateName[2]                     = "Ready";
   stateTransitionOnNoAmmo[2]       = "NoAmmo";
   stateTransitionOnTriggerDown[2]  = "CheckTarget";

   stateName[3]                     = "Fire";
   stateTransitionOnTimeout[3]      = "Reload";
   stateTimeoutValue[3]             = 1.0;
   stateFire[3]                     = true;
   stateRecoil[3]                   = LightRecoil;
   stateAllowImageChange[3]         = false;
   stateSequence[3]                 = "Fire";
   stateScript[3]                   = "onFire";
   stateSound[3]                    = T1ScoutFireSound;

   stateName[4]                     = "Reload";
   stateTransitionOnNoAmmo[4]       = "NoAmmo";
   stateTransitionOnTimeout[4]      = "Ready";
   stateTimeoutValue[4]             = 1.0;
   stateAllowImageChange[4]         = false;
   stateSequence[4]                 = "Reload";
   //stateSound[4]                    = MissileReloadSound;

   stateName[5]                     = "NoAmmo";
   stateTransitionOnAmmo[5]         = "Reload";
   stateSequence[5]                 = "NoAmmo";
   stateTransitionOnTriggerDown[5]  = "Fire"; // Was DryFire

   stateName[6]                     = "DryFire";
   //stateSound[6]                    = "MissileDryFireSound";
   stateTimeoutValue[6]             = 1.0;
   stateTransitionOnTimeout[6]      = "ActivateReady";
   
   stateName[7]                     = "CheckTarget";
   stateTransitionOnNoTarget[7]     = "Fire"; // Was DryFire
   stateTransitionOnTarget[7]       = "Fire";
};

datablock ShapeBaseImageData(T1ScoutMissileImage) : T1ScoutMissilePairImage
{
   offset = "-0.8 -0.1 0.1";
   //stateScript[3]           = "onTriggerDown";
   //stateScript[5]           = "onTriggerUp";
   //stateScript[6]           = "onTriggerUp";
};

datablock ShapeBaseImageData(T1ScoutMissileParam)
{
   mountPoint = 2;
   shapeFile = "turret_muzzlepoint.dts";

   projectile = T1ScoutRocket;
   projectileType = LinearProjectile;
};

function T1ScoutFlyer::onTrigger(%data, %obj, %trigger, %state)
{
   // data = Sparrow datablock
   // obj = Sparrow object number
   // trigger = 0 for "fire", 1 for "jump", 3 for "thrust"
   // state = 1 for firing, 0 for not firing
   if(%trigger == 0)
   {
      switch (%state) {
         case 0:
            %obj.fireWeapon = false;
            %obj.setImageTrigger(2, false);
            %obj.setImageTrigger(3, false);
         case 1:
            %obj.fireWeapon = true;
            if(%obj.nextWeaponFire == 2) {
               %obj.setImageTrigger(2, true);
               %obj.setImageTrigger(3, false);
            }
            else {
               %obj.setImageTrigger(2, false);
               %obj.setImageTrigger(3, true);
            }
      }
   }
}

function T1ScoutMissileImage::onFire(%data,%obj,%slot)
{
   // obj = SparrowFlyer object number
   // slot = 2

   %p = Parent::onFire(%data,%obj,%slot);
   MissileSet.add(%p);
   %obj.nextWeaponFire = 3;
   schedule(%data.fireTimeout, 0, "fireNextGun", %obj);
}

function T1ScoutMissilePairImage::onFire(%data,%obj,%slot)
{
   // obj = SparrowFlyer object number
   // slot = 3

   %p = Parent::onFire(%data,%obj,%slot);
   MissileSet.add(%p);
   %obj.nextWeaponFire = 2;
   schedule(%data.fireTimeout, 0, "fireNextGun", %obj);
}

function T1ScoutMissileImage::onTriggerDown(%this, %obj, %slot)
{
}

function T1ScoutMissileImage::onTriggerUp(%this, %obj, %slot)
{
}

function T1ScoutMissileImage::onMount(%this, %obj, %slot)
{
}

function T1ScoutMissilePairImage::onMount(%this, %obj, %slot)
{
}

function T1ScoutMissileImage::onUnmount(%this,%obj,%slot)
{
}

function T1ScoutMissilePairImage::onUnmount(%this,%obj,%slot)
{
}


function T1ScoutFlyer::playerMounted(%data, %obj, %player, %node)
{
   if(%node == 0) {
      // pilot position
	   //commandToClient(%player.client, 'setHudMode', 'Pilot', "HAPC", %node);
      commandToClient(%player.client, 'setHudMode', 'Pilot', "Shrike", %node);

   }
   else {
      // all others
	   commandToClient(%player.client, 'setHudMode', 'Passenger', "HAPC", %node);
   }
   // update observers who are following this guy...
   if( %player.client.observeCount > 0 )
      resetObserveFollow( %player.client, false );
}

function T1ScoutFlyer::playerDismounted(%data, %obj, %player)
{
   %obj.fireWeapon = false;
   %obj.setImageTrigger(2, false);
   %obj.setImageTrigger(3, false);
   setTargetSensorGroup(%obj.getTarget(), %obj.team);
}

$Vehiclemax[T12ScoutFlyer]     = 4;
datablock FlyingVehicleData(T12ScoutFlyer) : ShrikeDamageProfile
{
   spawnOffset = "0 0 2";

   catagory = "Vehicles";
   shapeFile = "t1flyer2.dts";
   multipassenger = false;
   computeCRC = true;

   debrisShapeName = "vehicle_air_scout_debris.dts";
   debris = ShapeDebris;
   renderWhenDestroyed = false;

   drag    = 0.15;
   density = 1.0;

   mountPose[0] = scoutRoot;
   numMountPoints = 1;  
   isProtectedMountPoint[0] = true;
   cameraMaxDist = 15;
   cameraOffset = 2.5;
   cameraLag = 0.9;
   explosion = VehicleExplosion;
	explosionDamage = 0.5;
	explosionRadius = 5.0;

   maxDamage = 1.40;
   destroyedLevel = 1.40;

   isShielded = true;
   energyPerDamagePoint = 160;
   maxEnergy = 280;      // Afterburner and any energy weapon pool
   rechargeRate = 0.8;

   minDrag = 30;           // Linear Drag (eventually slows you down when not thrusting...constant drag)
   rotationalDrag = 900;        // Anguler Drag (dampens the drift after you stop moving the mouse...also tumble drag)

   maxAutoSpeed = 15;       // Autostabilizer kicks in when less than this speed. (meters/second)
   autoAngularForce = 400;       // Angular stabilizer force (this force levels you out when autostabilizer kicks in)
   autoLinearForce = 300;        // Linear stabilzer force (this slows you down when autostabilizer kicks in)
   autoInputDamping = 0.95;      // Dampen control input so you don't` whack out at very slow speeds
   
   // Maneuvering
   maxSteeringAngle = 5;    // Max radiens you can rotate the wheel. Smaller number is more maneuverable.
   horizontalSurfaceForce = 6;   // Horizontal center "wing" (provides "bite" into the wind for climbing/diving and turning)
   verticalSurfaceForce = 4;     // Vertical center "wing" (controls side slip. lower numbers make MORE slide.)
   maneuveringForce = 3000;      // Horizontal jets (W,S,D,A key thrust)
   steeringForce = 1200;         // Steering jets (force applied when you move the mouse)
   steeringRollForce = 400;      // Steering jets (how much you heel over when you turn)
   rollForce = 4;                // Auto-roll (self-correction to right you after you roll/invert)
   hoverHeight = 4;        // Height off the ground at rest
   createHoverHeight = 4;  // Height off the ground when created
   maxForwardSpeed = 100;  // speed in which forward thrust force is no longer applied (meters/second)

   // Turbo Jet
   jetForce = 2000;      // Afterburner thrust (this is in addition to normal thrust)
   minJetEnergy = 28;     // Afterburner can't be used if below this threshhold.
   jetEnergyDrain = 2.8;       // Energy use of the afterburners (low number is less drain...can be fractional)                                                                                                                                                                                                                                                                                          // Auto stabilize speed
   vertThrustMultiple = 4.0; // z0dd - ZOD, 9/8/02. Was 3.0

   // Rigid body
   mass = 150;        // Mass of the vehicle
   bodyFriction = 0;     // Don't mess with this.
   bodyRestitution = 0.5;   // When you hit the ground, how much you rebound. (between 0 and 1)
   minRollSpeed = 0;     // Don't mess with this.
   softImpactSpeed = 14;       // Sound hooks. This is the soft hit.
   hardImpactSpeed = 25;    // Sound hooks. This is the hard hit.

   // Ground Impact Damage (uses DamageType::Ground)
   minImpactSpeed = 10;      // If hit ground at speed above this then it's an impact. Meters/second
   speedDamageScale = 0.06;

   // Object Impact Damage (uses DamageType::Impact)
   collDamageThresholdVel = 23.0;
   collDamageMultiplier   = 0.02;

   //
   minTrailSpeed = 15;      // The speed your contrail shows up at.
   trailEmitter = ContrailEmitter;
   forwardJetEmitter = WildcatJetEmitter;
   downJetEmitter = "";

   //
   jetSound = t1FlyThrustSound;
   engineSound = t1FlyerEngineSound;
   softImpactSound = SoftImpactSound;
   hardImpactSound = HardImpactSound;
   //wheelImpactSound = WheelImpactSound;
   
   //
   softSplashSoundVelocity = 10.0; 
   mediumSplashSoundVelocity = 15.0;   
   hardSplashSoundVelocity = 20.0;   
   exitSplashSoundVelocity = 10.0;
   
   exitingWater      = VehicleExitWaterMediumSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterMediumSound;
   waterWakeSound    = VehicleWakeMediumSplashSound; 
    
   dustEmitter = VehicleLiftoffDustEmitter;
   triggerDustHeight = 4.0;
   dustHeight = 1.0;

   damageEmitter[0] = LightDamageSmoke;
   damageEmitter[1] = HeavyDamageSmoke;
   damageEmitter[2] = DamageBubbles;
   damageEmitterOffset[0] = "0.0 -3.0 0.0 ";
   damageLevelTolerance[0] = 0.3;
   damageLevelTolerance[1] = 0.7;
   numDmgEmitterAreas = 1;

   //
   max[chaingunAmmo] = 1000;

   minMountDist = 4;

   splashEmitter[0] = VehicleFoamDropletsEmitter;
   splashEmitter[1] = VehicleFoamEmitter;

   shieldImpact = VehicleShieldImpact;

   cmdCategory = "Tactical";
   cmdIcon = CMDFlyingScoutIcon;
   cmdMiniIconName = "commander/MiniIcons/com_scout_grey";
   targetNameTag = 'Shrike';
   targetTypeTag = 'Turbograv';
   sensorData = AWACPulseSensor;
   sensorRadius = AWACPulseSensor.detectRadius;
   sensorColor = "255 194 9";
   
   checkRadius = 5.5;
   observeParameters = "1 10 10";

   runningLight[0] = ShrikeLight1;
//   runningLight[1] = ShrikeLight2;

   shieldEffectScale = "0.937 1.125 0.60";

};

function T12ScoutFlyer::playerMounted(%data, %obj, %player, %node)
{
   if(%node == 0) {
      // pilot position
	   commandToClient(%player.client, 'setHudMode', 'Pilot', "HAPC", %node);
   }
   else {
      // all others
	   commandToClient(%player.client, 'setHudMode', 'Passenger', "HAPC", %node);
   }
   // update observers who are following this guy...
   if( %player.client.observeCount > 0 )
      resetObserveFollow( %player.client, false );
}

$Vehiclemax[T1LAPCFlyer]     = 2;
datablock FlyingVehicleData(T1LAPCFlyer) : HavocDamageProfile
{
   spawnOffset = "0 0 6";
   renderWhenDestroyed = false;

   catagory = "Vehicles";
   shapeFile = "t1lpc.dts";
   multipassenger = true;
   computeCRC = true;


   debrisShapeName = "vehicle_air_hapc_debris.dts";
   debris = ShapeDebris;

   drag = 0.2;
   density = 1.0;

   mountPose[0] = root;
//   mountPose[1] = sitting;
   numMountPoints = 3;
   isProtectedMountPoint[0] = true;
   isProtectedMountPoint[1] = true;
   isProtectedMountPoint[2] = true;


   cameraMaxDist = 17;
   cameraOffset = 2;
   cameraLag = 8.5;
   explosion = LargeAirVehicleExplosion;
	explosionDamage = 0.5;
	explosionRadius = 5.0;

   maxDamage = 3.50;
   destroyedLevel = 3.50;

   isShielded = true;
   rechargeRate = 1.45; // z0dd - ZOD, 4/16/02. Was 0.8
   energyPerDamagePoint = 150; // z0dd - ZOD, 4/16/02. Was 200
   maxEnergy = 800; // z0dd - ZOD, 4/16/02. Was 550
   minDrag = 100;                // Linear Drag
   rotationalDrag = 2700;        // Anguler Drag

   // Auto stabilize speed
   maxAutoSpeed = 10;
   autoAngularForce = 3000;      // Angular stabilizer force
   autoLinearForce = 450;        // Linear stabilzer force
   autoInputDamping = 0.95;      // 
                                                        
   // Maneuvering
   maxSteeringAngle = 8;
   horizontalSurfaceForce = 10;  // Horizontal center "wing"
   verticalSurfaceForce = 10;    // Vertical center "wing"
   maneuveringForce = 6250;      // Horizontal jets // z0dd - ZOD, 4/25/02. Was 6000
   steeringForce = 1000;          // Steering jets
   steeringRollForce = 400;      // Steering jets
   rollForce = 12;               // Auto-roll
   hoverHeight = 4;         // Height off the ground at rest
   createHoverHeight = 4;   // Height off the ground when created
   maxForwardSpeed = 80;  // speed in which forward thrust force is no longer applied (meters/second) z0dd - ZOD, 4/25/02. Was 71

   // Turbo Jet
   jetForce = 5750; // z0dd - ZOD, 4/25/02. Was 5000
   minJetEnergy = 55;
   jetEnergyDrain = 4.5; // z0dd - ZOD, 4/16/02. Was 3.6
   vertThrustMultiple = 3.0;

   dustEmitter = LargeVehicleLiftoffDustEmitter;
   triggerDustHeight = 4.0;
   dustHeight = 2.0;

   damageEmitter[0] = LightDamageSmoke;
   damageEmitter[1] = HeavyDamageSmoke;
   damageEmitter[2] = DamageBubbles;
   damageEmitterOffset[0] = "3.0 -3.0 0.0 ";
   damageEmitterOffset[1] = "-3.0 -3.0 0.0 ";
   damageLevelTolerance[0] = 0.3;
   damageLevelTolerance[1] = 0.7;
   numDmgEmitterAreas = 2;

   // Rigid body
   mass = 550;
   bodyFriction = 0;
   bodyRestitution = 0.3;
   minRollSpeed = 0;
   softImpactSpeed = 12;       // Sound hooks. This is the soft hit.
   hardImpactSpeed = 15;    // Sound hooks. This is the hard hit.

   // Ground Impact Damage (uses DamageType::Ground)
   minImpactSpeed = 25;      // If hit ground at speed above this then it's an impact. Meters/second
   speedDamageScale = 0.060;

   // Object Impact Damage (uses DamageType::Impact)
   collDamageThresholdVel = 28;
   collDamageMultiplier   = 0.020;

   //
   minTrailSpeed = 15;
   trailEmitter = ContrailEmitter;
   forwardJetEmitter = FlyerJetEmitter;
   downJetEmitter = FlyerJetEmitter;

   //
   jetSound = t1FlyThrustSound;
   engineSound = t1FlyerEngineSound;
   softImpactSound = SoftImpactSound;
   hardImpactSound = HardImpactSound;
   //wheelImpactSound = WheelImpactSound;

   //
   softSplashSoundVelocity = 5.0; 
   mediumSplashSoundVelocity = 8.0;   
   hardSplashSoundVelocity = 12.0;   
   exitSplashSoundVelocity = 8.0;
   
   exitingWater      = VehicleExitWaterHardSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterHardSound;
   waterWakeSound    = VehicleWakeHardSplashSound; 
   
   minMountDist = 4;

   splashEmitter[0] = VehicleFoamDropletsEmitter;
   splashEmitter[1] = VehicleFoamEmitter;

   shieldImpact = VehicleShieldImpact;

   cmdCategory = "Tactical";
   cmdIcon = CMDFlyingHAPCIcon;
   cmdMiniIconName = "commander/MiniIcons/com_hapc_grey";
   targetNameTag = 'LPC';
   targetTypeTag = 'Light Transport';
   // z0dd - ZOD, 5/07/04. Stealth HAPC if gameplay changes in affect.
   sensorData = $Host::ClassicLoadHavocChanges ? HAPCSensor : VehiclePulseSensor;
   sensorRadius = VehiclePulseSensor.detectRadius; // z0dd - ZOD, 4/25/02. Allows sensor to be shown on CC

   checkRadius = 7.8115;
   observeParameters = "1 15 15";

   stuckTimerTicks = 32;   // If the hapc spends more than 1 sec in contact with something
   stuckTimerAngle = 80;   //  with a > 80 deg. pitch, BOOM!

   shieldEffectScale = "1.0 0.9375 0.45";
};
function T1LAPCFlyer::playerMounted(%data, %obj, %player, %node)
{
   if(%node == 0) {
      // pilot position
	   commandToClient(%player.client, 'setHudMode', 'Pilot', "HAPC", %node);
   }
   else {
      // all others
	   commandToClient(%player.client, 'setHudMode', 'Passenger', "HAPC", %node);
   }

   // update observers who are following this guy...
   if( %player.client.observeCount > 0 )
      resetObserveFollow( %player.client, false );
}
$Vehiclemax[T1HAPCFlyer]     = 1;
datablock FlyingVehicleData(T1HAPCFlyer) : HavocDamageProfile
{
   spawnOffset = "0 0 6";
   renderWhenDestroyed = false;

   catagory = "Vehicles";
   shapeFile = "t1hpc.dts";
   multipassenger = true;
   computeCRC = true;


   debrisShapeName = "vehicle_air_hapc_debris.dts";
   debris = ShapeDebris;

   drag = 0.2;
   density = 1.0;

   mountPose[0] = root;
//   mountPose[1] = sitting;
   numMountPoints = 5;
   isProtectedMountPoint[0] = true;
   isProtectedMountPoint[1] = true;
   isProtectedMountPoint[2] = true;
   isProtectedMountPoint[3] = true;
   isProtectedMountPoint[4] = true;

   cameraMaxDist = 17;
   cameraOffset = 2;
   cameraLag = 8.5;
   explosion = LargeAirVehicleExplosion;
	explosionDamage = 0.5;
	explosionRadius = 5.0;

   maxDamage = 3.50;
   destroyedLevel = 3.50;

   isShielded = true;
   rechargeRate = 1.45; // z0dd - ZOD, 4/16/02. Was 0.8
   energyPerDamagePoint = 150; // z0dd - ZOD, 4/16/02. Was 200
   maxEnergy = 800; // z0dd - ZOD, 4/16/02. Was 550
   minDrag = 100;                // Linear Drag
   rotationalDrag = 2700;        // Anguler Drag

   // Auto stabilize speed
   maxAutoSpeed = 10;
   autoAngularForce = 3000;      // Angular stabilizer force
   autoLinearForce = 450;        // Linear stabilzer force
   autoInputDamping = 0.95;      // 
                                                        
   // Maneuvering
   maxSteeringAngle = 8;
   horizontalSurfaceForce = 10;  // Horizontal center "wing"
   verticalSurfaceForce = 10;    // Vertical center "wing"
   maneuveringForce = 6250;      // Horizontal jets // z0dd - ZOD, 4/25/02. Was 6000
   steeringForce = 1000;          // Steering jets
   steeringRollForce = 400;      // Steering jets
   rollForce = 12;               // Auto-roll
   hoverHeight = 4;         // Height off the ground at rest
   createHoverHeight = 4;   // Height off the ground when created
   maxForwardSpeed = 80;  // speed in which forward thrust force is no longer applied (meters/second) z0dd - ZOD, 4/25/02. Was 71

   // Turbo Jet
   jetForce = 5750; // z0dd - ZOD, 4/25/02. Was 5000
   minJetEnergy = 55;
   jetEnergyDrain = 4.5; // z0dd - ZOD, 4/16/02. Was 3.6
   vertThrustMultiple = 3.0;

   dustEmitter = LargeVehicleLiftoffDustEmitter;
   triggerDustHeight = 4.0;
   dustHeight = 2.0;

   damageEmitter[0] = LightDamageSmoke;
   damageEmitter[1] = HeavyDamageSmoke;
   damageEmitter[2] = DamageBubbles;
   damageEmitterOffset[0] = "3.0 -3.0 0.0 ";
   damageEmitterOffset[1] = "-3.0 -3.0 0.0 ";
   damageLevelTolerance[0] = 0.3;
   damageLevelTolerance[1] = 0.7;
   numDmgEmitterAreas = 2;

   // Rigid body
   mass = 550;
   bodyFriction = 0;
   bodyRestitution = 0.3;
   minRollSpeed = 0;
   softImpactSpeed = 12;       // Sound hooks. This is the soft hit.
   hardImpactSpeed = 15;    // Sound hooks. This is the hard hit.

   // Ground Impact Damage (uses DamageType::Ground)
   minImpactSpeed = 25;      // If hit ground at speed above this then it's an impact. Meters/second
   speedDamageScale = 0.060;

   // Object Impact Damage (uses DamageType::Impact)
   collDamageThresholdVel = 28;
   collDamageMultiplier   = 0.020;

   //
   minTrailSpeed = 15;
   trailEmitter = ContrailEmitter;
   forwardJetEmitter = FlyerJetEmitter;
   downJetEmitter = FlyerJetEmitter;

   //
   jetSound = t1FlyThrustSound;
   engineSound = t1FlyerEngineSound;
   softImpactSound = SoftImpactSound;
   hardImpactSound = HardImpactSound;
   //wheelImpactSound = WheelImpactSound;

   //
   softSplashSoundVelocity = 5.0; 
   mediumSplashSoundVelocity = 8.0;   
   hardSplashSoundVelocity = 12.0;   
   exitSplashSoundVelocity = 8.0;
   
   exitingWater      = VehicleExitWaterHardSound;
   impactWaterEasy   = VehicleImpactWaterSoftSound;
   impactWaterMedium = VehicleImpactWaterMediumSound;
   impactWaterHard   = VehicleImpactWaterHardSound;
   waterWakeSound    = VehicleWakeHardSplashSound; 
   
   minMountDist = 4;

   splashEmitter[0] = VehicleFoamDropletsEmitter;
   splashEmitter[1] = VehicleFoamEmitter;

   shieldImpact = VehicleShieldImpact;

   cmdCategory = "Tactical";
   cmdIcon = CMDFlyingHAPCIcon;
   cmdMiniIconName = "commander/MiniIcons/com_hapc_grey";
   targetNameTag = 'HPC';
   targetTypeTag = 'Heavy Transport';
   // z0dd - ZOD, 5/07/04. Stealth HAPC if gameplay changes in affect.
   sensorData = $Host::ClassicLoadHavocChanges ? HAPCSensor : VehiclePulseSensor;
   sensorRadius = VehiclePulseSensor.detectRadius; // z0dd - ZOD, 4/25/02. Allows sensor to be shown on CC

   checkRadius = 7.8115;
   observeParameters = "1 15 15";

   stuckTimerTicks = 32;   // If the hapc spends more than 1 sec in contact with something
   stuckTimerAngle = 80;   //  with a > 80 deg. pitch, BOOM!

   shieldEffectScale = "1.0 0.9375 0.45";
};

function T1HAPCFlyer::playerMounted(%data, %obj, %player, %node)
{
   if(%node == 0) {
      // pilot position
	   commandToClient(%player.client, 'setHudMode', 'Pilot', "HAPC", %node);
   }
   else {
      // all others
	   commandToClient(%player.client, 'setHudMode', 'Passenger', "HAPC", %node);
   }

   // update observers who are following this guy...
   if( %player.client.observeCount > 0 )
      resetObserveFollow( %player.client, false );
}

datablock StaticShapeData(T1InvyDeployableObj) : StaticShapeDamageProfile
{
   className = Station;
   shapeFile = "t1DepInvy.dts";
   maxDamage = 0.70;
   destroyedLevel = 0.70;
   disabledLevel = 0.42;
   explosion      = DeployablesExplosion;
   expDmgRadius = 8.0;
   expDamage = 0.35;
   expImpulse = 500.0;

   dynamicType = $TypeMasks::StationObjectType;
   isShielded = true;
   energyPerDamagePoint = 110;
   maxEnergy = 50;
   rechargeRate = 0.20;
   renderWhenDestroyed = false;
   doesRepair = true;

   deployedObject = true;

   cmdCategory = "DSupport";
   cmdIcon = CMDStationIcon;
   cmdMiniIconName = "commander/MiniIcons/com_inventory_grey";
   targetNameTag = 'Deployable';
   targetTypeTag = 'Station';

   debrisShapeName = "debris_generic_small.dts";
   debris = DeployableDebris;
   heatSignature = 0;
};

datablock ShapeBaseImageData(T1InvyDeployableImage)
{
   mass = 12; // z0dd - ZOD, 7/17/02. large packs are too heavy enough with new physics. was 15
   emap = true;

   shapeFile = "t1DepInvy_Pack.dts";
   item = T1InvyDeployable;
   mountPoint = 1;
   offset = "0 -0.2 -0.8";
   rotation = "0 0 1 180";
   deployed = T1InvyDeployableObj;
   heatSignature = 0;

   stateName[0] = "Idle";
   stateTransitionOnTriggerDown[0] = "Activate";

   stateName[1] = "Activate";
   stateScript[1] = "onActivate";
   stateTransitionOnTriggerUp[1] = "Idle";

   isLarge = true;
   maxDepSlope = 30;
   deploySound = StationDeploySound;

   flatMinDeployDis   = 2.0; // z0dd - ZOD, 5/18/03. Was 1.0, try to prevent it intersecting with plyr bb.
   flatMaxDeployDis   = 5.0;

   minDeployDis       = 3.0; // z0dd - ZOD, 5/18/03. Was 2.5, try to prevent it intersecting with plyr bb.
   maxDeployDis       = 6.0;
};

$TeamDeployableMax[T1InvyDeployable] = 4;
$TeamDeployableMin[T1InvyDeployable] = 4;

datablock ItemData(T1InvyDeployable)
{
   className = Pack;
   catagory = "Deployables";
   shapeFile = "t1DepInvy_Pack.dts";
   mass = 3.0;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 1;
   rotate = false;
   image = "T1InvyDeployableImage";
   pickUpName = "an inventory station pack";
   heatSignature = 0;

   computeCRC = true;
   emap = true;

};

function T1InvyDeployableImage::getInitialRotation(%item, %plyr) {
   %rot = rotFromTransform(%plyr.getTransform());
   // Rotate 180 degrees around Z-axis (PI radians)
   // Multiply original rotation by the 180-degree Z rotation
   %newRot = MatrixMultiply("0 0 0" SPC %rot, "0 0 0" SPC "0 0 1" SPC 3.14159265359);
   return getWords(rotFromTransform(%newRot), 0, 3);
}

function T1InvyDeployableImage::onDeploy(%item, %plyr, %slot){
   %obj = Parent::onDeploy(%item, %plyr, %slot);
   %obj.init = 0;
   %trigger = new Trigger()
   { 
      dataBlock = t1StationTrigger;
      polyhedron = "-0.125 0.0 0.1 0.25 0.0 0.0 0.0 -0.8 0.0 0.0 0.0 1.0";
   };     

   MissionCleanup.add(%trigger);

   %trans = %obj.getTransform();
   %vSPos = getWords(%trans,0,2);
   %vRot =  getWords(%trans,3,5);
   %vAngle = getWord(%trans,6);
   %matrix = VectorOrthoBasis(%vRot @ " " @ %vAngle + 0.0);
   %yRot = getWords(%matrix, 3, 5);
   %pos = vectorAdd(%vSPos, vectorScale(%yRot, 1));

   %trigger.setTransform(%pos @ " " @ %vRot @ " " @ %vAngle);

   // associate the trigger with the station
   %trigger.station =%obj;
   %obj.trigger = %trigger;


   %b = new BeaconObject() {
      dataBlock = "DeployedBeacon";
      position =%obj.position;
      rotation = %obj.rotation;
      team = %obj.team;
      scale = "0.5 0.5 0.5";
      invincible = "1";
   };
   MissionCleanup.add(%b);
   %b.setBeaconType(friend);
   %b.setTarget(%obj.team);
   %obj.beacon = %b;
}
function T1InvyDeployable::onCollision(%data,%obj,%col){
   if (%col.getDataBlock().className $= Armor && %col.getState() !$= "Dead" && %col.getMountedImage(2) == 0 && !%col.isMounted()){
      if (%col.client){
         messageClient(%col.client, 'MsgItemPickup', '\c0You picked up %1.', %data.pickUpName);
         serverPlay3D(ItemPickupSound, %col.getTransform());
      }
      if (%obj.isStatic()){
         %obj.respawn();
      }
      else{
         %obj.delete();
      }
      %col.setInventory(T1InvyDeployable, 1, true);
   }
}

function T1InvyDeployableObj::onDestroyed(%this, %obj, %prevState){
   Parent::onDestroyed(%this, %obj, %prevState);
   $TeamDeployedCount[%obj.team, T1InvyDeployable]--;
   if(isObject(%obj.trigger)){   
      %obj.trigger.delete();
   }
   if(isObject(%obj.beacon)){   
      %obj.beacon.delete();
   }
   %obj.schedule(500, "delete");
}


datablock StaticShapeData(T1AmmoDeployableObj) : StaticShapeDamageProfile
{
   className = Station;
   shapeFile = "t1DepAmmo.dts";
   maxDamage = 0.70;
   destroyedLevel = 0.70;
   disabledLevel = 0.42;
   explosion      = DeployablesExplosion;
   expDmgRadius = 8.0;
   expDamage = 0.35;
   expImpulse = 500.0;

   dynamicType = $TypeMasks::StationObjectType;
   isShielded = true;
   energyPerDamagePoint = 110;
   maxEnergy = 50;
   rechargeRate = 0.20;
   renderWhenDestroyed = false;
   doesRepair = true;

   deployedObject = true;

   cmdCategory = "DSupport";
   cmdIcon = CMDStationIcon;
   cmdMiniIconName = "commander/MiniIcons/com_inventory_grey";
   targetNameTag = 'Deployable';
   targetTypeTag = 'Station';

   debrisShapeName = "debris_generic_small.dts";
   debris = DeployableDebris;
   heatSignature = 0;
};

datablock ShapeBaseImageData(T1AmmoDeployableImage)
{
   mass = 12; // z0dd - ZOD, 7/17/02. large packs are too heavy enough with new physics. was 15
   emap = true;

   shapeFile = "t1DepAmmo.dts";
   item = T1AmmoDeployable;
   mountPoint = 1;
   offset = "0 -0.2 -0.3";
   rotation = "0 0 1 180";
   deployed = T1AmmoDeployableObj;
   heatSignature = 0;

   stateName[0] = "Idle";
   stateTransitionOnTriggerDown[0] = "Activate";

   stateName[1] = "Activate";
   stateScript[1] = "onActivate";
   stateTransitionOnTriggerUp[1] = "Idle";

   isLarge = true;
   maxDepSlope = 30;
   deploySound = StationDeploySound;

   flatMinDeployDis   = 2.0; // z0dd - ZOD, 5/18/03. Was 1.0, try to prevent it intersecting with plyr bb.
   flatMaxDeployDis   = 5.0;

   minDeployDis       = 3.0; // z0dd - ZOD, 5/18/03. Was 2.5, try to prevent it intersecting with plyr bb.
   maxDeployDis       = 6.0;
};

$TeamDeployableMax[T1AmmoDeployable] = 4;
$TeamDeployableMin[T1AmmoDeployable] = 4;

datablock ItemData(T1AmmoDeployable)
{
   className = Pack;
   catagory = "Deployables";
   shapeFile = "t1DepAmmo.dts";
   mass = 3.0;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 1;
   rotate = false;
   image = "T1AmmoDeployableImage";
   pickUpName = "an ammo station pack";
   heatSignature = 0;

   computeCRC = true;
   emap = true;

};

function T1AmmoDeployableImage::getInitialRotation(%item, %plyr) {
   %rot = rotFromTransform(%plyr.getTransform());
   // Rotate 180 degrees around Z-axis (PI radians)
   // Multiply original rotation by the 180-degree Z rotation
   %newRot = MatrixMultiply("0 0 0" SPC %rot, "0 0 0" SPC "0 0 1" SPC 3.14159265359);
   return getWords(rotFromTransform(%newRot), 0, 3);
}

function T1AmmoDeployableImage::onDeploy(%item, %plyr, %slot){
   %obj = Parent::onDeploy(%item, %plyr, %slot);
   %obj.init = 0;
   %trigger = new Trigger()
   { 
      dataBlock = t1StationTrigger;
      polyhedron = "-0.125 0.0 0.1 0.25 0.0 0.0 0.0 -0.8 0.0 0.0 0.0 1.0";
   };     

   MissionCleanup.add(%trigger);

   %trans = %obj.getTransform();
   %vSPos = getWords(%trans,0,2);
   %vRot =  getWords(%trans,3,5);
   %vAngle = getWord(%trans,6);
   %matrix = VectorOrthoBasis(%vRot @ " " @ %vAngle + 0.0);
   %yRot = getWords(%matrix, 3, 5);
   %pos = vectorAdd(%vSPos, vectorScale(%yRot, 1));

   %trigger.setTransform(%pos @ " " @ %vRot @ " " @ %vAngle);

   // associate the trigger with the station
   %trigger.station =%obj;
   %obj.trigger = %trigger;

}
function T1AmmoDeployable::onCollision(%data,%obj,%col){
   if (%col.getDataBlock().className $= Armor && %col.getState() !$= "Dead" && %col.getMountedImage(2) == 0 && !%col.isMounted()){
      if (%col.client){
         messageClient(%col.client, 'MsgItemPickup', '\c0You picked up %1.', %data.pickUpName);
         serverPlay3D(ItemPickupSound, %col.getTransform());
      }
      if (%obj.isStatic()){
         %obj.respawn();
      }
      else{
         %obj.delete();
      }
      %col.setInventory(T1AmmoDeployable, 1, true);
      
   }
}

function T1AmmoDeployableObj::onDestroyed(%this, %obj, %prevState){
   Parent::onDestroyed(%this, %obj, %prevState);
   $TeamDeployedCount[%obj.team, T1AmmoDeployable]--;
   if(isObject(%obj.trigger)){   
      %obj.trigger.delete();
   }
   %obj.schedule(500, "delete");
}


datablock LinearFlareProjectileData(T1RemoteTurretBolt)
{
   directDamage        = 0.14;
   directDamageType    = $DamageType::IndoorDepTurret;
   explosion           = T1BlasterExplosion;
   kickBackStrength  = 0.0;

   dryVelocity       = 120.0;
   wetVelocity       = 40.0;
   velInheritFactor  = 0.5;
   fizzleTimeMS      = 2000;
   lifetimeMS        = 3000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 3000;

   numFlares         = 20;
   size              = 0.45;
   flareColor        = "1 0.35 0.35";
   flareModTexture   = "flaremod";
   flareBaseTexture  = "flarebase";

   sound = T1BlasterExpSound;

   hasLight    = true;
   lightRadius = 3.0;
   lightColor  = "1 0.35 0.35";
};

datablock TurretImageData(T1RemoteBarrel)
{
   shapeFile = "turret_muzzlepoint.dts";
   item      = TurretIndoorDeployable; // z0dd - ZOD, 4/25/02. Was wrong: IndoorTurretBarrel

   projectile = T1RemoteTurretBolt;
   projectileType = LinearFlareProjectile;

   usesEnergy = true;
   fireEnergy = 4.5;
   minEnergy = 4.5;

   lightType = "WeaponFireLight";
   lightColor = "0.25 0.15 0.15 1.0";
   lightTime = "1000";
   lightRadius = "2";

   muzzleFlash = IndoorTurretMuzzleFlash;

   // Turret parameters
   activationMS      = 105; // z0dd - ZOD, 3/27/02. Was 150. Amount of time it takes turret to unfold
   deactivateDelayMS = 300;
   thinkTimeMS       = 105; // z0dd - ZOD, 3/27/02. Was 150. Amount of time before turret starts to unfold (activate)
   degPerSecTheta    = 580;
   degPerSecPhi      = 960;
   attackRadius      = 60;

   // State transitions
   stateName[0]                  = "Activate";
   stateTransitionOnNotLoaded[0] = "Dead";
   stateTransitionOnLoaded[0]    = "ActivateReady";

   stateName[1]                  = "ActivateReady";
   stateSequence[1]              = "Activate";
   //stateSound[1]                 = IBLSwitchSound;
   stateTimeoutValue[1]          = 1;
   stateTransitionOnTimeout[1]   = "Ready";
   stateTransitionOnNotLoaded[1] = "Deactivate";
   stateTransitionOnNoAmmo[1]    = "NoAmmo";

   stateName[2]                    = "Ready";
   stateTransitionOnNotLoaded[2]   = "Deactivate";
   stateTransitionOnTriggerDown[2] = "Fire";
   stateTransitionOnNoAmmo[2]      = "NoAmmo";

   stateName[3]                = "Fire";
   stateTransitionOnTimeout[3] = "Reload";
   stateTimeoutValue[3]        = 0.3;
   stateFire[3]                = true;
   stateShockwave[3]           = true;
   stateRecoil[3]              = LightRecoil;
   stateAllowImageChange[3]    = false;
   stateSequence[3]            = "Fire";
   stateSound[3]               = T1BlasterFireSound;
   stateScript[3]              = "onFire";

   stateName[4]                  = "Reload";
   stateTimeoutValue[4]          = 0.8;
   stateAllowImageChange[4]      = false;
   stateSequence[4]              = "Reload";
   stateTransitionOnTimeout[4]   = "Ready";
   stateTransitionOnNotLoaded[4] = "Deactivate";
   stateTransitionOnNoAmmo[4]    = "NoAmmo";

   stateName[5]                = "Deactivate";
   stateSequence[5]            = "Activate";
   stateDirection[5]           = false;
   stateTimeoutValue[5]        = 1;
   stateTransitionOnLoaded[5]  = "ActivateReady";
   stateTransitionOnTimeout[5] = "Dead";

   stateName[6]               = "Dead";
   stateTransitionOnLoaded[6] = "ActivateReady";

   stateName[7]             = "NoAmmo";
   stateTransitionOnAmmo[7] = "Reload";
   stateSequence[7]         = "NoAmmo";
};


datablock TurretData(T1RemoteTurretObj) : TurretDamageProfile
{
   catagory = "Turrets";
   className = DeployedTurret;
   shapeFile = "t1RemoteTurret.dts";

   rechargeRate = 0.15;
   humSound = DeployedTurretHumSound; // z0dd - ZOD, 5/18/03. New sound
   mass = 5.0;
   maxDamage = 0.80;
   destroyedLevel = 0.80;
   disabledLevel = 0.35;
   explosion      = HandGrenadeExplosion;  
   expDmgRadius = 5.0;
   expDamage = 0.3;
   expImpulse = 500.0;
   repairRate = 0;
	
   deployedObject = true;

   thetaMin = 0; 
   thetaMax = 145;
   thetaNull = 90;

   yawVariance          = 30.0; // these will smooth out the elf tracking code.
   pitchVariance        = 30.0; // more or less just tolerances

   isShielded = true;
   energyPerDamagePoint = 110;
   maxEnergy = 60;
   renderWhenDestroyed = false;
   barrel = T1RemoteBarrel;
   heatSignature = 0;

   canControl = true;
   cmdCategory = "DTactical";
   cmdIcon = CMDTurretIcon;
   cmdMiniIconName = "commander/MiniIcons/com_turret_grey";
   targetNameTag = 'Landspike';
   targetTypeTag = 'Turret';
   sensorData = DeployedOutdoorTurretSensor;
   sensorRadius = DeployedOutdoorTurretSensor.detectRadius;
   sensorColor = "191 0 226";

   firstPersonOnly = true;

   debrisShapeName = "debris_generic_small.dts";
   debris = TurretDebrisSmall;
};

datablock ShapeBaseImageData(T1RemoteTurretImage)
{
   mass = 12; // z0dd - ZOD, 7/17/02. large packs are too heavy enough with new physics. was 15
   emap = true;

   shapeFile = "t1RemoteTurret_Pack.dts";
   item = T1RemoteTurret;
   mountPoint = 1;
   offset = "0 -0.2 -0.5";
   rotation = "0 0 1 180";
   deployed = T1RemoteTurretObj;
   heatSignature = 0;

   stateName[0] = "Idle";
   stateTransitionOnTriggerDown[0] = "Activate";

   stateName[1] = "Activate";
   stateScript[1] = "onActivate";
   stateTransitionOnTriggerUp[1] = "Idle";

   isLarge = true;
   maxDepSlope = 30;
   deploySound = StationDeploySound;

   flatMinDeployDis   = 2.0; // z0dd - ZOD, 5/18/03. Was 1.0, try to prevent it intersecting with plyr bb.
   flatMaxDeployDis   = 5.0;

   minDeployDis       = 3.0; // z0dd - ZOD, 5/18/03. Was 2.5, try to prevent it intersecting with plyr bb.
   maxDeployDis       = 6.0;
};

$TeamDeployableMax[T1RemoteTurret] = 6;
$TeamDeployableMin[T1RemoteTurret] = 6;

datablock ItemData(T1RemoteTurret)
{
   className = Pack;
   catagory = "Deployables";
   shapeFile = "t1RemoteTurret_Pack.dts";
   mass = 3.0;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 1;
   rotate = false;
   image = "T1RemoteTurretImage";
   pickUpName = "an ammo station pack";
   heatSignature = 0;

   computeCRC = true;
   emap = true;

};
function T1RemoteTurretObj::onAdd(%data, %obj){
   Parent::onAdd(%data, %obj);
   %obj.mountImage(%data.barrel, 0, true);
}

function T1RemoteTurret::onCollision(%data,%obj,%col){
   if (%col.getDataBlock().className $= Armor && %col.getState() !$= "Dead" && %col.getMountedImage(2) == 0 && !%col.isMounted()){
      if (%col.client){
         messageClient(%col.client, 'MsgItemPickup', '\c0You picked up %1.', %data.pickUpName);
         serverPlay3D(ItemPickupSound, %col.getTransform());
      }
      if (%obj.isStatic()){
         %obj.respawn();
      }
      else{
         %obj.delete();
      }
      %col.setInventory(T1RemoteTurret, 1, true);
      
   }
}


function T1RemoteTurretObj::onDestroyed(%this, %obj, %prevState){
   Parent::onDestroyed(%this, %obj, %prevState);
   $TeamDeployedCount[%obj.team, T1RemoteTurret]--;
   %obj.schedule(500, "delete");
}

datablock AudioProfile(t1RepairPackFireSound)
{
   filename    = "t1sounds/repair.wav";
   description = CloseLooping3d;
   preload = true;
};

//--------------------------------------------------------------------------
// Projectile

datablock RepairProjectileData(DefaultRepairBeam)
{
   sound = RepairPackFireSound;

   beamRange      = 10;
   beamWidth      = 0.15;
   numSegments    = 20;
   texRepeat      = 0.20;
   blurFreq       = 10.0;
   blurLifetime   = 1.0;
   cutoffAngle    = 25.0;
   
   textures[0]   = "special/redbump2";
   textures[1]   = "special/redflare";
};


//-------------------------------------------------------------------------
// shapebase datablocks

datablock ShapeBaseImageData(T1RepairPackImage)
{
   shapeFile = "t1RepairPack.dts";
   item = t1RepairPack;
   mountPoint = 1;
   offset = "0 -0.18 -0.22";
   emap = true;

   gun = t1RepairGunImage;

   stateName[0] = "Idle";
   stateTransitionOnTriggerDown[0] = "Activate";

   stateName[1] = "Activate";
   stateScript[1] = "onActivate";
   stateSequence[1] = "fire";
   stateSound[1] = T1DiscSwitchSound;
   stateTransitionOnTriggerUp[1] = "Deactivate";

   stateName[2] = "Deactivate";
   stateScript[2] = "onDeactivate";
   stateTransitionOnTimeout[2] = "Idle";   
};

datablock ItemData(t1RepairPack)
{
   className = Pack;
   catagory = "Packs";
   shapeFile = "t1RepairPack.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   rotate = true;
   image = "t1RepairPackImage";
   pickUpName = "a repair pack";

   lightOnlyStatic = true;
   lightType = "PulsingLight";
   lightColor = "1 0 0 1";
   lightTime = 1200;
   lightRadius = 4;

   computeCRC = true;
   emap = true;
};

function t1RepairPack::onCollision(%data,%obj,%col){
   if (%col.getDataBlock().className $= Armor && %col.getState() !$= "Dead" && %col.getMountedImage(2) == 0 && !%col.isMounted()){
      if (%col.client){
         messageClient(%col.client, 'MsgItemPickup', '\c0You picked up %1.', %data.pickUpName);
         serverPlay3D(ItemPickupSound, %col.getTransform());
      }
      if (%obj.isStatic()){
         %obj.respawn();
      }
      else{
         %obj.delete();
      }
      %col.setInventory(t1RepairPack, 1, true);
      
   }
}


datablock ShapeBaseImageData(t1RepairGunImage)
{
   shapeFile = "t1RepairPackGun.dts";
   offset = "0 0 0";

   usesEnergy = true;
   minEnergy = 3;
   cutOffEnergy = 3.1;
   emap = true;

   repairFactorPlayer = 0.002; // <--- attention DaveG!
   repairFactorObject = 0.0055; // <--- attention DaveG! // z0dd - ZOD, 7/20/02. was 0.004

   stateName[0] = "Activate";
   stateTransitionOnTimeout[0] = "ActivateReady";
   stateTimeoutValue[0] = 0.25;

   stateName[1] = "ActivateReady";
   stateScript[1] = "onActivateReady";
   stateSpinThread[1] = Stop;
   stateTransitionOnAmmo[1] = "Ready";
   stateTransitionOnNoAmmo[1] = "ActivateReady";

   stateName[2] = "Ready";
   stateSpinThread[2] = Stop;
   stateTransitionOnNoAmmo[2] = "Deactivate";
   stateTransitionOnTriggerDown[2] = "Validate";

   stateName[3] = "Validate";
   stateTransitionOnTimeout[3] = "Validate";
   stateTimeoutValue[3] = 0.2;
   stateEnergyDrain[3] = 3;
   stateSpinThread[3] = SpinUp;
   stateScript[3] = "onValidate";
   stateIgnoreLoadedForReady[3] = true;
   stateTransitionOnLoaded[3] = "Repair";
   stateTransitionOnNoAmmo[3] = "Deactivate";
   stateTransitionOnTriggerUp[3] = "Deactivate";

   stateName[4] = "Repair";
   stateSound[4] = t1RepairPackFireSound;
   stateScript[4] = "onRepair";
   stateSpinThread[4] = FullSpeed;
   stateAllowImageChange[4] = false;
   stateSequence[4] = "fire";
   stateFire[4] = true;
   stateEnergyDrain[4] = 9;
   stateTimeoutValue[4] = 0.2;
   stateTransitionOnTimeOut[4] = "Repair";
   stateTransitionOnNoAmmo[4] = "Deactivate";
   stateTransitionOnTriggerUp[4] = "Deactivate";
   stateTransitionOnNotLoaded[4] = "Validate";

   stateName[5] = "Deactivate";
   stateScript[5] = "onDeactivate";
   stateSpinThread[5] = SpinDown;
   stateSequence[5] = "activate";
   stateDirection[5] = false;
   stateTimeoutValue[5] = 0.2;
   stateTransitionOnTimeout[5] = "ActivateReady";
};

function T1RepairPackImage::onUnmount(%data, %obj, %node)
{
   // dismount the repair gun if the player had it mounted
   // need the extra "if" statement to avoid a console error message
   if(%obj.getMountedImage($WeaponSlot))
      if(%obj.getMountedImage($WeaponSlot).getName() $= "t1RepairGunImage")
         %obj.unmountImage($WeaponSlot);

   // if the player was repairing something when the pack was thrown, stop repairing it
   if(%obj.repairing != 0)
      stopRepairing(%obj);
} 

function T1RepairPackImage::onActivate(%data, %obj, %slot)
{
   // don't activate the pack if player is piloting a vehicle
   if(%obj.isPilot() || %obj.getImageState(0) $= "Fire")
   {
      %obj.setImageTrigger(%slot, false);
      return;
   }
   // z0dd - ZOD, 5/19/03. Make sure their wearing a repair pack.
   if(%obj.getMountedImage($BackpackSlot) != 0)
   {
      if(%obj.getMountedImage($BackpackSlot).getName() $= "T1RepairPackImage")
      {
         if(!isObject(%obj.getMountedImage($WeaponSlot)) || %obj.getMountedImage($WeaponSlot).getName() !$= "t1RepairGunImage")
         {
            messageClient(%obj.client, 'MsgRepairPackOn', '\c2Repair pack activated.');

            // make sure player's arm thread is "look"
            %obj.setArmThread(look);

            // mount the repair gun
            %obj.mountImage(t1RepairGunImage, $WeaponSlot);
            // clientCmdsetRepairReticle found in hud.cs
            commandToClient(%obj.client, 'setRepairReticle');
         }
      }
      else
         %obj.setImageTrigger(%slot, false);
   }
}

function T1RepairPackImage::onDeactivate(%data, %obj, %slot)
{
   //called when the player hits the "pack" key again (toggle)
   %obj.setImageTrigger(%slot, false);
   // if repair gun was mounted, unmount it
   if(%obj.getMountedImage($WeaponSlot).getName() $= "t1RepairGunImage")
      %obj.unmountImage($WeaponSlot);
}

function t1RepairGunImage::onMount(%this,%obj,%slot)
{
   %obj.setImageAmmo(%slot,true);
   // z0dd - ZOD, 9/29/02. Removed T2 demo code from here
   commandToClient( %obj.client, 'setRepairPackIconOn' );
}

function t1RepairGunImage::onUnmount(%this,%obj,%slot)
{
   // called when player switches to another weapon

   // stop repairing whatever player was repairing
   if(%obj.repairing)
      stopRepairing(%obj);

   %obj.setImageTrigger(%slot, false);
   // "turn off" the repair pack -- player needs to hit the "pack" key to
   // activate the repair gun again
   %obj.setImageTrigger($BackpackSlot, false);
   // z0dd - ZOD, 9/29/02. Removed T2 demo code from here
   commandToClient( %obj.client, 'setRepairPackIconOff' );
}

function t1RepairGunImage::onActivateReady(%this, %obj, %slot)
{
   %obj.errMsgSent = false;
   %obj.selfRepairing = false;
   %obj.repairing = 0;
   %obj.setImageLoaded(%slot, false);
}

function t1RepairGunImage::onValidate(%this, %obj, %slot)
{
   // this = t1RepairGunImage datablock
   // obj = player wielding the repair gun
   // slot = weapon slot

   if(%obj.getEnergyLevel() <= %this.cutOffEnergy)
   {
      stopRepairing(%obj);
      return;
   }
   // z0dd - ZOD, 5/19/03. Make sure their wearing a repair pack.
   if(%obj.getMountedImage($BackpackSlot) != 0)
   {
      if(%obj.getMountedImage($BackpackSlot).getName() $= "T1RepairPackImage")
      {
         %repGun = %obj.getMountedImage(%slot);
         // muzVec is the vector coming from the repair gun's "muzzle"
         %muzVec = %obj.getMuzzleVector(%slot);
         // muzNVec = normalized muzVec
         %muzNVec = VectorNormalize(%muzVec);
         %repairRange = DefaultRepairBeam.beamRange;
         // scale muzNVec to the range the repair beam can reach
         %muzScaled = VectorScale(%muzNVec, %repairRange);
         // muzPoint = the actual point of the gun's "muzzle"
         %muzPoint = %obj.getMuzzlePoint(%slot);
         // rangeEnd = muzzle point + length of beam
         %rangeEnd = VectorAdd(%muzPoint, %muzScaled);
         // search for just about anything that can be damaged as well as interiors
         %searchMasks = $TypeMasks::PlayerObjectType | $TypeMasks::VehicleObjectType |
                        $TypeMasks::StaticShapeObjectType | $TypeMasks::TurretObjectType | 
                        $TypeMasks::InteriorObjectType; 

         // search for objects within the beam's range that fit the masks above
         %scanTarg = ContainerRayCast(%muzPoint, %rangeEnd, %searchMasks, %obj);
         // screen out interiors
         if(%scanTarg && !(%scanTarg.getType() & $TypeMasks::InteriorObjectType))
         {
            // a target in range was found
            %repTgt = firstWord(%scanTarg);
            // is the prospective target damaged?
            if(%repTgt.notRepairable)
            {
               // this is an object that cant be repaired at all
               // -- mission specific flag set on the object
               if(!%obj.errMsgSent)
               {
                  messageClient(%obj.client, 'MsgRepairPackIrrepairable', '\c2Target is not repairable.', %repTgt);
                  %obj.errMsgSent = true;
               }
               // if player was repairing something, stop the repairs -- we're done
               if(%obj.repairing)
                  stopRepairing(%obj);
            }
            else if(%repTgt.getDamageLevel())
            {
               // yes, it's damaged
               if(%repTgt != %obj.repairing)
               {
                  if(isObject(%obj.repairing))
                     stopRepairing(%obj);

                  %obj.repairing = %repTgt;
               }
               // setting imageLoaded to true sends us to repair state (function onRepair)
               %obj.setImageLoaded(%slot, true);
            }
            else
            {
               // there is a target in range, but it's not damaged
               if(!%obj.errMsgSent)
               {
                  // if the target isn't damaged, send a message to that effect only once
                  messageClient(%obj.client, 'MsgRepairPackNotDamaged', '\c2Target is not damaged.', %repTgt);
                  %obj.errMsgSent = true;
               }
               // if player was repairing something, stop the repairs -- we're done
               if(%obj.repairing)
               stopRepairing(%obj);
            }
         }
         //AI hack - too many things influence the aiming, so I'm going to force the repair object for bots only
         else if (%obj.client.isAIControlled() && isObject(%obj.client.repairObject))
         {
            %repTgt = %obj.client.repairObject;
            %repPoint = %repTgt.getAIRepairPoint();
            if (%repPoint $= "0 0 0")
               %repPoint = %repTgt.getWorldBoxCenter();

            %repTgtVector = VectorNormalize(VectorSub(%muzPoint, %repPoint));
            %aimVector = VectorNormalize(VectorSub(%muzPoint, %rangeEnd));

            //if the dot product is very close (ie. we're aiming in the right direction)
            if (VectorDot(%repTgtVector, %aimVector) > 0.85)
            {
               //do an LOS to make sure nothing is in the way...
               %scanTarg = ContainerRayCast(%muzPoint, %repPoint, %searchMasks, %obj);
               if (firstWord(%scanTarg) == %repTgt)
               {
                  // yes, it's damaged

                  if(isObject(%obj.repairing))
                     stopRepairing(%obj);

                  %obj.repairing = %repTgt;
                  // setting imageLoaded to true sends us to repair state (function onRepair)
                  %obj.setImageLoaded(%slot, true);
               }
            }
         }
         else if(%obj.getDamageLevel())
         {
            // there is no target in range, but the player is damaged
            // check to see if we were repairing something before -- if so, stop repairing old target
            if(%obj.repairing != 0)
               if(%obj.repairing != %obj)
                  stopRepairing(%obj);

            if(isObject(%obj.repairing))
               stopRepairing(%obj);
      
            %obj.repairing = %obj;
            // quick, to onRepair!
            %obj.setImageLoaded(%slot, true);
         }
         else
         {
            // there is no target in range, and the player isn't damaged
            if(!%obj.errMsgSent)
            {
               // send an error message only once
               messageClient(%obj.client, 'MsgRepairPackNoTarget', '\c2No target to repair.');
               %obj.errMsgSent = true;
            }
            stopRepairing(%obj);
         }
      }
      else
      {
         // z0dd - ZOD, 5/19/03. No repair pack on their back, unmount gun.
         %obj.setImageTrigger(%slot, false);
         %obj.unmountImage(%slot);
      }
   }
   else
   {
      // z0dd - ZOD, 5/19/03. No repair pack on their back, unmount gun.
      %obj.setImageTrigger(%slot, false);
      %obj.unmountImage(%slot);
   }
}

function t1RepairGunImage::onRepair(%this,%obj,%slot)
{
   // this = t1RepairGunImage datablock
   // obj = player wielding the repair gun
   // slot = weapon slot

   if(%obj.getEnergyLevel() <= %this.cutOffEnergy)
   {
      stopRepairing(%obj);
      return;
   }
   // reset the flag that indicates an error message has been sent
   %obj.errMsgSent = false;
   %target = %obj.repairing;
   if(!%target)
   {
      // no target -- whoops! never mind
      stopRepairing(%obj);
   }
   else
   {
      %target.repairedBy = %obj.client;  //keep track of who last repaired this item
      if(%obj.repairing == %obj)
      {
         // player is self-repairing
         if(%obj.getDamageLevel())
         {
            if(!%obj.selfRepairing)
            {
               // no need for a projectile, just send a message and up the repair rate
               messageClient(%obj.client, 'MsgRepairPackPlayerSelfRepair', '\c2Repairing self.');
               %obj.selfRepairing = true;
               startRepairing(%obj, true);
            }
         }
         else
         {
            messageClient(%obj.client, 'MsgRepairPackSelfDone', '\c2Repairs completed on self.');
            stopRepairing(%obj);
            %obj.errMsgSent = true;
         }
      }
      else
      {
         // make sure we still have a target -- more vector fun!!!
         %muzVec      = %obj.getMuzzleVector(%slot);
         %muzNVec     = VectorNormalize(%muzVec);
         %repairRange = DefaultRepairBeam.beamRange;
         %muzScaled   = VectorScale(%muzNVec, %repairRange);
         %muzPoint    = %obj.getMuzzlePoint(%slot);
         %rangeEnd    = VectorAdd(%muzPoint, %muzScaled);

         %searchMasks = $TypeMasks::PlayerObjectType | $TypeMasks::VehicleObjectType | 
                        $TypeMasks::StaticShapeObjectType | $TypeMasks::TurretObjectType;

         //AI hack to help "fudge" the repairing stuff...
         if (%obj.client.isAIControlled() && isObject(%obj.client.repairObject) && %obj.client.repairObject == %obj.repairing)
         {
            %repTgt = %obj.client.repairObject;
            %repPoint = %repTgt.getAIRepairPoint();
            if (%repPoint $= "0 0 0")
               %repPoint = %repTgt.getWorldBoxCenter();
            %repTgtVector = VectorNormalize(VectorSub(%muzPoint, %repPoint));
            %aimVector = VectorNormalize(VectorSub(%muzPoint, %rangeEnd));
 
            //if the dot product is very close (ie. we're aiming in the right direction)
            if (VectorDot(%repTgtVector, %aimVector) > 0.85)
               %scanTarg = ContainerRayCast(%muzPoint, %repPoint, %searchMasks, %obj);
         }
         else
            %scanTarg = ContainerRayCast(%muzPoint, %rangeEnd, %searchMasks, %obj);

         if (%scanTarg)
         {
            %pos = getWords(%scanTarg, 1, 3);
            %obstructMask = $TypeMasks::InteriorObjectType | $TypeMasks::TerrainObjectType;
            %obstruction = ContainerRayCast(%muzPoint, %pos, %obstructMask, %obj);
            if (%obstruction)
               %scanTarg = "0";
         }

         if(%scanTarg)
         {
            // there's still a target out there
            %repTgt = firstWord(%scanTarg);
            // is the target damaged?
            if(%repTgt.getDamageLevel())
            {
               if(%repTgt != %obj.repairing)
               {
                  // the target is not the same as the one we were just repairing
                  // stop repairing old target, start repairing new target
                  stopRepairing(%obj);
                  if(isObject(%obj.repairing))
                     stopRepairing(%obj);
 
                  %obj.repairing = %repTgt;
                  // extract the name of what player is repairing based on what it is
                  // if it's a player, it's the player's name (duh)
                  // if it's an object, look for a nametag
                  // if object has no nametag, just say what it is (e.g. generatorLarge)
                  if(%repTgt.getClassName() $= Player)
                     %tgtName = getTaggedString(%repTgt.client.name);
                  else if(%repTgt.getGameName() !$= "")
                     %tgtName = %repTgt.getGameName();
                  else
                     %tgtName = %repTgt.getDatablock().getName();
                  messageClient(%obj.client, 'MsgRepairPackRepairingObj', '\c2Repairing %1.', %tgtName, %repTgt);
                  startRepairing(%obj, false);
               }
               else
               {
                  // it's the same target as last time
                  // changed to fix "2 players can't repair same object" bug
                  if(%obj.repairProjectile == 0)
                  {
                     if(%repTgt.getClassName() $= Player)
                        %tgtName = getTaggedString(%repTgt.client.name);
                     else if(%repTgt.getGameName() !$= "")
                        %tgtName = %repTgt.getGameName();
                     else
                        %tgtName = %repTgt.getDatablock().getName();
                     messageClient(%obj.client, 'MsgRepairPackRepairingObj', '\c2Repairing %1.', %tgtName, %repTgt);
                     startRepairing(%obj, false);
                  }
               }
               // z0dd - ZOD, 8/9/03. It's enabled, award points
               //if(%repTgt.getDamageState() $= "Enabled")
               //   Game.objectRepaired(%repTgt, %tgtName);
            }
            else
            {
               %rateOfRepair = %this.repairFactorObject;
               if(%repTgt.getClassName() $= Player)
               {
                  %tgtName = getTaggedString(%repTgt.client.name);
                  %rateOfRepair = %this.repairFactorPlayer;
               }
               else if(%repTgt.getGameName() !$= "")
                  %tgtName = %repTgt.getGameName();
               else
                  %tgtName = %repTgt.getDatablock().getName();
               if(%repTgt != %obj.repairing)
               {
                  // it isn't the same object we were repairing previously
                  messageClient(%obj.client, 'MsgRepairPackNotDamaged', '\c2%1 is not damaged.', %tgtName);
               }
               else
               {
                  // same target, but not damaged -- we must be done
                  messageClient(%obj.client, 'MsgRepairPackDone', '\c2Repairs completed.');
                  // z0dd - ZOD, 8/9/03. Award for enabling item, so this is too late
                  Game.objectRepaired(%repTgt, %tgtName);
               }
               %obj.errMsgSent = true;
               stopRepairing(%obj);
            }
         }
         else
         {
            // whoops, we lost our target
            messageClient(%obj.client, 'MsgRepairPackLostTarget', '\c2Repair target no longer in range.');
            stopRepairing(%obj);
         }
      }
   }
}

function t1RepairGunImage::onDeactivate(%this,%obj,%slot)
{
   stopRepairing(%obj);
}

function stopRepairing(%player)
{
   // %player = the player who was using the repair pack

   if(%player.selfRepairing)
   {
      // there is no projectile for self-repairing
      %player.setRepairRate(%player.getRepairRate() - %player.repairingRate);
      %player.selfRepairing = false;
   }
   else if(%player.repairing > 0)
   {
      // player was repairing something else
      //if(%player.repairing.beingRepaired > 0)
      //{
         // don't decrement this stuff if it's already at 0 -- though it shouldn't be
         //%player.repairing.beingRepaired--;
         %player.repairing.setRepairRate(%player.repairing.getRepairRate() - %player.repairingRate);
      //}
      if(%player.repairProjectile > 0)
      {
         // is there a repair projectile? delete it
         %player.repairProjectile.delete();
         %player.repairProjectile = 0;
      }
   }
   %player.repairing = 0;
   %player.repairingRate = 0;
   %player.setImageTrigger($WeaponSlot, false);
   %player.setImageLoaded($WeaponSlot, false);
}

function startRepairing(%player, %self)
{
   // %player = the player who was using the repair pack
   // %self = boolean -- is player repairing him/herself?

   if(%self)
   {
      // one repair, hold the projectile
      %player.setRepairRate(%player.getRepairRate() + t1RepairGunImage.repairFactorPlayer);
      %player.selfRepairing = true;
      %player.repairingRate = t1RepairGunImage.repairFactorPlayer;
   }
   else
   {
      //if(%player.repairing.beingRepaired $= "")
      //   %player.repairing.beingRepaired = 1;
      //else
      //   %player.repairing.beingRepaired++;

      //AI hack...
      if (%player.client.isAIControlled() && %player.client.repairObject == %player.repairing)
      {
         %initialPosition  = %player.getMuzzlePoint($WeaponSlot);
         %initialDirection = VectorSub(%initialPosition, %player.repairing.getWorldBoxCenter());
      }
      else
      {
         %initialDirection = %player.getMuzzleVector($WeaponSlot);
         %initialPosition  = %player.getMuzzlePoint($WeaponSlot);
      }
      if(%player.repairing.getClassName() $= Player)
         %repRate = t1RepairGunImage.repairFactorPlayer;
      else
         %repRate = t1RepairGunImage.repairFactorObject;
      %player.repairing.setRepairRate(%player.repairing.getRepairRate() + %repRate);
 
      %player.repairingRate = %repRate;
      %player.repairProjectile = new RepairProjectile() {
         dataBlock = DefaultRepairBeam;
         initialDirection = %initialDirection;
         initialPosition  = %initialPosition;
         sourceObject     = %player;
         sourceSlot       = $WeaponSlot;
         targetObject     = %player.repairing;
      };
      // ----------------------------------------------------
      // z0dd - ZOD, 5/27/02. Fix lingering projectile bug
      if(isObject(%player.lastProjectile))
         %player.lastProjectile.delete();

      %player.lastProjectile = %player.repairProjectile;
      // End z0dd - ZOD 
      // ----------------------------------------------------
      MissionCleanup.add(%player.repairProjectile);
   }
}

function serverCmdClientPickVeh(%client, %callName, %index){
   call(%callName, %client, %index);   
}


function buyt1Veh(%client, %index){
   %station = %client.player.atVPad;
   %vpad = %station.vPadObj.getID(); 
   if(!%station.isPowered()){
      messageClient(%client, 'msgStationDenied', '\c2Station has no power. ~wt1sounds/Access_Denied.wav'); 
      return;
   }
   if(%station.isDisabled() || %station.isDestroyed()){
      messageClient(%client, 'msgStationDenied', '\c2Station is disabled.~wt1sounds/Access_Denied.wav'); 
      return;
   }
   if(%vpad.isDisabled() ||  %vpad.isDestroyed()){
      messageClient(%client, 'msgStationDenied', '\c2Vehicle pad is disabled.~wt1sounds/Access_Denied.wav');
      return;
   }
   switch(%index){
      case 2: %db = T1ScoutFlyer;
      case 3: %db = T1LAPCFlyer;
      case 4: %db = T1HAPCFlyer;
      default:
      return;
   }
   if(vehicleCheck(%db, %client.team)){
      if(isObject(%station) && isObject(%vpad)){
         if(!%station.isNotReady){
            %mask = $TypeMasks::VehicleObjectType | $TypeMasks::PlayerObjectType | 
                  $TypeMasks::StationObjectType | $TypeMasks::TurretObjectType;
            InitContainerRadiusSearch(vectorAdd(%vpad.getPosition(),"0 0 5"), 10, %mask);
            %clear = 1;
            for (%x = 0; (%obj = containerSearchNext()) != 0; %x++){

               if(%obj != %vpad && %obj != %station){ 
                  if((%obj.getType() & $TypeMasks::VehicleObjectType) && (%obj.getDataBlock().checkIfPlayersMounted(%obj))){
                     %clear = 0;
                     break;
                  }
                  else{
                     %removeObjects[%x] = %obj;

                  }
               }
            }
            if(%clear) {
               %fadeTime = 0;
               for(%i = 0; %i < %x; %i++){
                  if(isObject(%removeObjects[%i])){
                     if(%removeObjects[%i].getType() & $TypeMasks::PlayerObjectType) {
                        %pData = %removeObjects[%i].getDataBlock();
                        %pData.damageObject(%removeObjects[%i], 0, "0 0 0", 1000, $DamageType::VehicleSpawn);
                     }
                     else{
                        %removeObjects[%i].mountable = 0;
                        %removeObjects[%i].startFade( 1000, 0, true );
                        %removeObjects[%i].schedule(1001, "delete");
                        %fadeTime = 1500;
                     }
                  }
               }
               %station.isNotReady = 1;
               schedule(%fadeTime, 0, "makeT1Veh", %client, %db, %station, %vpad);
            }
            else{
               MessageClient(%client, "", 'Can\'t create vehicle. A player is on the creation pad.'); 
            }
         }
         else{
            messageClient(%client, 'msgStationDenied', '\c2Station not ready yet please wait.~wt1sounds/Access_Denied.wav');
         }
      }
      else{
         messageClient(%client, 'msgStationDenied', '\c2Station Obj not found.~wt1sounds/Access_Denied.wav');  
      }
   }
   else{
      messageClient(%client, 'msgStationDenied', '\c2Team limit reached ~wt1sounds/Access_Denied.wav');  
   }
}

function makeT1Veh(%client, %db, %station, %vpad){
   %flyObj = new FlyingVehicle() {
      position = vectorAdd(%vpad.getPosition(), "0 0 4");
      rotation = %vpad.rotation;
      scale = "1 1 1";
      dataBlock = %db;
      team = %client.team;
   };
   MissionCleanup.add(%flyObj);
   vehicleListAdd(%db, %flyObj);
   if(%client.player.lastVehicle){
         %client.player.lastVehicle.lastPilot = "";
         vehicleAbandonTimeOut(%client.player.lastVehicle);
         %client.player.lastVehicle = "";
   }   
   %client.player.lastVehicle = %flyObj;
   %flyObj.lastPilot = %client.player;
   if(%flyObj.getTarget() != -1)
      setTargetSensorGroup(%flyObj.getTarget(), %client.getSensorGroup());
   %flyObj.setCloaked(true);
   %flyObj.schedule(140, "playAudio", 0, VehicleAppearSound);
   %flyObj.schedule(1200, "setCloaked", false);
   commandToClient(%client,'PickVehMenu', 0); 
   if ( %client.isVehicleTeleportEnabled() )
         %flyObj.getDataBlock().schedule(1500, "mountDriver", %flyObj, %client.player);
   schedule(6000, 0, "vpadLockOut", %station);
}

function vpadLockOut(%obj){
   %obj.isNotReady = 0;  
}


$t1wepSub["TargetingLaser"] = "T1TargetingLaser";
$t1wepSub["ELFGun"] = "T1ELF";
$t1wepSub["SniperRifle"] = "T1Sniper";
$t1wepSub["Blaster"] = "T1Blaster";

$t1wepSub["Disc"] = "T1Disc";
$t1wepSub["Plasma"] = "T1Plasma";
$t1wepSub["Mortar"] = "T1Mortar";
$t1wepSub["GrenadeLauncher"] = "T1GL";
$t1wepSub["Chaingun"] = "T1ChainGun";

$t1AmmoWep[0] = "T1Disc";
$t1AmmoWep[1] = "T1Plasma";
$t1AmmoWep[2] = "T1Mortar";
$t1AmmoWep[3] = "T1GL";
$t1AmmoWep[4] = "T1ChainGun";


$t1AmmoWepEQ[0] = "Disc";
$t1AmmoWepEQ[1] = "Plasma";
$t1AmmoWepEQ[2] = "Mortar";
$t1AmmoWepEQ[3] = "GrenadeLauncher";
$t1AmmoWepEQ[4] = "Chaingun";

$t1EngWep[0] = "T1TargetingLaser";
$t1EngWep[1] = "T1ELF";
$t1EngWep[2] = "T1Sniper";
$t1EngWep[3] = "T1Blaster";

$t1EngWepEQ[0] = "TargetingLaser";
$t1EngWepEQ[1] = "ELFGun";
$t1EngWepEQ[2] = "SniperRifle";
$t1EngWepEQ[3] = "Blaster";

$armorArray[0] = LightMaleHumanArmor;
$armorArray[1] = MediumMaleHumanArmor;
$armorArray[2] = HeavyMaleHumanArmor;
$armorArray[3] = LightFemaleHumanArmor;
$armorArray[4] =  MediumFemaleHumanArmor;
$armorArray[5] = HeavyFemaleHumanArmor;
$armorArray[6] = LightMaleBiodermArmor;
$armorArray[7] = MediumMaleBiodermArmor;
$armorArray[8] = HeavyMaleBiodermArmor;

function loadRetInfo(){
   if(!$t1loadRet){ 
      $t1loadRet = 1;

      $WeaponsHudData[$WeaponsHudCount, bitmapName] = "gui/hud_disc";
      $WeaponsHudData[$WeaponsHudCount, itemDataName] = "T1Disc";
      $WeaponsHudData[$WeaponsHudCount, ammoDataName] = "T1DiscAmmo";
      $WeaponsHudData[$WeaponsHudCount, reticle] = "gui/ret_disc";
      $WeaponsHudData[$WeaponsHudCount, visible] = "true";
      $WeaponsHudCount++;

      $WeaponsHudData[$WeaponsHudCount, bitmapName] = "gui/hud_plasma";
      $WeaponsHudData[$WeaponsHudCount, itemDataName] = "T1Plasma";
      $WeaponsHudData[$WeaponsHudCount, ammoDataName] = "T1PlasmaAmmo";
      $WeaponsHudData[$WeaponsHudCount, reticle] = "gui/ret_plasma";
      $WeaponsHudData[$WeaponsHudCount, visible] = "true";
      $WeaponsHudCount++;
      $WeaponsHudData[$WeaponsHudCount, bitmapName] = "gui/hud_mortor";
      $WeaponsHudData[$WeaponsHudCount, itemDataName] = "T1Mortar";
      $WeaponsHudData[$WeaponsHudCount, ammoDataName] = "T1MortarAmmo";
      $WeaponsHudData[$WeaponsHudCount, reticle] = "gui/ret_mortor";
      $WeaponsHudData[$WeaponsHudCount, visible] = "true";
      $WeaponsHudCount++;
      $WeaponsHudData[$WeaponsHudCount, bitmapName] = "gui/hud_grenlaunch";
      $WeaponsHudData[$WeaponsHudCount, itemDataName] = "T1GL";
      $WeaponsHudData[$WeaponsHudCount, ammoDataName] = "T1GrenadeLauncherAmmo";
      $WeaponsHudData[$WeaponsHudCount, reticle] = "gui/ret_grenade";
      $WeaponsHudData[$WeaponsHudCount, visible] = "true";
      $WeaponsHudCount++;
      $WeaponsHudData[$WeaponsHudCount, bitmapName] = "gui/hud_chaingun";
      $WeaponsHudData[$WeaponsHudCount, itemDataName] = "T1Chaingun";
      $WeaponsHudData[$WeaponsHudCount, ammoDataName] = "T1ChaingunAmmo";
      $WeaponsHudData[$WeaponsHudCount, reticle] = "gui/ret_chaingun";
      $WeaponsHudData[$WeaponsHudCount, visible] = "true";
      $WeaponsHudCount++;
      $WeaponsHudData[$WeaponsHudCount, bitmapName] = "gui/hud_sniper";
      $WeaponsHudData[$WeaponsHudCount, itemDataName] = "T1Sniper";
      $WeaponsHudData[$WeaponsHudCount, reticle] = "gui/hud_ret_sniper";
      $WeaponsHudData[$WeaponsHudCount, visible] = "false";
      $WeaponsHudCount++;
      $WeaponsHudData[$WeaponsHudCount, bitmapName] = "gui/hud_elfgun";
      $WeaponsHudData[$WeaponsHudCount, itemDataName] = "T1ELF";
      $WeaponsHudData[$WeaponsHudCount, reticle] = "gui/ret_elf";
      $WeaponsHudData[$WeaponsHudCount, visible] = "true";
      $WeaponsHudCount++;
      $WeaponsHudData[$WeaponsHudCount, bitmapName] = "gui/hud_blaster";
      $WeaponsHudData[$WeaponsHudCount, itemDataName] = "T1Blaster";
      $WeaponsHudData[$WeaponsHudCount, reticle] = "gui/ret_blaster";
      $WeaponsHudData[$WeaponsHudCount, visible] = "true";
      $WeaponsHudCount++;
      $WeaponsHudData[$WeaponsHudCount, bitmapName]   = "gui/hud_targetlaser";
      $WeaponsHudData[$WeaponsHudCount, itemDataName] = "T1TargetingLaser";
      $WeaponsHudData[$WeaponsHudCount, reticle] = "gui/hud_ret_targlaser";
      $WeaponsHudData[$WeaponsHudCount, visible] = "false";
      $WeaponsHudCount++;
 
      $BackpackHudData[$BackpackHudCount, itemDataName] = "t1RepairPack";
      $BackpackHudData[$BackpackHudCount, bitmapName] = "gui/hud_new_packrepair";
      $BackpackHudCount++;

      $BackpackHudData[$BackpackHudCount, itemDataName] = "T1AmmoDeployable";
      $BackpackHudData[$BackpackHudCount, bitmapName] = "gui/hud_new_packinventory";
      $BackpackHudCount++;

      $BackpackHudData[$BackpackHudCount, itemDataName] = "T1RemoteTurret";
      $BackpackHudData[$BackpackHudCount, bitmapName] = "gui/hud_new_packturretout";
      $BackpackHudCount++;

      $BackpackHudData[$BackpackHudCount, itemDataName] = "T1InvyDeployable";
      $BackpackHudData[$BackpackHudCount, bitmapName] = "gui/hud_new_packinventory";
      $BackpackHudCount++;  


      for(%a = 0; %a < 9; %a++){
                     %armor = $armorArray[%a];
         for(%i = 0; %i < 5; %i++){
            %armor.max[$t1AmmoWep[%i]] = %armor.max[$t1AmmoWepEQ[%i]];
            %armor.max[$t1AmmoWep[%i].image.ammo] = %armor.max[$t1AmmoWepEQ[%i].image.ammo];
         }
         for(%i = 0; %i < 4; %i++){
            %armor.max[$t1EngWep[%i]] = %armor.max[$t1EngWepEQ[%i]];
         }
      }
   }
}loadRetInfo();


function t1buyFavorites(%client)
{
   if(isObject(Game)) // z0dd - ZOD, 8/9/03. No armors in Spawn CTF.
   {
      if(Game.class $= SCtFGame)
      {
         buyDeployableFavorites(%client);
         return;
      }
   }
   // z0dd - ZOD, 5/27/03. Check to see if we reached the cap on armors, if so, buy ammo and go away mad.
   if(%client.favorites[0] !$= "Scout" && !$Host::TournamentMode && $LimitArmors)
   {
      if($TeamArmorCount[%client.team, $NameToInv[%client.favorites[0]]] >= $TeamArmorMax)
      {
         messageClient(%client, 'MsgTeamDepObjCount', '\c2Your team has reached the maximum (%2) allotment of %1 armors', %client.favorites[0], $TeamArmorMax);
         T1getAmmoStationLovin(%client);
         return;
      }
   }

   // z0dd - ZOD, 5/27/03. Increase the teams armor count and let the player know whats left etc.
   if(!$Host::TournamentMode && $LimitArmors)
   {
      $TeamArmorCount[%client.team, %client.armor]--;
      $TeamArmorCount[%client.team, $NameToInv[%client.favorites[0]]]++;
      if(%client.favorites[0] !$= "Scout")
         messageClient(%client, 'MsgTeamDepObjCount', '\c2Your team has %1 of %2 %3 armors in use', $TeamArmorCount[%client.team, $NameToInv[%client.favorites[0]]], $TeamArmorMax, %client.favorites[0]);
   }

   // don't forget -- for many functions, anything done here also needs to be done
   // below in buyDeployableFavorites !!!
   %client.player.t1clearInventory();
   %client.setWeaponsHudClearAll();
   %cmt = $CurrentMissionType;
   %eng = %client.player.getEnergyLevel();
   %curArmor = %client.player.getDatablock();
   %curDmgPct = getDamagePercent(%curArmor.maxDamage, %client.player.getDamageLevel());

   // armor
   %client.armor = $NameToInv[%client.favorites[0]];
   %client.player.setArmor( %client.armor );
   %newArmor = %client.player.getDataBlock();
   %client.player.setDamageLevel(%curDmgPct * %newArmor.maxDamage);
   %client.player.setEnergyLevel(%eng);
   %weaponCount = 0;

   // weapons
   for(%i = 0; %i < getFieldCount( %client.weaponIndex ); %i++)
   {
      %inv = $NameToInv[%client.favorites[getField( %client.weaponIndex, %i )]];
      if(!($InvBanList[%cmt, %inv])){
         if( %inv !$= "" )
         {   
            %inv = $t1wepSub[%inv] !$= "" ? $t1wepSub[%inv] : %inv;
            %weaponCount++;
            %client.player.setInventory( %inv, 1 );
         }
         
         // ----------------------------------------------------
         // z0dd - ZOD, 4/24/02. Code optimization.
         if ( %inv.image.ammo !$= "" )
            %client.player.setInventory( %inv.image.ammo, 999 );
         // ----------------------------------------------------
      }
   }
   %client.player.weaponCount = %weaponCount;

   // pack
   %pCh = $NameToInv[%client.favorites[%client.packIndex]];
   if(!($InvBanList[%cmt, %pCh])){
      if ( %pCh $= "" )
         %client.clearBackpackIcon();
      else{
         if(%pch $= "RepairPack"){
               %client.player.setInventory( "t1RepairPack", 1, 1);
         }
         else if(%pch $= "InventoryDeployable"){
               %client.player.setInventory( "T1InvyDeployable", 1, 1);
         }
         else if(%pch $= "TurretIndoorDeployable" || %pch $= "TurretOutdoorDeployable"){
               %client.player.setInventory( "T1RemoteTurret", 1, 1);
         }
         else{
            %client.player.setInventory( %pCh, 1 );
         }
      }
   }

   // if this pack is a deployable that has a team limit, warn the purchaser
	// if it's a deployable turret, the limit depends on the number of players (deployables.cs)
	if(%pCh $= "TurretIndoorDeployable" || %pCh $= "TurretOutdoorDeployable")
		%maxDep = countTurretsAllowed(%pCh);
	else
	   %maxDep = $TeamDeployableMax[%pCh];

   if(%maxDep !$= "")
   {
      %depSoFar = $TeamDeployedCount[%client.player.team, %pCh];
      %packName = %client.favorites[%client.packIndex];

      if(Game.numTeams > 1)
         %msTxt = "Your team has "@%depSoFar@" of "@%maxDep SPC %packName@"s deployed.";
      else
         %msTxt = "You have deployed "@%depSoFar@" of "@%maxDep SPC %packName@"s.";

      messageClient(%client, 'MsgTeamDepObjCount', %msTxt);
   }

   // grenades
   for ( %i = 0; %i < getFieldCount( %client.grenadeIndex ); %i++ )
   {
      if ( !($InvBanList[%cmt, $NameToInv[%client.favorites[getField( %client.grenadeIndex, %i )]]]) )
        %client.player.setInventory( $NameToInv[%client.favorites[getField( %client.grenadeIndex,%i )]], 30 );
   }

   %client.player.lastGrenade = $NameToInv[%client.favorites[getField( %client.grenadeIndex,%i )]];

   // if player is buying cameras, show how many are already deployed
   if(%client.favorites[%client.grenadeIndex] $= "Deployable Camera")
   {
      %maxDep = $TeamDeployableMax[DeployedCamera];
      %depSoFar = $TeamDeployedCount[%client.player.team, DeployedCamera];
      if(Game.numTeams > 1)
         %msTxt = "Your team has "@%depSoFar@" of "@%maxDep@" Deployable Cameras placed.";
      else
         %msTxt = "You have placed "@%depSoFar@" of "@%maxDep@" Deployable Cameras.";
      messageClient(%client, 'MsgTeamDepObjCount', %msTxt);
   }

   // mines
   // -----------------------------------------------------------------------------------------------------
   // z0dd - ZOD, 4/24/02. Old code did not check to see if mines are banned, fixed.
   for ( %i = 0; %i < getFieldCount( %client.mineIndex ); %i++ )
   {
      if ( !($InvBanList[%cmt, $NameToInv[%client.favorites[getField( %client.mineIndex, %i )]]]) )
        %client.player.setInventory( $NameToInv[%client.favorites[getField( %client.mineIndex,%i )]], 30 );
   }
   // -----------------------------------------------------------------------------------------------------
   // miscellaneous stuff -- Repair Kit, Beacons, Targeting Laser
   if ( !($InvBanList[%cmt, RepairKit]) )
      %client.player.setInventory( RepairKit, 1 );
   if ( !($InvBanList[%cmt, Beacon]) )
      %client.player.setInventory( Beacon, 20 ); // z0dd - ZOD, 4/24/02. 400 was a bit much, changed to 20
   if ( !($InvBanList[%cmt, TargetingLaser]) )
      %client.player.setInventory( TargetingLaser, 1 );

   // ammo pack pass -- hack! hack!
   if( %pCh $= "AmmoPack" )
      invAmmoPackPass(%client);
}


function t1buyDeployableFavorites(%client)
{
   %player = %client.player;
	%prevPack = %player.getMountedImage($BackpackSlot);
   %player.t1clearInventory();
   %client.setWeaponsHudClearAll();
   %cmt = $CurrentMissionType;

   // players cannot buy armor from deployable inventory stations
	%weapCount = 0;
   for ( %i = 0; %i < getFieldCount( %client.weaponIndex ); %i++ )
   {
      %inv = $NameToInv[%client.favorites[getField( %client.weaponIndex, %i )]];
      if ( !($InvBanList[DeployInv, %inv]) &&  !$InvBanList[%cmt, %inv])
      {
         %inv = $t1wepSub[%inv] !$= "" ? $t1wepSub[%inv] : %inv;
         %player.setInventory( %inv, 1 );
			// increment weapon count if current armor can hold this weapon
         if(%player.getDatablock().max[%inv] > 0)      
				%weapCount++;
      // ---------------------------------------------
      // z0dd - ZOD, 4/24/02. Code streamlining.
      if ( %inv.image.ammo !$= "" )
         %player.setInventory( %inv.image.ammo, 999 );
      // ---------------------------------------------
	if(%weapCount >= %player.getDatablock().maxWeapons)
		break;
      }
   }
   %player.weaponCount = %weapCount;
   // give player the grenades and mines they chose, beacons, and a repair kit
   for ( %i = 0; %i < getFieldCount( %client.grenadeIndex ); %i++)
   {   
      %GInv = $NameToInv[%client.favorites[getField( %client.grenadeIndex, %i )]];
      %client.player.lastGrenade = %GInv;
      if ( !($InvBanList[DeployInv, %GInv])  &&  !$InvBanList[%cmt, %GInv])
         %player.setInventory( %GInv, 30 );
   }

   // if player is buying cameras, show how many are already deployed
   if(%client.favorites[%client.grenadeIndex] $= "Deployable Camera")
   {
      %maxDep = $TeamDeployableMax[DeployedCamera];
      %depSoFar = $TeamDeployedCount[%client.player.team, DeployedCamera];
      if(Game.numTeams > 1)
         %msTxt = "Your team has "@%depSoFar@" of "@%maxDep@" Deployable Cameras placed.";
      else
         %msTxt = "You have placed "@%depSoFar@" of "@%maxDep@" Deployable Cameras.";
      messageClient(%client, 'MsgTeamDepObjCount', %msTxt);
   }

   for ( %i = 0; %i < getFieldCount( %client.mineIndex ); %i++ )
   {
      %MInv = $NameToInv[%client.favorites[getField( %client.mineIndex, %i )]];
      if ( !($InvBanList[DeployInv, %MInv]) &&  !$InvBanList[%cmt, %MInv])
         %player.setInventory( %MInv, 30 );
   }
   if ( !($InvBanList[DeployInv, Beacon]) && !($InvBanList[%cmt, Beacon]) )
      %player.setInventory( Beacon, 20 ); // z0dd - ZOD, 4/24/02. 400 was a bit much, changed to 20.
   if ( !($InvBanList[DeployInv, RepairKit]) && !($InvBanList[%cmt, RepairKit]) )
      %player.setInventory( RepairKit, 1 );
   if ( !($InvBanList[DeployInv, TargetingLaser]) && !($InvBanList[%cmt, TargetingLaser]) )
      %player.setInventory( TargetingLaser, 1 );

   // players cannot buy deployable station packs from a deployable inventory station
   %packChoice = $NameToInv[%client.favorites[%client.packIndex]];
   if ( !($InvBanList[DeployInv, %packChoice]) && !$InvBanList[%cmt, %packChoice]){
      if(%packChoice $= "RepairPack"){
         %player.setInventory( "t1RepairPack", 1, 1);
      }
      else if(%packChoice $= "TurretIndoorDeployable" || %packChoice $= "TurretOutdoorDeployable"){
            %client.player.setInventory( "T1RemoteTurret", 1, 1);
      }
      else{
         %player.setInventory( %packChoice, 1 );
      }
   }

   // if this pack is a deployable that has a team limit, warn the purchaser
	// if it's a deployable turret, the limit depends on the number of players (deployables.cs)
	if(%packChoice $= "TurretIndoorDeployable" || %packChoice $= "TurretOutdoorDeployable")
		%maxDep = countTurretsAllowed(%packChoice);
	else
	   %maxDep = $TeamDeployableMax[%packChoice];
   if((%maxDep !$= "") && (%packChoice !$= "InventoryDeployable"))
   {
      %depSoFar = $TeamDeployedCount[%client.player.team, %packChoice];
      %packName = %client.favorites[%client.packIndex];

      if(Game.numTeams > 1)
         %msTxt = "Your team has "@%depSoFar@" of "@%maxDep SPC %packName@"s deployed.";
      else
         %msTxt = "You have deployed "@%depSoFar@" of "@%maxDep SPC %packName@"s.";

      messageClient(%client, 'MsgTeamDepObjCount', %msTxt);
   }

   if(%prevPack > 0)
   {
      // if player had a "forbidden" pack (such as a deployable inventory station)
      // BEFORE visiting a deployed inventory station AND still has that pack chosen
      // as a favorite, give it back
      if((%packChoice $= %prevPack.item) && ($InvBanList[DeployInv, %packChoice]))
         %player.setInventory( %prevPack.item, 1 );
   }

   if(%packChoice $= "AmmoPack")
      invAmmoPackPass(%client);
}

//-------------------------------------------------------------------------------------
function T1getAmmoStationLovin(%client)
{
   // z0dd - ZOD, 4/24/02. This function was quite a mess, needed rewrite
   %cmt = $CurrentMissionType;

   // weapons
   for(%i = 0; %i < %client.player.weaponSlotCount; %i++)
   {
      %weapon = %client.player.weaponSlot[%i];
      if ( %weapon.image.ammo !$= "" )
         %client.player.setInventory( %weapon.image.ammo, 999 );
   }

   // grenades
   for(%i = 0; $InvGrenade[%i] !$= ""; %i++) // z0dd - ZOD, 5/27/03. Clear them all in one pass
      %client.player.setInventory($NameToInv[$InvGrenade[%i]], 0);

   for ( %i = 0; %i < getFieldCount( %client.grenadeIndex ); %i++ )
   {
      %client.player.lastGrenade = $NameToInv[%client.favorites[getField( %client.grenadeIndex, %i )]];
   }
   %grenType = %client.player.lastGrenade;
   if(%grenType $= "")
   {
      %grenType = Grenade;
   } 
   if ( !($InvBanList[%cmt, %grenType]) )
      %client.player.setInventory( %grenType, 30 );

   if(%grenType $= "Deployable Camera")
   {
      %maxDep = $TeamDeployableMax[DeployedCamera];
      %depSoFar = $TeamDeployedCount[%client.player.team, DeployedCamera];
      if(Game.numTeams > 1)
         %msTxt = "Your team has "@%depSoFar@" of "@%maxDep@" Deployable Cameras placed.";
      else
         %msTxt = "You have placed "@%depSoFar@" of "@%maxDep@" Deployable Cameras.";
      messageClient(%client, 'MsgTeamDepObjCount', %msTxt);
   }

   // Mines
   for(%i = 0; $InvMine[%i] !$= ""; %i++) // z0dd - ZOD, 5/27/03. Clear them all in one pass
       %client.player.setInventory($NameToInv[$InvMine[%i]], 0);

   for ( %i = 0; %i < getFieldCount( %client.mineIndex ); %i++ )
   {
      %client.player.lastMine = $NameToInv[%client.favorites[getField( %client.mineIndex, %i )]];
   }
   %mineType = %client.player.lastMine;
   if(%mineType $= "")
   {
      %mineType = Mine;
   }
   if ( !($InvBanList[%cmt, %mineType]) )
      %client.player.setInventory( %mineType, 30 );

   // miscellaneous stuff -- Repair Kit, Beacons, Targeting Laser
   if ( !($InvBanList[%cmt, RepairKit]) )
      %client.player.setInventory( RepairKit, 1 );

   if ( !($InvBanList[%cmt, Beacon]) )
      %client.player.setInventory( Beacon, 20 );

   if ( !($InvBanList[%cmt, TargetingLaser]) )
      %client.player.setInventory( TargetingLaser, 1 );

   if( %client.player.getMountedImage($BackpackSlot) $= "AmmoPack" )
      invAmmoPackPass(%client);
}

function ShapeBase::t1clearInventory(%this)
{
   // z0dd - ZOD, 5/18/03. Auto cleanup of weapons and ammo. Streamline
   for(%i = 0; %i < $WeaponsHudCount; %i++)
   {
      %this.setInventory($WeaponsHudData[%i, itemDataName], 0);
      if($WeaponsHudData[%i, ammoDataName] !$= "")
         %this.setInventory($WeaponsHudData[%i, ammoDataName], 0);
   }
   for(%i = 0; $InvGrenade[%i] !$= ""; %i++)
      %this.setInventory($NameToInv[$InvGrenade[%i]], 0);

   for(%i = 0; $InvMine[%i] !$= ""; %i++)
      %this.setInventory($NameToInv[$InvMine[%i]], 0);

   %this.setInventory(RepairKit, 0);
   %this.setInventory(Beacon, 0);

   // take away any pack the player has
   %curPack = %this.getMountedImage($BackpackSlot);
   if(%curPack > 0)
      %this.setInventory(%curPack.item, 0);
}   

//TSShapeInstance::castRay
//memPatch("6bb017","eb00");
//memPatch("6bb1e0","eb00");
//memPatch("6bb1ff","eb00");

//TSShapeInstance::buildPolyList
//memPatch("6bac02","eb00");
//memPatch("6bad48","eb00");
//memPatch("6bad7e","eb00");