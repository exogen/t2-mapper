// Simple bonuses

$TR2::midairLevel[0] = 10;
$TR2::midairLevel[1] = 25;


function FlagBonus::evaluate(%this, %passer, %receiver, %flag)
{
   if ($TheFlag.specialPass $= "" && !%flag.onGoal)
      Parent::evaluate(%this, %passer, %receiver, %flag);

   $TheFlag.specialPass = "";
}

//function WeaponBonus::evaluate(%this, %shooter, %victim, %damageType)
//{
//}

////////////////////////////////////////////////////////////////////////////////
// Damage bonus


function G4Bonus::evaluate(%this, %plAttacker, %plVictim, %flag, %damageType, %damageLoc)
{
   if (%plVictim !$= %flag.carrier && %plAttacker !$= %flag.carrier)
      return;

   if (%plAttacker $= "" || %plVictim $= "" || %flag.carrier $= "")
      return;

   // Lock this down a bit
   if (%plVictim.getSpeed() < 3)
      return;
      
   %clAttacker = %plAttacker.client;
   %clVictim = %plVictim.client;
   %victimHeight = %plVictim.getHeight();
   
   if (%clVictim != %clAttacker &&
       %damageType == $DamageType::Disc &&
       %victimHeight > 13)
   {
      if (%plVictim.isAboveSomething(25))
         return;

         // MA effect
    	%newEmitter = new ParticleEmissionDummy(MidairDiscEffect) {
    			position = %plVictim.getTransform();
    			rotation = "1 0 0 0";
    			scale = "0.1 0.1 0.1";
    			dataBlock = "defaultEmissionDummy";
    			emitter = "MidairDiscEmitter";
    			velocity = "1";
    	};
       %newEmitter.schedule(%newEmitter.emitter.lifetimeMS, "delete");

      if (%plVictim == %flag.carrier)
      {
         //Game.playerDroppedFlag(%flag.carrier);
         $TheFlag.specialPass = "MA";
         %plVictim.throwObject(%plVictim.holdingFlag);

         if (%plVictim.team == %plAttacker.team)
         {
            // G4
            TR2Flag::onCollision("",%flag,%plAttacker);
            //%plVictim.forceRespawn = true;
            %plAttacker.gogoKill = true;
            %plVictim.setDamageFlash(0.75);
            %plVictim.applyDamage(1);
            //%plVictim.blowup();
            //Game.onClientKilled(%clVictim, 0, $DamageType::G4);
            serverPlay2D(GadgetSound);
         } else {
            // Crazy flags here
            %numFlags = mFloor(%victimHeight / 7);
            if (%numFlags > 40)
               %numFlags = 40;
               
            Game.emitFlags(%plVictim.getWorldBoxCenter(), mFloor(%victimHeight / 5), %plVictim);

            if (%numFlags >= 30)
               ServerPlay2D(MA3Sound);
            else if (%numFlags >= 13)
               ServerPlay2D(MA2Sound);
            else if (%numFlags >= 3)
               ServerPlay2D(MA1Sound);
               
            messageAll('msgTR2MA', '%1 MA\'s %2.', %clAttacker.name, %clVictim.name);
            return;
         }
      }
      // Otherwise, Rabid Rabbit
      else {
         ServerPlay3D(MonsterSound, %plAttacker.getPosition());
         %plVictim.setDamageFlash(0.75);
         %plVictim.applyDamage(1);
      }
   }
   else return;
      
   Parent::evaluate(%this, %plAttacker, %plVictim, "", %damageType, %damageLoc, 5);
}

