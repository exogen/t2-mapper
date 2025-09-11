// grenade (thrown by hand) script
// ------------------------------------------------------------------------

datablock AudioProfile(FlareGrenadeBurnSound)
{
   filename = "fx/weapons/grenade_flare_burn.wav";
   description = CloseLooping3d;
   preload = true;
};

datablock AudioProfile(FlareGrenadeExplosionSound)
{
   filename = "fx/weapons/grenade_flare_burn.wav";
   description = CloseLooping3d;
   preload = true;
};

//--------------------------------------------------------------------------
// Particle effects
//--------------------------------------
datablock ParticleData(FlareParticle)
{
   dragCoeffiecient     = 0.0;
   gravityCoefficient   = 0.15;
   inheritedVelFactor   = 0.5;

   lifetimeMS           = 1800;
   lifetimeVarianceMS   = 200;

   textureName          = "special/flareSpark";

   colors[0]     = "1.0 1.0 1.0 1.0";
   colors[1]     = "1.0 1.0 1.0 1.0";
   colors[2]     = "1.0 1.0 1.0 0.0";

   sizes[0]      = 0.6;
   sizes[1]      = 0.3;
   sizes[2]      = 0.1;

   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(FlareEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;

   ejectionVelocity = 1.0;
   velocityVariance = 0.0;

   thetaMin         = 0.0;
   thetaMax         = 90.0;

   orientParticles  = true;
   orientOnVelocity = false;

   particles = "FlareParticle";
};

//--------------------------------------------------------------------------
// Explosion - Flare Grenade
//--------------------------------------
datablock ExplosionData(FlareGrenadeExplosion)
{
   explosionShape = "energy_explosion.dts";
   soundProfile   = FlareGrenadeExplosionSound;
   faceViewer           = true;
   explosionScale = "0.1 0.1 0.1";
};

//--------------------------------------------------------------------------
// Projectile - Flare Grenade
//--------------------------------------
datablock FlareProjectileData(FlareGrenadeProj)
{
   projectileShapeName = "grenade_projectile.dts";
   emitterDelay        = -1;
   directDamage        = 0.0;
   hasDamageRadius     = false;
   kickBackStrength    = 1500;
   useLensFlare        = false;

   sound 			   = FlareGrenadeBurnSound;
   explosion           = FlareGrenadeExplosion;
   velInheritFactor    = 0.5;

   texture[0]          = "special/flare3";
   texture[1]          = "special/LensFlare/flare00";
   size                = 4.0;

   baseEmitter         = FlareEmitter;

   grenadeElasticity = 0.35;
   grenadeFriction   = 0.2;
   armingDelayMS     = 6000;
   muzzleVelocity    = 15.0;
   drag = 0.1;
   gravityMod = 0.15;
};

datablock ItemData(FlareGrenadeThrown)
{
   shapeFile = "grenade.dts";
   mass = 0.7;
   elasticity = 0.2;
   friction = 1;
   pickupRadius = 2;
   maxDamage = 0.4;

   sticky = false;
   gravityMod = 0.15;
   maxVelocity = 10;

   computeCRC = true;

};

datablock ItemData(FlareGrenade)
{
   className = HandInventory;
   catagory = "Handheld";
   shapeFile = "grenade.dts";
   mass = 0.7;
   elasticity = 0.2;
   friction = 1;
   pickupRadius = 2;
   thrownItem = FlareGrenadeThrown;
	pickUpName = "some flare grenades";
	isGrenade = true;

   computeCRC = true;

};

//------------------------------------------------------------------------------
// Functions:
//------------------------------------------------------------------------------
function FlareGrenadeThrown::onCollision( %data, %obj, %col )
{
   // Do nothing...
}

