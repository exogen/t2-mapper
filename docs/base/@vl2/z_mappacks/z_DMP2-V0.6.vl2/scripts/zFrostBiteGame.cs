// datablock AudioProfile(reactorStrikeSound){
//    filename = "fx/misc/lightning_impact.wav";
//    description = AudioExplosion3d;
// };

datablock LightningData(reactorLightning){
   directDamageType = $DamageType::Lightning;
   directDamage = 50;
   
   strikeTextures[0]  = "special/skyLightning";

   //strikeSound = reactorStrikeSound;
};
datablock ItemData(redLight)
{
   className = Pack;
   catagory = "misc";
   shapeFile = "pack_upgrade_repair.dts";
   mass = 1;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 0.24;
   rotate = false;
   image = "RepairPackImage";

   lightOnlyStatic = true;
   lightType = "PulsingLight";
   lightColor = "1 0 0 1";
   lightTime = 1500;
   lightRadius = 2;

   computeCRC = true;
   emap = true;
};
datablock ParticleData(hotSteamParticle) {
   dragCoefficient = "0";
   windCoefficient = "0";
   gravityCoefficient = "-0.5";
   inheritedVelFactor = "0";
   constantAcceleration = "0";
   lifetimeMS = "4000";
   lifetimeVarianceMS = "500";
   spinSpeed = "1";
   spinRandomMin = "-50";
   spinRandomMax = "50";
   useInvAlpha = "1";
   textureName = "hotSmoke";
   colors[0] = "1 1 1 0.2";
   colors[1] = "1 1 1 0.2";
   colors[2] = "1 1 1 0.2";
   colors[3] = "0.0787402 0.0787402 0.0787402 0.0";
   sizes[0] = "8";
   sizes[1] = "20";
   sizes[2] = "20";
   sizes[3] = "30";
   times[0] = "0.1";
   times[1] = "0.4";
   times[2] = "0.8";
   times[3] = "1";
};

datablock ParticleEmitterData(hotSteamEmitter) {
   ejectionPeriodMS = "40";
   periodVarianceMS = "0";
   ejectionVelocity = "5";
   velocityVariance = "3";
   ejectionOffset = "4";
   ejectionOffsetVariance = "0";
   thetaMin = "10";
   thetaMax = "90";
   phiReferenceVel = "0";
   phiVariance = "360";
   overrideAdvance = "1";
   orientParticles = "0";
   orientOnVelocity = "1";
   particles = "hotSteamParticle";
   lifetimeMS = "0";
   lifetimeVarianceMS = "0";
   reverseOrder = "0";
   alignParticles = "0";
   alignDirection = "0 1 0";
   highResOnly = "1";
};