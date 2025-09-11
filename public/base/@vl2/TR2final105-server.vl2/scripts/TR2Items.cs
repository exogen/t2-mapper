exec("scripts/weapons/TR2disc.cs");
exec("scripts/weapons/TR2grenadeLauncher.cs");
exec("scripts/weapons/TR2chaingun.cs");
exec("scripts/weapons/TR2grenade.cs");
exec("scripts/weapons/TR2targetingLaser.cs");
exec("scripts/packs/TR2energypack.cs");
exec("scripts/weapons/TR2shocklance.cs");
exec("scripts/weapons/TR2mortar.cs");

datablock StaticShapeData(TR2DeployedBeacon) : StaticShapeDamageProfile
{
   shapeFile = "beacon.dts";
   explosion = DeployablesExplosion;
   maxDamage = 0.45;
   disabledLevel = 0.45;
   destroyedLevel = 0.45;
   targetNameTag = 'beacon';

   deployedObject = true;

   dynamicType = $TypeMasks::SensorObjectType;

   debrisShapeName = "debris_generic_small.dts";
   debris = SmallShapeDebris;
};

datablock ItemData(RedNexus)
{
   catagory = "Objectives";
   shapefile = "nexus_effect.dts";
   mass = 10;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   icon = "CMDNexusIcon";
   targetTypeTag = 'Nexus';

   computeCRC = false;
};

datablock ItemData(YellowNexus)
{
   catagory = "Objectives";
   shapefile = "nexus_effect.dts";
   mass = 10;
   elasticity = 0.2;
   friction = 0.6;
   pickupRadius = 2;
   icon = "CMDNexusIcon";
   targetTypeTag = 'Nexus';

   computeCRC = false;
};

function serverCmdStartFlagThrowCount(%client, %data)
{
   %client.player.flagThrowStart = getSimTime();
}

function serverCmdEndFlagThrowCount(%client, %data)
{
   if(%client.player.flagThrowStart == 0)
      return;
      
   	%time = getSimTime();
	%result = %time - %client.player.flagThrowStart;
	if( %result >= $TR2::MaxFlagChargeTime )
    {
       %client.player.flagThrowStart = 0;
       return;
    }

   // throwStrength will be how many seconds the key was held
   %throwStrength = (getSimTime() - %client.player.flagThrowStart) / 1000;
   // trim the time to fit between 0.2 and 1.2
   if(%throwStrength > 1.2)
      %throwStrength = 1.2;
   else if(%throwStrength < 0.2)
      %throwStrength = 0.2;

   %client.player.flagThrowStrength = %throwStrength;

   %client.player.flagThrowStart = 0;
}

datablock AudioProfile(LauncherSound)
{
   volume = 1.0;
   filename    = "fx/misc/launcher.wav";
   description = AudioClose3d;
   preload = true;
};

datablock StaticShapeData(Launcher)
{
   catagory = "Objectives";
   className = "Launcher";
   isInvincible = true;
   needsNoPower = true;
   shapeFile = "stackable3m.dts";
   soundEffect = LauncherSound;
   scale = "1 1 0.14";
};

function Launcher::onCollision(%this, %obj, %col)
{
   //echo("LAUNCHER:  " @ %col);
   %newVel = %col.getVelocity();
   %normVel = VectorNormalize(%newVel);
   %speed = %col.getSpeed();
   
   // If the player walks on it, boost him upward
   if (%speed < 30)
   {
      %newVel = %normVel;
      %newVel = VectorScale(%newVel, 10);
      %newVel = setWord(%newVel, 2, 72);
   }
   // If he has decent speed, give him a static boost
   else if (%speed < 100)
   {
      %newVel = %normVel;
      %newVel = VectorScale(%newVel, 100);
   // Otherwise, give him a slightly scaled boost
   } else
      %newVel = VectorScale(%newVel, 1.05);
   //%newVel = setWord(%newVel, 2, getWord(%newVel, 2) * -1);
   //%col.applyImpulse(%col.getWorldBoxCenter(), VectorScale(%newVel, 200));
   %col.setVelocity(%newVel);
   %obj.playAudio(0, %this.soundEffect);
}

