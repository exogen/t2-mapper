//--------------------------------------------------------------------------
// Targeting laser
// 
//--------------------------------------------------------------------------
datablock EffectProfile(TargetingLaserSwitchEffect)
{
   effectname = "weapons/generic_switch";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TargetingLaserPaintEffect)
{
   effectname = "weapons/targetinglaser_paint";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock AudioProfile(TargetingLaserSwitchSound)
{
   filename    = "fx/weapons/generic_switch.wav";
   description = AudioClosest3d;
   preload = true;
   effect = TargetingLaserSwitchEffect;
};

datablock AudioProfile(TargetingLaserPaintSound)
{
   filename    = "fx/weapons/targetinglaser_paint.wav";
   description = CloseLooping3d;
   preload = true;
   effect = TargetingLaserPaintEffect;
};


//--------------------------------------
// Projectile
//--------------------------------------
datablock TargetProjectileData(BasicTargeter)
{
   directDamage        	= 0.0;
   hasDamageRadius     	= false;
   indirectDamage      	= 0.0;
   damageRadius        	= 0.0;
   velInheritFactor    	= 1.0;

   maxRifleRange       	= 1000;
   beamColor           	= "0.1 1.0 0.1";
								
   startBeamWidth			= 0.20;
   pulseBeamWidth 	   = 0.15;
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


//--------------------------------------
// Rifle and item...
//--------------------------------------
datablock ItemData(TargetingLaser)
{
   className    = Weapon;
   catagory     = "Spawn Items";
   shapeFile    = "weapon_targeting.dts";
   image        = TargetingLaserImage;
   mass         = 1;
   elasticity   = 0.2;
   friction     = 0.6;
   pickupRadius = 2;
	pickUpName = "a targeting laser rifle";

   computeCRC = true;

};

datablock ShapeBaseImageData(TargetingLaserImage)
{
   className = WeaponImage;

   shapeFile = "weapon_targeting.dts";
   item = TargetingLaser;
   offset = "0 0 0";

   projectile = BasicTargeter;
   projectileType = TargetProjectile;
   deleteLastProjectile = true;

	usesEnergy = true;
	minEnergy = 3;

   stateName[0]                     = "Activate";
   stateSequence[0]                 = "Activate";
	stateSound[0]                    = TargetingLaserSwitchSound;
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
   stateTransitionOnTriggerUp[3]    = "Deconstruction";
   stateTransitionOnNoAmmo[3]       = "Deconstruction";
   stateSound[3]                    = TargetingLaserPaintSound;

   stateName[4]                     = "NoAmmo";
   stateTransitionOnAmmo[4]         = "Ready";

   stateName[5]                     = "Deconstruction";
   stateScript[5]                   = "deconstruct";
   stateTransitionOnTimeout[5]      = "Ready";
};
