//--------------------------------------
// TR2Chaingun
//--------------------------------------

//--------------------------------------------------------------------------
// Force-Feedback Effects
//--------------------------------------
datablock EffectProfile(TR2ChaingunSwitchEffect)
{
   effectname = "weapons/TR2Chaingun_activate";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2ChaingunFireEffect)
{
   effectname = "weapons/TR2Chaingun_fire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2ChaingunSpinUpEffect)
{
   effectname = "weapons/TR2Chaingun_spinup";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2ChaingunSpinDownEffect)
{
   effectname = "weapons/TR2Chaingun_spindown";
   minDistance = 2.5;
   maxDistance = 2.5;
};

datablock EffectProfile(TR2ChaingunDryFire)
{
   effectname = "weapons/TR2Chaingun_dryfire";
   minDistance = 2.5;
   maxDistance = 2.5;
};

//--------------------------------------------------------------------------
// Sounds
//--------------------------------------
datablock AudioProfile(TR2ChaingunSwitchSound)
{
   filename    = "fx/weapons/chaingun_activate.wav";
   description = AudioClosest3d;
   preload = true;
   effect = TR2ChaingunSwitchEffect;
};

datablock AudioProfile(TR2ChaingunFireSound)
{
   filename    = "fx/weapons/chaingun_fire.wav";
   description = AudioDefaultLooping3d;
   preload = true;
   effect = TR2ChaingunFireEffect;
};

datablock AudioProfile(TR2ChaingunProjectile)
{
   filename    = "fx/weapons/chaingun_projectile.wav";
   description = ProjectileLooping3d;
   preload = true;
};

datablock AudioProfile(TR2ChaingunImpact)
{
   filename    = "fx/weapons/chaingun_impact.WAV";
   description = AudioClosest3d;
   preload = true;
};

datablock AudioProfile(TR2ChaingunSpinDownSound)
{
   filename    = "fx/weapons/chaingun_spindown.wav";
   description = AudioClosest3d;
   preload = true;
   effect = TR2ChaingunSpinDownEffect;
};

datablock AudioProfile(TR2ChaingunSpinUpSound)
{
   filename    = "fx/weapons/chaingun_spinup.wav";
   description = AudioClosest3d;
   preload = true;
   effect = TR2ChaingunSpinUpEffect;
};

datablock AudioProfile(TR2ChaingunDryFireSound)
{
   filename    = "fx/weapons/chaingun_dryfire.wav";
   description = AudioClose3d;
   preload = true;
   effect = TR2ChaingunDryFire;
};

datablock AudioProfile(ShrikeBlasterProjectileSound)
{
   filename    = "fx/vehicles/shrike_blaster_projectile.wav";
   description = ProjectileLooping3d;
   preload = true;
};


//--------------------------------------------------------------------------
// Splash
//--------------------------------------------------------------------------

datablock ParticleData( TR2ChaingunSplashParticle )
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -1.4;
   lifetimeMS           = 300;
   lifetimeVarianceMS   = 0;
   textureName          = "special/droplet";
   colors[0]     = "0.7 0.8 1.0 1.0";
   colors[1]     = "0.7 0.8 1.0 0.5";
   colors[2]     = "0.7 0.8 1.0 0.0";
   sizes[0]      = 0.05;
   sizes[1]      = 0.2;
   sizes[2]      = 0.2;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData( TR2ChaingunSplashEmitter )
{
   ejectionPeriodMS = 4;
   periodVarianceMS = 0;
   ejectionVelocity = 3;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 50;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 100;
   particles = "TR2ChaingunSplashParticle";
};


datablock SplashData(TR2ChaingunSplash)
{
   numSegments = 10;
   ejectionFreq = 10;
   ejectionAngle = 20;
   ringLifetime = 0.4;
   lifetimeMS = 400;
   velocity = 3.0;
   startRadius = 0.0;
   acceleration = -3.0;
   texWrap = 5.0;

   texture = "special/water2";

   emitter[0] = TR2ChaingunSplashEmitter;

   colors[0] = "0.7 0.8 1.0 0.0";
   colors[1] = "0.7 0.8 1.0 1.0";
   colors[2] = "0.7 0.8 1.0 0.0";
   colors[3] = "0.7 0.8 1.0 0.0";
   times[0] = 0.0;
   times[1] = 0.4;
   times[2] = 0.8;
   times[3] = 1.0;
};

//--------------------------------------------------------------------------
// Particle Effects
//--------------------------------------
datablock ParticleData(TR2ChaingunFireParticle)
{
   dragCoefficient      = 2.75;
   gravityCoefficient   = 0.1;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 550;
   lifetimeVarianceMS   = 0;
   textureName          = "particleTest";
   colors[0]     = "0.46 0.36 0.26 1.0";
   colors[1]     = "0.46 0.36 0.26 0.0";
   sizes[0]      = 0.25;
   sizes[1]      = 0.20;
};

datablock ParticleEmitterData(TR2ChaingunFireEmitter)
{
   ejectionPeriodMS = 6;
   periodVarianceMS = 0;
   ejectionVelocity = 10;
   velocityVariance = 1.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 12;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvance  = true;
   particles = "TR2ChaingunFireParticle";
};

//--------------------------------------------------------------------------
// Explosions
//--------------------------------------
datablock ParticleData(TR2ChaingunExplosionParticle1)
{
   dragCoefficient      = 0.65;
   gravityCoefficient   = 0.3;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 500;
   lifetimeVarianceMS   = 150;
   textureName          = "particleTest";
   colors[0]     = "0.56 0.36 0.26 1.0";
   colors[1]     = "0.56 0.36 0.26 0.0";
   sizes[0]      = 0.0625;
   sizes[1]      = 0.2;
};

datablock ParticleEmitterData(TR2ChaingunExplosionEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;
   ejectionVelocity = 0.75;
   velocityVariance = 0.25;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 60;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   particles = "TR2ChaingunExplosionParticle1";
};




datablock ParticleData(TR2ChaingunImpactSmokeParticle)
{
   dragCoefficient      = 0.0;
   gravityCoefficient   = -0.2;
   inheritedVelFactor   = 0.0;
   constantAcceleration = 0.0;
   lifetimeMS           = 1000;
   lifetimeVarianceMS   = 200;
   useInvAlpha          = true;
   spinRandomMin        = -90.0;
   spinRandomMax        = 90.0;
   textureName          = "particleTest";
   colors[0]     = "0.7 0.7 0.7 0.0";
   colors[1]     = "0.7 0.7 0.7 0.4";
   colors[2]     = "0.7 0.7 0.7 0.0";
   sizes[0]      = 0.5;
   sizes[1]      = 0.5;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(TR2ChaingunImpactSmoke)
{
   ejectionPeriodMS = 8;
   periodVarianceMS = 1;
   ejectionVelocity = 1.0;
   velocityVariance = 0.5;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 35;
   overrideAdvances = false;
   particles = "TR2ChaingunImpactSmokeParticle";
   lifetimeMS       = 50;
};


datablock ParticleData(TR2ChaingunSparks)
{
   dragCoefficient      = 1;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = 0.0;
   lifetimeMS           = 300;
   lifetimeVarianceMS   = 0;
   textureName          = "special/spark00";
   colors[0]     = "0.56 0.36 0.26 1.0";
   colors[1]     = "0.56 0.36 0.26 1.0";
   colors[2]     = "1.0 0.36 0.26 0.0";
   sizes[0]      = 0.6;
   sizes[1]      = 0.2;
   sizes[2]      = 0.05;
   times[0]      = 0.0;
   times[1]      = 0.2;
   times[2]      = 1.0;

};

datablock ParticleEmitterData(TR2ChaingunSparkEmitter)
{
   ejectionPeriodMS = 4;
   periodVarianceMS = 0;
   ejectionVelocity = 4;
   velocityVariance = 2.0;
   ejectionOffset   = 0.0;
   thetaMin         = 0;
   thetaMax         = 50;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 100;
   particles = "TR2ChaingunSparks";
};


datablock ExplosionData(TR2ChaingunExplosion)
{
   soundProfile   = TR2ChaingunImpact;

   emitter[0] = TR2ChaingunImpactSmoke;
   emitter[1] = TR2ChaingunSparkEmitter;

   faceViewer           = false;
};


datablock ShockwaveData(ScoutTR2ChaingunHit)
{
   width = 0.5;
   numSegments = 13;
   numVertSegments = 1;
   velocity = 0.5;
   acceleration = 2.0;
   lifetimeMS = 900;
   height = 0.1;
   verticalCurve = 0.5;

   mapToTerrain = false;
   renderBottom = false;
   orientToNormal = true;

   texture[0] = "special/shockwave5";
   texture[1] = "special/gradient";
   texWrap = 3.0;

   times[0] = 0.0;
   times[1] = 0.5;
   times[2] = 1.0;

   colors[0] = "0.6 0.6 1.0 1.0";
   colors[1] = "0.6 0.3 1.0 0.5";
   colors[2] = "0.0 0.0 1.0 0.0";
};

datablock ParticleData(ScoutTR2ChaingunExplosionParticle1)
{
   dragCoefficient      = 2;
   gravityCoefficient   = 0.0;
   inheritedVelFactor   = 0.2;
   constantAcceleration = -0.0;
   lifetimeMS           = 600;
   lifetimeVarianceMS   = 000;
   textureName          = "special/crescent4";
   colors[0] = "0.6 0.6 1.0 1.0";
   colors[1] = "0.6 0.3 1.0 1.0";
   colors[2] = "0.0 0.0 1.0 0.0";
   sizes[0]      = 0.25;
   sizes[1]      = 0.5;
   sizes[2]      = 1.0;
   times[0]      = 0.0;
   times[1]      = 0.5;
   times[2]      = 1.0;
};

datablock ParticleEmitterData(ScoutTR2ChaingunExplosionEmitter)
{
   ejectionPeriodMS = 10;
   periodVarianceMS = 0;
   ejectionVelocity = 2;
   velocityVariance = 1.5;
   ejectionOffset   = 0.0;
   thetaMin         = 80;
   thetaMax         = 90;
   phiReferenceVel  = 0;
   phiVariance      = 360;
   overrideAdvances = false;
   orientParticles  = true;
   lifetimeMS       = 200;
   particles = "ScoutTR2ChaingunExplosionParticle1";
};

datablock ExplosionData(ScoutTR2ChaingunExplosion)
{
   soundProfile   = blasterExpSound;
   shockwave = ScoutTR2ChaingunHit;
   emitter[0] = ScoutTR2ChaingunExplosionEmitter;
};


//--------------------------------------------------------------------------
// Particle effects
//--------------------------------------


datablock DebrisData( TR2ShellDebris )
{
   shapeName = "weapon_chaingun_ammocasing.dts";

   lifetime = 3.0;

   minSpinSpeed = 300.0;
   maxSpinSpeed = 400.0;

   elasticity = 0.5;
   friction = 0.2;

   numBounces = 3;

   fade = true;
   staticOnMaxBounce = true;
   snapOnMaxBounce = true;
};             


//--------------------------------------------------------------------------
// Projectile
//--------------------------------------
datablock DecalData(TR2ChaingunDecal1)
{
   sizeX       = 0.05;
   sizeY       = 0.05;
   textureName = "special/bullethole1";
};
datablock DecalData(TR2ChaingunDecal2) : TR2ChaingunDecal1
{
   textureName = "special/bullethole2";
};

datablock DecalData(TR2ChaingunDecal3) : TR2ChaingunDecal1
{
   textureName = "special/bullethole3";
};
datablock DecalData(TR2ChaingunDecal4) : TR2ChaingunDecal1
{
   textureName = "special/bullethole4";
};
datablock DecalData(TR2ChaingunDecal5) : TR2ChaingunDecal1
{
   textureName = "special/bullethole5";
};
datablock DecalData(TR2ChaingunDecal6) : TR2ChaingunDecal1
{
   textureName = "special/bullethole6";
};


datablock TracerProjectileData(TR2ChaingunBullet)
{
   doDynamicClientHits = true;

   directDamage        = 0.065;
   directDamageType    = $DamageType::Bullet;
   explosion           = "TR2ChaingunExplosion";
   splash              = TR2ChaingunSplash;

   kickBackStrength  = 0.0;
   sound 				= TR2ChaingunProjectile;

   dryVelocity       = 750.0;
   wetVelocity       = 280.0;
   velInheritFactor  = 1.0;
   fizzleTimeMS      = 3000;
   lifetimeMS        = 3000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 3000;

   tracerLength    = 30.0;//15.0;
   tracerAlpha     = false;
   tracerMinPixels = 6;
   tracerColor     =    211.0/255.0 @ " " @ 215.0/255.0 @ " " @ 120.0/255.0 @ " 0.75";
   //211.0/255.0 @ " " @ 215.0/255.0 @ " " @ 120.0/255.0 @ " 0.75";
	tracerTex[0]  	 = "special/tracer00";
	tracerTex[1]  	 = "special/tracercross";
	tracerWidth     = 0.20;//0.10;
   crossSize       = 0.20;
   crossViewAng    = 0.990;
   renderCross     = true;

   decalData[0] = TR2ChaingunDecal1;
   decalData[1] = TR2ChaingunDecal2;
   decalData[2] = TR2ChaingunDecal3;
   decalData[3] = TR2ChaingunDecal4;
   decalData[4] = TR2ChaingunDecal5;
   decalData[5] = TR2ChaingunDecal6;
};

//--------------------------------------------------------------------------
// Scout Projectile
//--------------------------------------
datablock TracerProjectileData(ScoutTR2ChaingunBullet)
{
   doDynamicClientHits = true;

   directDamage        = 0.125;
   explosion           = "ScoutTR2ChaingunExplosion";
   splash              = TR2ChaingunSplash;

   directDamageType    = $DamageType::ShrikeBlaster;
   kickBackStrength  = 0.0;

   sound = ShrikeBlasterProjectileSound;

   dryVelocity       = 400.0;
   wetVelocity       = 100.0;
   velInheritFactor  = 1.0;
   fizzleTimeMS      = 1000;
   lifetimeMS        = 1000;
   explodeOnDeath    = false;
   reflectOnWaterImpactAngle = 0.0;
   explodeOnWaterImpact      = false;
   deflectionOnWaterImpact   = 0.0;
   fizzleUnderwaterMS        = 3000;

   tracerLength    = 45.0;
   tracerAlpha     = false;
   tracerMinPixels = 6;
   tracerColor     = "1.0 1.0 1.0 1.0";
	tracerTex[0]  	 = "special/shrikeBolt";
	tracerTex[1]  	 = "special/shrikeBoltCross";
	tracerWidth     = 0.55;
   crossSize       = 0.99;
   crossViewAng    = 0.990;
   renderCross     = true;

};

//--------------------------------------------------------------------------
// Ammo
//--------------------------------------

datablock ItemData(TR2ChaingunAmmo)
{
   className = Ammo;
   catagory = "Ammo";
   shapeFile = "ammo_chaingun.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
	pickUpName = "some chaingun ammo";

   computeCRC = false;

};

//--------------------------------------------------------------------------
// Weapon
//--------------------------------------
datablock ShapeBaseImageData(TR2ChaingunImage)
{
   className = WeaponImage;
   shapeFile = "TR2weapon_chaingun.dts";
   item      = TR2Chaingun;
   ammo 	 = TR2ChaingunAmmo;
   projectile = TR2ChaingunBullet;
   projectileType = TracerProjectile;
   emap = true;

   casing              = TR2ShellDebris;
   shellExitDir        = "1.0 0.3 1.0";
   shellExitOffset     = "0.15 -0.56 -0.1";
   shellExitVariance   = 18.0;
   shellVelocity       = 4.0;

   projectileSpread = 5.5 / 1000.0;

   //--------------------------------------
   stateName[0]             = "Activate";
   stateSequence[0]         = "Activate";
   stateSound[0]            = TR2ChaingunSwitchSound;
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

   //--------------------------------------
   stateName[2]               = "NoAmmo";
   stateTransitionOnAmmo[2]   = "Ready";
   stateSpinThread[2]         = Stop;
   stateTransitionOnTriggerDown[2] = "DryFire";

   //--------------------------------------
   stateName[3]         = "Spinup";
   stateSpinThread[3]   = SpinUp;
   stateSound[3]        = TR2ChaingunSpinupSound;
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
   stateSound[4]            = TR2ChaingunFireSound;
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
   stateSound[5]      = TR2ChaingunSpinDownSound;
   stateSpinThread[5] = SpinDown;
   //
   stateTimeoutValue[5]            = 0.4;//1.0;
   stateWaitForTimeout[5]          = false;//true;
   stateTransitionOnTimeout[5]     = "Ready";
   stateTransitionOnTriggerDown[5] = "Spinup";

   //--------------------------------------
   stateName[6]       = "EmptySpindown";
   stateSound[6]      = TR2ChaingunSpinDownSound;
   stateSpinThread[6] = SpinDown;
   //
   stateTimeoutValue[6]        = 0.5;
   stateTransitionOnTimeout[6] = "NoAmmo";
   
   //--------------------------------------
   stateName[7]       = "DryFire";
   stateSound[7]      = TR2ChaingunDryFireSound;
   stateTimeoutValue[7]        = 0.5;
   stateTransitionOnTimeout[7] = "NoAmmo";
};

datablock ItemData(TR2Chaingun)
{
   className    = Weapon;
   catagory     = "Spawn Items";
   shapeFile    = "TR2weapon_chaingun.dts";
   image        = TR2ChaingunImage;
   mass         = 1;
   elasticity   = 0.2;
   friction     = 0.6;
   pickupRadius = 2;
   pickUpName   = "a chaingun";

   computeCRC = true;
   emap = true;
};