datablock TriggerData(cannonTrigger)
{
   tickPeriodMS = 1000;
};

datablock TriggerData(goalZoneTrigger)
{
   tickPeriodMS = 1000;
};

datablock TriggerData(defenseZoneTrigger)
{
   tickPeriodMS = 1000;
};

datablock AudioProfile(CannonShotSound)
{
   volume = 1.0;
   filename    = "fx/misc/cannonshot.wav";
   description = AudioClose3d;
   preload = true;
};

datablock AudioProfile(CannonStartSound)
{
   volume = 1.0;
   filename    = "fx/misc/cannonstart.wav";
   description = AudioClose3d;
   preload = true;
};

function cannonTrigger::onEnterTrigger(%this, %trigger, %obj)
{
   if (%obj.getState $= "Dead")
      return;
      
   %client = %obj.client;
   %obj.playAudio(0, CannonStartSound);
   %obj.inCannon = true;
   %obj.setInvincible(true);
   %client.cannonThread = %this.schedule(500, "ShootCannon", %trigger, %obj);
}

function cannonTrigger::onLeaveTrigger(%this, %trigger, %obj)
{
   %client = %obj.client;
   %obj.setInvincible(false);
   cancel(%client.cannonThread);
}

function cannonTrigger::onTickTrigger(%this, %trigger)
{
}

function cannonTrigger::shootCannon(%this, %trigger, %obj)
{
   %obj.applyImpulse(%obj.getWorldBoxCenter(), "0 0 20000");
   %obj.setInvincible(false);
   %obj.inCannon = false;
   
   %newEmitter = new ParticleEmissionDummy(CannonEffect) {
			position = %trigger.position;
			rotation = %trigger.rotation;
			scale = "1 1 1";
			dataBlock = "defaultEmissionDummy";
			emitter = "CannonEmitter";
			velocity = "1";
	};

   %obj.playAudio(0, CannonShotSound);
   %newEmitter.schedule(%newEmitter.emitter.lifetimeMS, "delete");
}

function goalZoneTrigger::onEnterTrigger(%this, %trigger, %obj)
{
   if (!$TR2::EnableRoles || %trigger.team != %obj.team)
      return;
      
   if (!%obj.client.enableZones)
      return;


   Game.trySetRole(%obj, Goalie);
}

function goalZoneTrigger::onLeaveTrigger(%this, %trigger, %obj)
{
   if (!$TR2::EnableRoles)
     return;
     
   if (!%obj.client.enableZones)
      return;
     
   if (!Game.trySetRole(%obj, Defense))
      Game.trySetRole(%obj, Offense);
}

function defenseZoneTrigger::onEnterTrigger(%this, %trigger, %obj)
{
   if (!$TR2::EnableRoles || %trigger.team != %obj.team)
      return;
      
   if (!%obj.client.enableZones)
      return;


   Game.trySetRole(%obj, Defense);
}

function defenseZoneTrigger::onLeaveTrigger(%this, %trigger, %obj)
{
   if (!$TR2::EnableRoles)
     return;
     
   if (!%obj.client.enableZones)
      return;

   if (!Game.trySetRole(%obj, Offense))
      error("TR2 role change error:  couldn't change to Offense");
}

datablock StaticShapeData(Goal)
{
   className = "Goal";
   catagory = "Objectives";
   shapefile = "goal_panel.dts";
   isInvincible = true;
   needsNoPower = true;
};

datablock StaticShapeData(GoalPost)
{
   className = "GoalPost";
   catagory = "Objectives";
   shapefile = "goal_side.dts";
   isInvincible = true;
   needsNoPower = true;
};

datablock StaticShapeData(GoalCrossbar)
{
   className = "GoalCrossbar";
   catagory = "Objectives";
   shapefile = "goal_top.dts";
   isInvincible = true;
   needsNoPower = true;
};

datablock StaticShapeData(GoalBack)
{
   className = "GoalBack";
   catagory = "Objectives";
   shapefile = "goal_back.dts";
   isInvincible = true;
   needsNoPower = true;
};