function MABonus::evaluate(%this, %clAttacker, %clVictim, %damageType, %damageLoc)
{
   // MA detection
   %plAttacker = %clAttacker.Player;
   %plVictim = %clVictim.Player;
   %victimHeight = %plVictim.getHeight();
   if (%clVictim != %clAttacker &&
       %damageType == $DamageType::Disc &&
       %victimHeight > 10)
   {
      // MA effect
  	  %newEmitter = new ParticleEmissionDummy(MidairDiscEffect) {
    			position = %player.getTransform();
    			rotation = "1 0 0 0";
    			scale = "1 1 1";
    			dataBlock = "defaultEmissionDummy";
    			emitter = "MidairDiscEmitter";
    			velocity = "1";
  	  };
      %newEmitter.schedule(%newEmitter.emitter.lifetimeMS, "delete");

      if (%plVictim == $TheFlag.carrier && %plVictim.team != %plAttacker.team)
      {
         Game.playerDroppedFlag($TheFlag.carrier);
         
         // Crazy flags here
         game.emitFlags(%plVictim, 10);
      }
      else if (%plAttacker == $TheFlag.carrier)
      {
         // Rabid Rabbit here
         %plVictim.setDamageFlash(0.75);
         %plVictim.applyDamage(1);
         %plVictim.blowup();
      }
   }
}

function CollisionBonus::evaluate(%this, %obj, %col)
{
   %client = %obj.client;
     if ($TheFlag.carrier.client == %client)
     {
        // Kidney Thief Steal
        if (%client.team != %col.team)
        {
           if (getSimTime() - $TheFlag.lastKTS >= 3 * 1000)
           {
              $TheFlag.specialPass = "KTS";
              Game.playerDroppedFlag($TheFlag.carrier);
              TR2Flag::onCollision("",$TheFlag,%col);
              $TheFlag.lastKTS = getSimTime();
              %action = "ROBBED";
              %desc = "Kidney Thief Steal";
              %val = 5;
              serverPlay3D(EvilLaughSound, %col.getPosition());
           } else return;
        // Mario Grab
        } else {
           %carrierPos = %obj.getPosition();
           %collidedPos = %col.getPosition();
           %carrierz = getWord(%carrierPos, 2);
           %collidez = getWord(%collidedPos, 2);
           
           // Inverse
           //if (%carrierz > %collidez && %carrierz - %collidez > 2.5)
           //{
              //%flagVel = $TheFlag.carrier.getVelocity();
              //Game.playerDroppedFlag($TheFlag.carrier);
              //%flagx = firstWord(%flagVel) * 4;
              //%flagy = getWord(%flagVel, 1) * 4;
              //%flagz = getWord(%flagVel, 2);
              //%flagz = %flagz + 1500;
              //$TheFlag.applyImpulse($TheFlag.getPosition(), %flagx SPC %flagy SPC %flagz);
           //} else
           // Standard
           if (%carrierz < %collidez && %collidez - %carrierz > 2.8
               && getSimTime() - $TheFlag.lastMario >= 4 * 1000)
           {
              $TheFlag.specialPass = "Mario";
              $TheFlag.lastMario = getSimTime();
              Game.playerDroppedFlag($TheFlag.carrier);
              TR2Flag::onCollision("",$TheFlag,%col);
              %action = "TROUNCED";
              %desc = "Plumber Butt";
              %val = 4;
              serverPlay2D(MarioSound);
           } else return;
        }
     }
     else return;
     
     %this.award("", %col, %obj, %action, %desc, %val);
}

function CreativityBonus::evaluate(%this, %variance, %player)
{
   if (%variance < %this.lastVariance)
   {
      %this.lastVariance = 0;
      %this.lastVarianceLevel = 0;
      return;
   }
   
   if (%variance == %this.lastVariance)
      return;
      
   %this.lastVariance = %variance;
      
   for(%i=%this.varianceLevels - 1; %i>0; %i--)
      if (%variance >= %this.varianceThreshold[%i])
         break;
         
   if (%i < %this.lastVarianceLevel)
   {
      %this.lastVarianceLevel = 0;
      return;
   }
   
   if (%i == %this.lastVarianceLevel)
      return;

   %this.lastVarianceLevel = %i;
   
   $teamScoreCreativity[%player.team] += %this.varianceValue[%i];
   
   // Ugly..hmm
   %this.schedule(1500, "award", "", %player, "", "",
      "Level" SPC %i SPC "Creativity Bonus", %this.varianceValue[%i], %this.varianceSound[%i]);
}