datablock StaticShapeData(GoldGoalPost)
{
   className = "GoalPost";
   catagory = "Objectives";
   shapefile = "gold_goal_side.dts";
   isInvincible = true;
   needsNoPower = true;
};

datablock StaticShapeData(GoldGoalCrossbar)
{
   className = "GoalCrossbar";
   catagory = "Objectives";
   shapefile = "gold_goal_top.dts";
   isInvincible = true;
   needsNoPower = true;
};

datablock StaticShapeData(GoldGoalBack)
{
   className = "GoalBack";
   catagory = "Objectives";
   shapefile = "gold_goal_back.dts";
   isInvincible = true;
   needsNoPower = true;
};


datablock StaticShapeData(GoldPole)
{
   className = "GoldPole";
   catagory = "Objectives";
   shapefile = "golden_pole.dts";
   isInvincible = true;
   needsNoPower = true;
};

datablock StaticShapeData(SilverPole)
{
   className = "SilverPole";
   catagory = "Objectives";
   shapefile = "silver_pole.dts";
   isInvincible = true;
   needsNoPower = true;
};

datablock StaticShapeData(Billboard1)
{
   className = "Billboard";
   catagory = "Misc";
   shapefile = "billboard_1.dts";
   isInvincible = true;
   needsNoPower = true;
};

datablock StaticShapeData(Billboard2)
{
   className = "Billboard";
   catagory = "Misc";
   shapefile = "billboard_2.dts";
   isInvincible = true;
   needsNoPower = true;
};

datablock StaticShapeData(Billboard3)
{
   className = "Billboard";
   catagory = "Misc";
   shapefile = "billboard_3.dts";
   isInvincible = true;
   needsNoPower = true;
};

datablock StaticShapeData(Billboard4)
{
   className = "Billboard";
   catagory = "Misc";
   shapefile = "billboard_4.dts";
   isInvincible = true;
   needsNoPower = true;
};


function GoalCrossbar::onCollision(%this, %obj, %col)
{
   return;
   if (%col.getClassName() !$= "Player")
      return;
      
   if (getWord(%col.getPosition(), 2) > getWord(%obj.getPosition(), 2))
   {
      // Ooo...the quick 1-2 punch to defeat a potential exploit
      %this.nudgeObject(%obj, %col, 10);
      %obj.schedule(100, "nudgeObject", %obj, %col, -70);
   }
}

function GoalCrossbar::nudgeObject(%this, %obj, %col, %vertNudge)
{
   %center = $TheFlag.originalPosition;
   
   // Determine if the object is on the front or back part of the crossbar
   %colDist = VectorDist(%col.getPosition(), %center);
   %goalDist = VectorDist(%obj.getPosition(), %center);
   %nudgeDir = (%goalDist > %colDist) ? 1 : -1;
   
   // Nudge the player towards the center of the map
   %nudgeVec = VectorNormalize($TheFlag.originalPosition);
   %nudgeVec = VectorScale(%nudgeVec, %nudgeDir);
   %nudgeVec = VectorScale(%nudgeVec, 40);
   %nudgeVec = setWord(%nudgeVec, 2, %vertNudge);

   %col.setVelocity(%nudgeVec);
}

datablock ForceFieldBareData(TR2defaultForceFieldBare)
{
   fadeMS           = 1000;
   baseTranslucency = 0.80;
   powerOffTranslucency = 0.0;
   teamPermiable    = true;
   otherPermiable   = true;
   color            = "0.0 0.55 0.99";
   powerOffColor    = "0.0 0.0 0.0";
   targetNameTag    = 'Force Field';
   targetTypeTag    = 'ForceField';

   texture[0] = "skins/forcef1";
   texture[1] = "skins/forcef2";
   texture[2] = "skins/forcef3";
   texture[3] = "skins/forcef4";
   texture[4] = "skins/forcef5";

   framesPerSec = 10;
   numFrames = 5;
   scrollSpeed = 15;
   umapping = 1.0;
   vmapping = 0.15;
};

